import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Bot, CheckCircle2, KeyRound, Loader2, Lock, RotateCcw, SendHorizontal, Trash2, X } from 'lucide-react';
import { useChat, type ChatEntry } from '@/context/ChatContext';
import { cn } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { AddPersonModal } from '@/components/people/PersonForms';
import { ActionCard } from './ActionCard';

const ASSISTANT_NAME = 'Viva Bot';

const SUGGESTIONS = ['What happened at the door today?', 'Who is at the door right now?', 'Where is Azhad?', 'Turn security off until midnight for a party'];

/** Slide-over assistant panel, opened from the top bar on every page. */
export function ChatPanel() {
  const chat = useChat();
  const { open, setOpen, entries, sending } = chat;
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // focus the input on open, give focus back on close
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    returnFocus.current?.focus?.();
  }, [open]);

  // Esc closes the panel (unless a dialog such as the Add-person form is open on top)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, sending, open]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || sending) return;
    chat.send(draft);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };

  const lastUser = [...entries].reverse().find((e) => e.role === 'user');
  const lastFailed = lastUser?.role === 'user' && !!lastUser.failed;

  return (
    <>
      {/* on small screens the panel covers the page, so dim it; on desktop the page stays usable beside the chat */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="chat-title"
        aria-hidden={!open}
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface-0 shadow-2xl transition-[transform,visibility] duration-200 sm:w-[26rem]',
          open ? 'visible translate-x-0' : 'invisible translate-x-full',
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-blue-300" aria-hidden>
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="chat-title" className="font-semibold">
              {ASSISTANT_NAME}
            </h2>
            <p className="text-xs text-ink-3">Answers from your home&apos;s records. Changes need your confirmation.</p>
          </div>
          {entries.length > 0 && (
            <Button size="sm" variant="ghost" aria-label="Clear chat" title="Clear chat" onClick={chat.clear} disabled={sending} icon={<Trash2 className="h-4 w-4" />} />
          )}
          <Button size="sm" variant="ghost" aria-label={`Close ${ASSISTANT_NAME}`} onClick={() => setOpen(false)} icon={<X className="h-4 w-4" />} />
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={sending}>
          {entries.length === 0 ? (
            <EmptyChat onPick={(s) => chat.send(s)} disabled={sending} />
          ) : (
            entries.map((e) => <Entry key={e.id} entry={e} />)
          )}
          {sending && (
            <div role="status" className="flex items-center gap-2 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Checking your home&apos;s records…
            </div>
          )}
          {!sending && lastFailed && (
            <Button size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={chat.retry}>
              Try again
            </Button>
          )}
        </div>

        <form onSubmit={submit} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Message {ASSISTANT_NAME}
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about incidents, visitors or who is at the door…"
              className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <Button type="submit" variant="primary" aria-label="Send" disabled={!draft.trim() || sending} icon={<SendHorizontal className="h-4 w-4" />} />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            Text only - no camera images are sent to the AI. Enter to send, Shift+Enter for a new line.
          </p>
        </form>
      </aside>

      {chat.personForm && (
        <AddPersonModal
          initial={chat.personForm.prefill}
          intro="Suggested by Viva Bot. Check the details and add face photos to finish registering."
          onClose={chat.closePersonForm}
          onSubmit={chat.submitPerson}
        />
      )}
    </>
  );
}

function EmptyChat({ onPick, disabled }: { onPick: (s: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Bot className="h-8 w-8 text-ink-3" aria-hidden />
      <div>
        <p className="font-medium">Ask about your home</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-3">Incidents, who is at the door, when a resident was last seen, visitor access and the security level.</p>
      </div>
      <ul className="flex w-full flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              className="w-full rounded-lg border border-line bg-surface-1 px-3 py-2 text-left text-sm text-ink-2 hover:border-brand/50 hover:text-ink-1 disabled:opacity-50"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Entry({ entry }: { entry: ChatEntry }) {
  const chat = useChat();
  if (entry.role === 'user') {
    return (
      <div className="flex flex-col items-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand/20 px-3 py-2 text-sm text-ink-1">{entry.content}</p>
        {entry.failed && <span className="mt-1 text-[11px] text-red-300">Not sent</span>}
      </div>
    );
  }
  if (entry.role === 'notice') return <Notice entry={entry} />;
  return (
    <div className="max-w-[92%]">
      <div className="rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2 text-sm text-ink-1">
        <RichText text={entry.content || '(no reply)'} />
      </div>
      {entry.action && entry.actionState && (
        <ActionCard
          action={entry.action}
          state={entry.actionState}
          error={entry.actionError}
          onConfirm={() => chat.confirmAction(entry.id)}
          onCancel={() => chat.cancelAction(entry.id)}
        />
      )}
    </div>
  );
}

function Notice({ entry }: { entry: Extract<ChatEntry, { role: 'notice' }> }) {
  if (entry.tone === 'not_configured') {
    return (
      <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-amber-200">
        <p className="flex items-center gap-2 font-medium">
          <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
          {ASSISTANT_NAME} is not set up yet
        </p>
        {/* backend detail, e.g. "Chat is not configured: add GEMINI_API_KEY to .env" */}
        <p className="mt-1.5 break-words rounded bg-black/30 px-2 py-1 font-mono text-xs">{entry.content || 'The owner has not added an AI key to the backend yet.'}</p>
        <p className="mt-1.5 text-xs text-amber-200/80">The owner adds the key and restarts the backend. Everything else in the dashboard works without it.</p>
      </div>
    );
  }
  const ok = entry.tone === 'ok';
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <p role={ok ? 'status' : 'alert'} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', ok ? 'border-ok/40 bg-ok/10 text-green-300' : 'border-danger/40 bg-danger/10 text-red-300')}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {entry.content}
    </p>
  );
}

/** Plain text with line breaks, "- " bullets and **bold** - enough for the assistant's short answers (no HTML is injected). */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) out.push(<ul key={`ul-${out.length}`} className="my-1 list-disc space-y-0.5 pl-5">{bullets.map((b, i) => <li key={i}>{bold(b)}</li>)}</ul>);
    bullets = [];
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) return void bullets.push(m[1]);
    flush();
    out.push(line.trim() ? <p key={i}>{bold(line)}</p> : <div key={i} className="h-2" />);
  });
  flush();
  return <div className="space-y-0.5 break-words">{out}</div>;
}

function bold(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}
