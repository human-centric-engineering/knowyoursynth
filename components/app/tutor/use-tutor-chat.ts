'use client';

/**
 * The tutor's conversation, as the tutor panel runs it (`f-tutor` t-56). Borrowed from BeatBuddy's `useBuddyChat`
 * (`~/code/beatbreaker/components/app/buddy/use-buddy-chat.ts`), with two differences that follow from the tools: a
 * proposal waits for the learner's Apply rather than landing as it arrives, and a designed sound opens as it arrives,
 * as the prototype's did.
 *
 * - **A turn** posts `{ synthId, panel, message, conversationId? }` to `POST /api/v1/tutor/stream` and reads Sunrise's
 *   chat SSE through `parseChatStreamEvent`. `content` builds the reply and `status` shows under it.
 * - **The conversation resumes.** On opening, the panel reads the learner's latest tutor conversation on this synth
 *   (`GET /api/v1/tutor/conversation`) and carries it on, so a visit does not add one more against the admin's
 *   `maxConversationsPerUser`. Each synth keeps its own: another synth's page carries on that synth's.
 * - **A conversation that cannot take the turn is replaced once.** The route's 404 `TUTOR_CONVERSATION_NOT_FOUND`, and
 *   Sunrise's `conversation_length_cap_reached`, refuse a turn before its message is saved, so nothing has been
 *   counted. The turn is sent again, once, on a new conversation. Nothing else is retried: a turn counts against the
 *   allowance once its message is saved, even when the provider then fails (`tutor.md`, The allowance).
 * - **A failure stays in the panel.** Every error ends the turn with a line in the transcript, and nothing else on the
 *   page waits on a turn.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { parseChatStreamEvent } from '@/components/admin/orchestration/chat/chat-events';
import {
  applyProposal,
  checkProposal,
  combine,
  panelInput,
  readDesign,
  readProposal,
  samePanel,
  type PanelState,
  type Proposal,
  type TutorDesign,
} from '@/components/app/tutor/apply';
import { apiClient } from '@/lib/api/client';
import type { SynthDef } from '@/lib/app/synths/contract';
import { presetState } from '@/lib/app/synths/lib/patch';
import { logger } from '@/lib/logging';

/** What the page lends the tutor: the panel as it is now, and the two ways the tutor may change it. */
export interface TutorHost {
  def: SynthDef;
  panel: PanelState;
  /** The designed sound open on the panel, if any (its id). */
  designedId: string | null;
  /** Put this panel on the page, as turning the controls would. */
  setPanel: (panel: PanelState) => void;
  /** Open a designed sound on the panel with its lesson. Returns what puts back what was there before. */
  openDesign: (design: TutorDesign) => () => void;
}

/** A proposal the turn ended with, and whether it is on the panel. */
export interface ProposalChip {
  change: Proposal;
  /** The panel the turn sent, which the proposal was worked out against. */
  basis: PanelState;
  /** While applied: the panel before (what Undo restores) and after (what makes Undo still mean it). */
  applied: { before: PanelState; after: PanelState } | null;
}

/** The sound(s) a turn designed and opened. */
export interface DesignChip {
  /** The last one opened: the one on the panel. */
  design: TutorDesign;
  /** How many the turn opened. One Undo goes back to before the first. */
  count: number;
  /** The panel the design opened with. */
  after: PanelState;
  undone: boolean;
}

export interface TutorMessage {
  id: string;
  /** `note` is the panel speaking: a conversation started again. */
  role: 'user' | 'assistant' | 'note';
  text: string;
  proposal?: ProposalChip;
  design?: DesignChip;
  error?: string;
}

const AllowanceSchema = z.object({
  limit: z.number(),
  used: z.number(),
  remaining: z.number(),
  resetsAt: z.string(),
});
export type TutorAllowanceView = z.infer<typeof AllowanceSchema>;

const ConversationSchema = z.object({
  conversation: z
    .object({
      conversationId: z.string(),
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
    })
    .nullable(),
});

const ErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

