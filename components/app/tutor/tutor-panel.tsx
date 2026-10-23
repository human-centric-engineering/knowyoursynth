'use client';

/**
 * The tutor panel on the synth page (`f-tutor` t-56), under the Inspector where the prototype's sat
 * (`prototype/src/ui/Tutor.jsx`): the conversation, suggested questions to start from, a chip under each answer that
 * proposed a change, a pattern (t-84) or designed a sound, the sources under each answer (`f-tutor-knowledge` t-60), and the day's
 * allowance.
 *
 * The prototype had two modes, Ask and Design a sound, because each sent its own prompt. Here the tutor picks its tool
 * from the question, so there is one composer, and the suggestions carry both kinds. Its Claude-account and permission
 * copy is gone: the tutor runs on the app's own provider, and signing in is what it needs. The turn itself is
 * `useTutorChat`; this is only what is shown.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';

import {
  patternLabel,
  patternRows,
  proposalLabel,
  proposalRows,
  type TutorDesign,
} from '@/components/app/tutor/apply';
import { TutorSources } from '@/components/app/tutor/sources';
import {
  useTutorChat,
  type TutorChat,
  type TutorHost,
  type TutorMessage,
} from '@/components/app/tutor/use-tutor-chat';
import { FieldHelp } from '@/components/ui/field-help';
import type { Pattern } from '@/lib/app/sequencer/pattern';
import type { SynthDef } from '@/lib/app/synths/contract';
import type { PanelState } from '@/lib/app/synths/lib/patch';
import { MAX_TUTOR_MESSAGE_CHARS } from '@/lib/app/tutor/request';

/** The most rows a chip lists before "and n more". */
const MAX_ROWS = 6;

const SUGGESTIONS = [
  'Why does this sound the way it does?',
  'How do I make it darker and rounder?',
  'What should I change to make it more aggressive?',
  'Design a deep, wobbling dub bass',
  'Design a glassy bell with a long tail',
] as const;

export interface TutorPanelProps {
  /** The synth's definition, with its notes on. */
  def: SynthDef;
  panel: PanelState;
  /** The designed sound open on the panel, if any. */
  designedId: string | null;
  /** `null` while the session is still being read. */
  signedIn: boolean | null;
  /** Sign-in, coming back to this synth. */
  signInHref: string;
  setPanel: (panel: PanelState) => void;
  openDesign: (design: TutorDesign) => () => void;
  /** The pattern open in the sequencer, which the tutor reads and may propose a new one for. */
  pattern: Pattern | null;
  /** The tempo a knob on the panel sets, which a pattern plays at; null on a synth without one. */
  tempo: number | null;
  setPattern: TutorHost['setPattern'];
  /** A question to put in the composer (the library's "ask the tutor"); `n` makes the same text ask again. */
  ask?: { text: string; n: number } | null;
  /** In a bottom sheet (`f-phone-and-tablet` t-66): fill it, the conversation taking the room the composer leaves. */
  fill?: boolean;
}

const panelClass =
  'flex flex-col gap-3 rounded-xl border border-(--kys-line) bg-(--kys-surface) p-4';
const smallBtn =
  'rounded-md border border-(--kys-line) px-2.5 py-1 text-[13px] text-(--kys-muted) enabled:hover:text-(--kys-text) disabled:opacity-40';

export function TutorPanel(props: TutorPanelProps) {
  const { signedIn, signInHref } = props;
  if (signedIn !== true)
    return (
      <section id="tutor" aria-labelledby="tutor-h" className={panelClass}>
        <h2 id="tutor-h" className="kys-label text-(--kys-muted)">
          AI tutor
        </h2>
        {signedIn === null ? (
          <p className="text-sm text-(--kys-faint)">Loading the tutor…</p>
        ) : (
          <p className="text-sm text-(--kys-muted)">
            The tutor explains the patch on the panel, suggests changes you can apply and undo, and
            designs new patches with a lesson.{' '}
            <Link href={signInHref} className="text-(--kys-accent) underline underline-offset-2">
              Sign in
            </Link>{' '}
            to ask it. It&apos;s free, with a daily allowance.
          </p>
        )}
      </section>
    );
  return <SignedInTutor {...props} />;
}

