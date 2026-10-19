'use client';

/**
 * The tutor panel on the synth page (`f-tutor` t-56), under the Inspector where the prototype's sat
 * (`prototype/src/ui/Tutor.jsx`): the conversation, suggested questions to start from, a chip under each answer that
 * proposed a change or designed a sound, and the day's allowance.
 *
 * The prototype had two modes, Ask and Design a sound, because each sent its own prompt. Here the tutor picks its tool
 * from the question, so there is one composer, and the suggestions carry both kinds. Its Claude-account and permission
 * copy is gone: the tutor runs on the app's own provider, and signing in is what it needs. The turn itself is
 * `useTutorChat`; this is only what is shown.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';

import { proposalLabel, proposalRows, type TutorDesign } from '@/components/app/tutor/apply';
import {
  useTutorChat,
  type TutorChat,
  type TutorMessage,
} from '@/components/app/tutor/use-tutor-chat';
import { FieldHelp } from '@/components/ui/field-help';
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
  /** A question to put in the composer (the library's "ask the tutor"); `n` makes the same text ask again. */
  ask?: { text: string; n: number } | null;
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
            The tutor explains the sound on the panel, suggests changes you can apply and undo, and
            designs new sounds with a lesson.{' '}
            <Link href={signInHref} className="text-(--kys-accent) underline underline-offset-2">
              Sign in
            </Link>{' '}
            to ask it.
          </p>
        )}
      </section>
    );
  return <SignedInTutor {...props} />;
}

function SignedInTutor({ def, panel, designedId, setPanel, openDesign, ask }: TutorPanelProps) {
  const chat = useTutorChat({ def, panel, designedId, setPanel, openDesign });
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const spent = chat.allowance?.remaining === 0;
  const closed = spent || chat.resuming;

  // The library's "ask the tutor": put the question in the composer, ready to finish. Not sent: each question counts
  // against the day's allowance, so the learner sends it. The page has scrolled the panel into view.
  useEffect(() => {
    if (!ask?.text) return;
    // `maxLength` does not cut a value set from code, and the route refuses a longer question.
    setDraft(ask.text.slice(0, MAX_TUTOR_MESSAGE_CHARS));
    input.current?.focus({ preventScroll: true });
  }, [ask]);

  // Follow the conversation as it grows, as a chat does.
  const last = chat.messages[chat.messages.length - 1];
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, last?.text, last?.proposal, last?.design]);

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
    <section id="tutor" aria-labelledby="tutor-h" className={panelClass}>
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
          className="kys-scroll flex max-h-[380px] flex-col gap-2.5 overflow-y-auto pr-1"
        >
          {chat.messages.map((m) => (
            <Message key={m.id} message={m} chat={chat} def={def} />
          ))}
          {chat.busy && (
            <p className="text-[13px] text-(--kys-faint)">{chat.status ?? 'Thinking…'}</p>
          )}
        </div>
      )}

      {chat.messages.length === 0 && !chat.busy && !chat.resuming && (
        <>
          <p className="text-[14px] text-(--kys-muted)">
            Ask about the sound on the panel, or describe a sound and the tutor builds it on the{' '}
            {def.name} with a step-by-step lesson. Every change can be undone. Treat what it
            suggests as a starting point and trust your ears.
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
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-1">
          <label htmlFor="tutor-input" className="text-sm text-(--kys-text)">
            Ask the tutor
          </label>
          <FieldHelp title="Asking the tutor">
            <p>
              Ask why the sound is the way it is, how to change it, or for a new sound
              (&ldquo;Design a warm pad&rdquo;). A change it suggests waits for you to apply it, and
              a sound it designs opens on the panel with its lesson. Either can be undone while the
              panel still shows it.
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
          placeholder={chat.resuming ? 'Loading the conversation…' : 'Ask about this sound…'}
          className="min-w-0 resize-y rounded-md border border-(--kys-line) bg-(--kys-ground) px-3 py-2 text-sm text-(--kys-text) placeholder:text-(--kys-faint) disabled:opacity-60"
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
}: {
  message: TutorMessage;
  chat: TutorChat;
  def: SynthDef;
}) {
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
      {m.design && <DesignChip message={m} chat={chat} />}
      {m.error && (
        <p role="alert" className="mt-2 text-[13.5px] text-(--kys-warn)">
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
  const stale = !applied && !waiting && !chat.canApply(m);
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
              title={waiting ? 'The tutor is still answering' : undefined}
              className="rounded-md border border-(--kys-accent) px-2.5 py-1 text-[13px] font-semibold text-(--kys-accent) enabled:hover:bg-(--kys-accent) enabled:hover:text-(--kys-accent-ink) disabled:opacity-40"
            >
              {proposalLabel(p.change)}
            </button>
          )}
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

function DesignChip({ message: m, chat }: { message: TutorMessage; chat: TutorChat }) {
  const d = m.design;
  if (!d) return null;
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
          title={chat.canUndoDesign(m) ? undefined : 'The panel has moved on since it opened'}
          className={smallBtn}
        >
          Undo
        </button>
      )}
    </div>
  );
}