/** The learner's lines for what can go wrong, carried over from the prototype where it had one. */
export const TUTOR_ERRORS = {
  generic:
    'The tutor could not answer just now. The synth and everything else on the page still work.',
  dropped: "The tutor's answer was cut off. The synth and everything else on the page still work.",
  rateLimited: 'Too many questions in a short time. Wait a moment, then ask again.',
  signedOut: 'Your session has ended. Sign in again to ask the tutor.',
  badPanel: 'The tutor could not read the panel as it is. Reload the page, then ask again.',
  refused: 'The tutor declined that one. Try asking it a different way.',
  steps: 'That took the tutor too many steps. Ask for something smaller, or one change at a time.',
  budget:
    'The tutor has reached its budget for this month. The synth and everything else on the page still work.',
  turnCost:
    'That answer cost more than one question is allowed, so it may have stopped early. Try a simpler question.',
  conversations:
    "The tutor can't start another conversation for your account. The synth and everything else on the page still work.",
  stopped: 'Stopped.',
} as const;

/** An `error` frame's code, as a line for the learner. Sunrise's own copy is written for an admin. */
function streamError(code: string): string {
  switch (code) {
    case 'output_blocked':
    case 'input_blocked':
      return TUTOR_ERRORS.refused;
    case 'tool_loop_cap':
      return TUTOR_ERRORS.steps;
    case 'budget_exceeded':
      return TUTOR_ERRORS.budget;
    case 'conversation_cap_reached':
      return TUTOR_ERRORS.conversations;
    default:
      return TUTOR_ERRORS.generic;
  }
}

/** A refusal before the stream, as a line for the learner. The route's own sentences are written for one. */
function httpError(status: number, code: string | null, message: string | null): string {
  if (status === 401) return TUTOR_ERRORS.signedOut;
  if (status === 429 && code === 'RATE_LIMIT_EXCEEDED') return TUTOR_ERRORS.rateLimited;
  if (status === 400) return TUTOR_ERRORS.badPanel;
  if (
    message &&
    (code === 'TUTOR_ALLOWANCE_SPENT' ||
      code === 'TUTOR_UNAVAILABLE' ||
      code === 'TUTOR_REQUEST_TOO_LARGE')
  )
    return message;
  return TUTOR_ERRORS.generic;
}

let nextId = 0;
const newId = () => `t${++nextId}`;

/** What one turn keeps between frames. */
interface Turn {
  assistantId: string;
  basis: PanelState;
  /** A design opened this turn: what one Undo calls to go back to before the first. */
  undo: (() => void) | null;
}

/** How a turn's request ended, for the one resend on a new conversation. */
type Sent = 'done' | 'new-conversation';

export interface TutorChat {
  messages: TutorMessage[];
  /** Still reading the conversation to carry on; the composer waits for it. */
  resuming: boolean;
  busy: boolean;
  status: string | null;
  allowance: TutorAllowanceView | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  /** Whether a proposal can go on the panel now: it is not on it, and the panel is still the one it was made for. */
  canApply: (m: TutorMessage) => boolean;
  apply: (m: TutorMessage) => void;
  /** Whether the chip's Undo still means that change: the panel still shows it. */
  canUndo: (m: TutorMessage) => boolean;
  undo: (m: TutorMessage) => void;
}