function SignedInTutor({
  def,
  panel,
  designedId,
  setPanel,
  openDesign,
  pattern,
  tempo,
  setPattern,
  ask,
  fill = false,
}: TutorPanelProps) {
  const chat = useTutorChat({
    def,
    panel,
    designedId,
    setPanel,
    openDesign,
    pattern,
    tempo,
    setPattern,
  });
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const spent = chat.allowance?.remaining === 0;
  const closed = spent || chat.resuming;

  // The library's "ask the tutor": put the question in the composer, ready to finish. Not sent: each question counts
  // against the day's allowance, so the learner sends it. The page has scrolled the panel into view.
  useEffect(() => {
    if (!ask?.text) return;
    // `maxLength` does not cut a value set from code, and the route refuses a longer question. A cut through a
    // surrogate pair would leave half a character, so a lone high surrogate at the end goes too.
    setDraft(ask.text.slice(0, MAX_TUTOR_MESSAGE_CHARS).replace(/[\uD800-\uDBFF]$/, ''));
    input.current?.focus({ preventScroll: true });
  }, [ask]);

  // Follow the conversation as it grows, as a chat does.
  const last = chat.messages[chat.messages.length - 1];
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [
    chat.messages.length,
    last?.text,
    last?.proposal,
    last?.pattern,
    last?.design,
    last?.sources,
    last?.error,
  ]);

  const submit = () => {
    if (!draft.trim() || chat.busy || closed) return;
    void chat.send(draft);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section
      id="tutor"
      aria-labelledby="tutor-h"
      className={`${panelClass} ${fill ? 'h-full min-h-0' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="tutor-h" className="kys-label text-(--kys-muted)">
          AI tutor
        </h2>
        {chat.allowance && (
          <span className="font-mono text-xs text-(--kys-faint)">
            {chat.allowance.remaining} of {chat.allowance.limit} questions left today
          </span>
        )}
      </div>

      {(chat.messages.length > 0 || chat.busy) && (
        <div
          ref={log}
          role="log"
          aria-live="polite"
          aria-label="Conversation with the tutor"
          className={`kys-scroll flex flex-col gap-2.5 overflow-y-auto pr-1 ${fill ? 'min-h-0 flex-1' : 'max-h-[380px]'}`}
        >
          {chat.messages.map((m, i) => (
            <Message
              key={m.id}
              message={m}
              chat={chat}
              def={def}
              endsTurn={chat.messages[i + 1]?.role !== 'assistant'}
            />
          ))}
          {chat.busy && (
            <p className="text-[13px] text-(--kys-faint)">{chat.status ?? 'Thinking…'}</p>
          )}
        </div>
      )}

      {chat.messages.length === 0 && !chat.busy && !chat.resuming && (
        <>
          <p className="text-[14px] text-(--kys-muted)">
            Ask about the sound on the panel, or describe one and the tutor builds it on the{' '}
            {def.name} with a step-by-step lesson. You choose whether to apply each change, and
            every change can be undone. It can be wrong, so trust your ears.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setDraft(s);
                  input.current?.focus();
                }}
                className="rounded-full border border-(--kys-line) px-2.5 py-1 text-[12.5px] text-(--kys-muted) hover:text-(--kys-text)"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {spent && (
        <p role="status" className="text-[13.5px] text-(--kys-muted)">
          That&apos;s all of today&apos;s questions for the tutor. They come back at midnight UTC.
          The synth and everything else on the page still work.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`flex flex-col gap-2 ${fill ? 'mt-auto' : ''}`}
      >
        <div className="flex items-center gap-1">
          <label htmlFor="tutor-input" className="text-sm text-(--kys-text)">
            Ask the tutor
          </label>
          <FieldHelp title="Asking the tutor">
            <p>
              Ask why the patch sounds the way it does, how to change it, or for a new patch
              (&ldquo;Design a warm pad&rdquo;). A change it suggests waits for you to apply it, and
              a patch it designs opens on the panel with its lesson. Either can be undone while the
              panel still shows it. It can also write a pattern for the sequencer, or change the one
              you have (&ldquo;Make the second half busier&rdquo;), which waits for you to apply it
              in the same way.
            </p>
            <p className="mt-2">
              Each question counts towards today&apos;s allowance, including one the tutor could not
              answer. Messages go to an AI model provider.
            </p>
          </FieldHelp>
        </div>
        <textarea
          id="tutor-input"
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          maxLength={MAX_TUTOR_MESSAGE_CHARS}
          disabled={closed}
          placeholder={chat.resuming ? 'Loading the conversation…' : 'Ask about this patch…'}
          className="min-w-0 resize-y rounded-md border border-(--kys-line) bg-(--kys-ground) px-3 py-2 text-sm text-(--kys-text) placeholder:text-(--kys-faint) disabled:opacity-60 pointer-coarse:resize-none"
        />
        <div className="flex justify-end">
          {chat.busy ? (
            <button
              type="button"
              onClick={chat.stop}
              className="rounded-md border border-(--kys-line) px-3 py-2 text-sm text-(--kys-muted) hover:text-(--kys-text)"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim() || closed}
              className="rounded-md bg-(--kys-accent) px-3 py-2 text-sm font-semibold text-(--kys-accent-ink) disabled:opacity-40"
            >
              Ask
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function Message({
  message: m,
  chat,
  def,
  endsTurn,
}: {
  message: TutorMessage;
  chat: TutorChat;
  def: SynthDef;
  /**
   * The turn's last answer. A carried-on turn can show two: a line the tutor wrote before it searched ("Let me look
   * that up") is saved as its own, and is no answer to label.
   */
  endsTurn: boolean;
}) {
  // The own-knowledge label goes under a finished answer whose turn found no source.
  const ownKnowledge = endsTurn && !!m.text && !m.answering && !m.error;
  if (m.role === 'note') return <p className="text-[13px] text-(--kys-faint)">{m.text}</p>;
  if (m.role === 'user')
    return (
      <p className="self-end rounded-lg bg-(--kys-raised) px-3 py-2 text-[14px] whitespace-pre-wrap">
        {m.text}
      </p>
    );
  return (
    <div className="rounded-lg bg-(--kys-ground) px-3 py-2.5 text-[14px] leading-relaxed">
      {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
      {m.proposal && <ProposalChip message={m} chat={chat} def={def} />}
      {m.pattern && <PatternChip message={m} chat={chat} />}
      {m.design && <DesignChip message={m} chat={chat} />}
      {(!!m.sources?.length || ownKnowledge) && <TutorSources sources={m.sources ?? []} />}
      {m.error && (
        <p role={m.past ? undefined : 'alert'} className="mt-2 text-[13.5px] text-(--kys-warn)">
          {m.error}
        </p>
      )}
    </div>
  );
}

function ProposalChip({
  message: m,
  chat,
  def,
}: {
  message: TutorMessage;
  chat: TutorChat;
  def: SynthDef;
}) {
  const p = m.proposal;
  if (!p) return null;
  const rows = proposalRows(def, p.basis, p.change);
  const applied = !!p.applied;
  // A later step of the turn may still replace it, so it waits for the turn to finish.
  const waiting = !!m.answering;
  // Whether the panel is still the one it was made for, the turn aside: if not, it will not become ready.
  const fits = chat.canApply({ ...m, answering: false });
  const stale = !applied && !fits;
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-(--kys-line) p-2">
      <ul className="font-mono text-[12px] text-(--kys-muted)">
        {rows.slice(0, MAX_ROWS).map((r) => (
          <li key={r}>{r}</li>
        ))}
        {rows.length > MAX_ROWS && <li>and {rows.length - MAX_ROWS} more</li>}
      </ul>
      {stale ? (
        <p className="text-[13px] text-(--kys-warn)">
          The panel has changed since the tutor worked this out, so it was not applied. Ask again
          and the tutor works from the panel as it is now.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {applied ? (
            <span className="text-[13px] text-(--kys-good)">Applied</span>
          ) : (
            <button
              type="button"
              onClick={() => chat.apply(m)}
              disabled={waiting}
              className="rounded-md border border-(--kys-accent) px-2.5 py-1 text-[13px] font-semibold text-(--kys-accent) enabled:hover:bg-(--kys-accent) enabled:hover:text-(--kys-accent-ink) disabled:opacity-40"
            >
              {proposalLabel(p.change)}
            </button>
          )}
          {waiting && !applied && <WaitingNote />}
          {applied && (
            <button
              type="button"
              onClick={() => chat.undoProposal(m)}
              disabled={!chat.canUndoProposal(m)}
              title={
                chat.canUndoProposal(m)
                  ? undefined
                  : 'The panel has moved on since this was applied'
              }
              className={smallBtn}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PatternChip({ message: m, chat }: { message: TutorMessage; chat: TutorChat }) {
  const p = m.pattern;
  if (!p) return null;
  const rows = patternRows(p.change);
  const applied = !!p.applied;
  const waiting = !!m.answering;
  // Whether the sequencer still holds the pattern it was made from, the turn aside.
  const fits = chat.canApplyPattern({ ...m, answering: false });
  const stale = !applied && !fits;
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-(--kys-line) p-2">
      <ul className="font-mono text-[12px] text-(--kys-muted)">
        {rows.slice(0, MAX_ROWS).map((r) => (
          <li key={r}>{r}</li>
        ))}
        {rows.length > MAX_ROWS && <li>and {rows.length - MAX_ROWS} more</li>}
      </ul>
      {stale ? (
        <p className="text-[13px] text-(--kys-warn)">
          The pattern in the sequencer has changed since the tutor worked this out, so it was not
          applied. Ask again and the tutor works from the pattern as it is now.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {applied ? (
            <span className="text-[13px] text-(--kys-good)">In the sequencer</span>
          ) : (
            <button
              type="button"
              onClick={() => chat.applyPattern(m)}
              disabled={waiting}
              className="rounded-md border border-(--kys-accent) px-2.5 py-1 text-[13px] font-semibold text-(--kys-accent) enabled:hover:bg-(--kys-accent) enabled:hover:text-(--kys-accent-ink) disabled:opacity-40"
            >
              {patternLabel(p.change)}
            </button>
          )}
          {waiting && !applied && <WaitingNote />}
          {applied && (
            <button
              type="button"
              onClick={() => chat.undoPattern(m)}
              disabled={!chat.canUndoPattern(m)}
              title={
                chat.canUndoPattern(m)
                  ? undefined
                  : 'The pattern has moved on since this was applied'
              }
              className={smallBtn}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Said beside a held button, where a disabled button's own tooltip would not reach a keyboard or touch. */
function WaitingNote() {
  return (
    <span className="text-[12.5px] text-(--kys-faint)">Ready when the tutor has finished</span>
  );
}

function DesignChip({ message: m, chat }: { message: TutorMessage; chat: TutorChat }) {
  const d = m.design;
  if (!d) return null;
  // Whether Undo would mean it, the turn aside: if not, waiting will not make it ready.
  const fits = chat.canUndoDesign({ ...m, answering: false });
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-(--kys-line) p-2 text-[13px]">
      <span className={d.undone ? 'text-(--kys-muted)' : 'text-(--kys-good)'}>
        {d.undone ? 'Undone: ' : 'Opened on the panel: '}
        <strong>{d.design.name}</strong>
        {d.count > 1 ? ` (the last of ${d.count})` : ''}
      </span>
      {!d.undone && (
        <button
          type="button"
          onClick={() => chat.undoDesign(m)}
          disabled={!chat.canUndoDesign(m)}
          title={fits ? undefined : 'The panel has moved on since it opened'}
          className={smallBtn}
        >
          Undo
        </button>
      )}
      {!d.undone && m.answering && fits && <WaitingNote />}
    </div>
  );
}