/** For a signed-in learner only: the tutor is per person, so the panel does not run this without a session. */
export function useTutorChat(host: TutorHost): TutorChat {
  // The stream outlives renders: it reads the page through a ref, so every frame sees the panel as it is now.
  const hostRef = useRef(host);
  useEffect(() => {
    hostRef.current = host;
  });
  const synthId = host.def.id;

  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [resuming, setResuming] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<TutorAllowanceView | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  /** Each design chip's Undo, by message: a function, so kept out of state. */
  const undos = useRef(new Map<string, () => void>());
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      abort.current?.abort();
    };
  }, []);

  const patch = useCallback((id: string, fn: (m: TutorMessage) => TutorMessage) => {
    if (live.current) setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const refreshAllowance = useCallback(async () => {
    try {
      const next = AllowanceSchema.parse(await apiClient.get('/api/v1/tutor/allowance'));
      if (live.current) setAllowance(next);
    } catch (error) {
      logger.warn('Tutor allowance could not be read', { error });
    }
  }, []);

  // On opening: the day's allowance, and the conversation to carry on.
  useEffect(() => {
    let current = true;
    // Another synth: another conversation.
    conversationId.current = undefined;
    undos.current.clear();
    setMessages([]);
    setResuming(true);
    void refreshAllowance();
    apiClient
      .get('/api/v1/tutor/conversation', { params: { synthId } })
      .then((raw) => {
        const { conversation } = ConversationSchema.parse(raw);
        if (!current || !conversation) return;
        conversationId.current = conversation.conversationId;
        setMessages(
          conversation.messages.map((m) => ({ id: newId(), role: m.role, text: m.content }))
        );
      })
      .catch((error: unknown) => {
        // Nothing to carry on: the first question starts a new conversation.
        logger.warn('Tutor conversation could not be read', { error });
      })
      .finally(() => {
        if (current) setResuming(false);
      });
    return () => {
      current = false;
    };
  }, [synthId, refreshAllowance]);

  /** A frame's tool results: the step's proposals combine and replace the turn's; each design opens. */
  const takeResults = useCallback(
    (turn: Turn, results: { capabilitySlug: string; result: unknown }[]) => {
      const { def } = hostRef.current;
      const proposals = results.flatMap((r) => {
        const p = readProposal(def, r.capabilitySlug, r.result);
        return p ? [p] : [];
      });
      if (proposals.length) {
        const change = combine(proposals);
        patch(turn.assistantId, (m) => ({
          ...m,
          proposal: { change, basis: turn.basis, applied: null },
        }));
      }
      for (const r of results) {
        const design = readDesign(def, r.capabilitySlug, r.result);
        if (!design) continue;
        const undo = hostRef.current.openDesign(design);
        // One Undo goes back to before the turn's first design.
        if (!turn.undo) {
          turn.undo = undo;
          undos.current.set(turn.assistantId, undo);
        }
        // The panel the page opened it with, as the page builds it.
        const after = presetState(def, design.preset);
        patch(turn.assistantId, (m) => ({
          ...m,
          design: { design, count: (m.design?.count ?? 0) + 1, after, undone: false },
        }));
      }
    },
    [patch]
  );

  /** One request for one turn. Resolves how it ended, so a dead conversation can be replaced once. */
  const request = useCallback(
    async (turn: Turn, message: string, controller: AbortController): Promise<Sent> => {
      const fail = (error: string) => patch(turn.assistantId, (m) => ({ ...m, error }));
      const res = await fetch('/api/v1/tutor/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          synthId,
          panel: panelInput(turn.basis),
          message,
          ...(conversationId.current ? { conversationId: conversationId.current } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = ErrorBodySchema.safeParse(await res.json().catch(() => null));
        const code = body.success ? body.data.error.code : null;
        if (res.status === 404 && code === 'TUTOR_CONVERSATION_NOT_FOUND' && conversationId.current)
          return 'new-conversation';
        if (code === 'TUTOR_ALLOWANCE_SPENT' && body.success) {
          const spent = AllowanceSchema.safeParse(body.data.error.details);
          if (spent.success && live.current) setAllowance(spent.data);
        }
        fail(httpError(res.status, code, body.success ? body.data.error.message : null));
        return 'done';
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // A stream that closes with no last word (`done`, `error` or a cost stop) was cut off.
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let at: number;
        while ((at = buffer.indexOf('\n\n')) !== -1) {
          const event = parseChatStreamEvent(buffer.slice(0, at));
          buffer = buffer.slice(at + 2);
          if (!event) continue;
          switch (event.type) {
            case 'start':
              conversationId.current = event.conversationId;
              break;
            case 'content':
              patch(turn.assistantId, (m) => ({ ...m, text: m.text + event.delta }));
              break;
            case 'content_reset':
              patch(turn.assistantId, (m) => ({ ...m, text: '' }));
              break;
            case 'status':
              if (live.current) setStatus(event.message);
              break;
            case 'capability_result':
              takeResults(turn, [event]);
              break;
            case 'capability_results':
              takeResults(turn, event.results);
              break;
            case 'error':
              ended = true;
              if (event.code === 'conversation_length_cap_reached' && conversationId.current) {
                void reader.cancel();
                return 'new-conversation';
              }
              fail(streamError(event.code));
              break;
            case 'budget_exceeded_per_turn':
              ended = true;
              fail(TUTOR_ERRORS.turnCost);
              break;
            case 'done':
              ended = true;
              break;
            default:
              break;
          }
        }
      }
      if (!ended) fail(TUTOR_ERRORS.dropped);
      return 'done';
    },
    [synthId, patch, takeResults]
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy || resuming) return;
      const host = hostRef.current;
      const turn: Turn = { assistantId: newId(), basis: host.panel, undo: null };
      setBusy(true);
      setStatus(null);
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'user', text: message },
        { id: turn.assistantId, role: 'assistant', text: '' },
      ]);
      const controller = new AbortController();
      abort.current = controller;
      try {
        if ((await request(turn, message, controller)) === 'new-conversation') {
          conversationId.current = undefined;
          patch(turn.assistantId, (m) => ({ ...m, text: '' }));
          setMessages((prev) => {
            const at = prev.findIndex((m) => m.id === turn.assistantId);
            const note: TutorMessage = {
              id: newId(),
              role: 'note',
              text: 'That conversation could not go on, so this question starts a new one.',
            };
            return at < 0 ? prev : [...prev.slice(0, at), note, ...prev.slice(at)];
          });
          await request(turn, message, controller);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          patch(turn.assistantId, (m) => ({ ...m, error: TUTOR_ERRORS.stopped }));
        } else {
          logger.warn('Tutor turn failed', { error });
          patch(turn.assistantId, (m) => ({ ...m, error: TUTOR_ERRORS.dropped }));
        }
      } finally {
        abort.current = null;
        if (live.current) {
          setBusy(false);
          setStatus(null);
        }
        void refreshAllowance();
      }
    },
    [busy, resuming, request, patch, refreshAllowance]
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const canApply = useCallback(
    (m: TutorMessage) =>
      !!m.proposal && !m.proposal.applied && samePanel(host.panel, m.proposal.basis),
    [host.panel]
  );

  const apply = useCallback(
    (m: TutorMessage) => {
      const h = hostRef.current;
      const p = m.proposal;
      if (!p || p.applied || !samePanel(h.panel, p.basis)) return;
      // Checked when it arrived, and again against the synth as it is applied.
      const checked = checkProposal(h.def, p.change);
      if (!checked) return;
      const before = h.panel;
      const after = applyProposal(before, checked);
      h.setPanel(after);
      patch(m.id, (x) =>
        x.proposal ? { ...x, proposal: { ...x.proposal, applied: { before, after } } } : x
      );
    },
    [patch]
  );

  const canUndo = useCallback(
    (m: TutorMessage) => {
      if (m.proposal?.applied) return samePanel(host.panel, m.proposal.applied.after);
      const d = m.design;
      return (
        !!d &&
        !d.undone &&
        host.designedId === d.design.id &&
        samePanel(host.panel, d.after) &&
        undos.current.has(m.id)
      );
    },
    [host.panel, host.designedId]
  );

  const undo = useCallback(
    (m: TutorMessage) => {
      if (!canUndo(m)) return;
      if (m.proposal?.applied) {
        hostRef.current.setPanel(m.proposal.applied.before);
        patch(m.id, (x) => (x.proposal ? { ...x, proposal: { ...x.proposal, applied: null } } : x));
        return;
      }
      undos.current.get(m.id)?.();
      undos.current.delete(m.id);
      patch(m.id, (x) => (x.design ? { ...x, design: { ...x.design, undone: true } } : x));
    },
    [canUndo, patch]
  );

  return {
    messages,
    resuming,
    busy,
    status,
    allowance,
    send,
    stop,
    canApply,
    apply,
    canUndo,
    undo,
  };
}
