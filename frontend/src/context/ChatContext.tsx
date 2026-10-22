import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { notifyDataChanged } from '@/hooks/useDataVersion';
import { ApiError } from '@/services/apiClient';
import { chatService, incidentService, peopleService } from '@/services';
import type { ChatMessage, IncidentStatus, PendingAction, Person, PersonInput, PersonPrefill, PersonUpdate, SecurityUpdate } from '@/types';
import { personRoleLabel } from '@/utils/format';
import { useSecurity } from './SecurityContext';

/** pending -> (running) -> done | failed (can retry) | cancelled; expired = a newer suggestion replaced it. */
export type ActionState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired';

export type ChatEntry =
  | { id: number; role: 'user'; content: string; failed?: boolean }
  | { id: number; role: 'assistant'; content: string; action?: PendingAction; actionState?: ActionState; actionError?: string }
  | { id: number; role: 'notice'; tone: 'ok' | 'error' | 'not_configured'; content: string };

interface PersonForm {
  entryId: number;
  prefill: PersonPrefill;
}

interface ChatContextValue {
  open: boolean;
  setOpen(open: boolean): void;
  entries: ChatEntry[];
  sending: boolean;
  send(text: string): void;
  /** re-send the last message that failed */
  retry(): void;
  clear(): void;
  confirmAction(entryId: number): void;
  cancelAction(entryId: number): void;
  /** Add-person form opened from an add_person suggestion */
  personForm: PersonForm | null;
  closePersonForm(): void;
  submitPerson(input: PersonInput): Promise<void>;
}

/** The backend keeps the last 20 messages; sending more is wasted bandwidth. */
const HISTORY_LIMIT = 20;
const VALID_STATUSES: IncidentStatus[] = ['new', 'under_review', 'confirmed', 'dismissed'];

const ChatContext = createContext<ChatContextValue | null>(null);

/** Tells the assistant what happened to its suggestion, so the next answer knows (keeps user/assistant alternation). */
function outcomeNote(e: Extract<ChatEntry, { role: 'assistant' }>): string {
  if (!e.action) return '';
  const what = `"${e.action.summary}"`;
  if (e.actionState === 'done') return `\n\n[The homeowner confirmed ${what} and it was carried out.]`;
  if (e.actionState === 'cancelled') return `\n\n[The homeowner cancelled ${what}.]`;
  if (e.actionState === 'failed') return `\n\n[The homeowner confirmed ${what} but it failed: ${e.actionError ?? 'unknown error'}]`;
  return '';
}

function toHistory(entries: ChatEntry[]): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (const e of entries) {
    if (e.role === 'user' && !e.failed) msgs.push({ role: 'user', content: e.content });
    else if (e.role === 'assistant') msgs.push({ role: 'assistant', content: (e.content || '(no reply)') + outcomeNote(e) });
  }
  const recent = msgs.slice(-HISTORY_LIMIT);
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return recent;
}

/** "/api/incidents/12" or "/incidents/12" -> "/incidents/12" */
const stripApi = (path: string) => path.replace(/^\/api(?=\/)/, '');

/** Keeps the assistant conversation for the browser session and runs the changes the homeowner confirms. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const security = useSecurity();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [personForm, setPersonForm] = useState<PersonForm | null>(null);
  const nextId = useRef(1);
  const sendingRef = useRef(false); // guards double submits before the re-render
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const newId = () => nextId.current++;

  const patchAssistant = useCallback((id: number, patch: Partial<Extract<ChatEntry, { role: 'assistant' }>>) => {
    setEntries((list) => list.map((e) => (e.id === id && e.role === 'assistant' ? { ...e, ...patch } : e)));
  }, []);

  const addNotice = useCallback((tone: 'ok' | 'error', content: string) => {
    setEntries((list) => [...list, { id: newId(), role: 'notice', tone, content }]);
  }, []);

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || sendingRef.current) return;
      const userEntry: ChatEntry = { id: newId(), role: 'user', content };
      const next = [...entriesRef.current, userEntry];
      setEntries(next);
      sendingRef.current = true;
      setSending(true);
      chatService
        .send({ messages: toHistory(next) })
        .then((res) => {
          const action = res.pendingAction ?? undefined;
          setEntries((list) => [
            // one suggestion at a time: a newer one replaces any still waiting
            ...list.map((e) => (action && e.role === 'assistant' && e.actionState === 'pending' ? { ...e, actionState: 'expired' as const } : e)),
            { id: newId(), role: 'assistant', content: res.reply ?? '', action, actionState: action ? 'pending' : undefined },
          ]);
        })
        .catch((err: Error) => {
          const notConfigured = err instanceof ApiError && err.status === 503;
          setEntries((list) => [
            ...list.map((e) => (e.id === userEntry.id ? { ...e, failed: true } : e)),
            { id: newId(), role: 'notice', tone: notConfigured ? 'not_configured' : 'error', content: err.message },
          ]);
        })
        .finally(() => {
          sendingRef.current = false;
          setSending(false);
        });
    },
    [],
  );

  const retry = useCallback(() => {
    const list = entriesRef.current;
    const idx = list.map((e) => e.role).lastIndexOf('user');
    const last = list[idx];
    // only the newest message can be retried, so later conversation is never cut
    if (idx < 0 || last.role !== 'user' || !last.failed || sendingRef.current) return;
    const text = last.content;
    entriesRef.current = list.slice(0, idx); // drop the failed message and its error notice
    setEntries(entriesRef.current);
    send(text);
  }, [send]);

  const clear = useCallback(() => {
    setEntries([]);
    setPersonForm(null);
  }, []);

  /** Runs a confirmed 'request' through the normal services. Only the three changes the assistant may propose are allowed. */
  const runRequest = useCallback(
    async (action: Extract<PendingAction, { kind: 'request' }>) => {
      const path = stripApi(action.path);
      const body = action.body ?? {};
      let m: RegExpMatchArray | null;
      if (action.method === 'PATCH' && (m = path.match(/^\/incidents\/([\w-]+)$/))) {
        const status = body.status as IncidentStatus;
        if (!VALID_STATUSES.includes(status)) throw new Error(`Unknown incident status "${String(body.status)}".`);
        const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : undefined;
        await incidentService.setStatus(m[1], status, notes);
        notifyDataChanged('incidents');
      } else if (action.method === 'PUT' && path === '/security') {
        if (body.level !== undefined && body.level !== 'on' && body.level !== 'off') throw new Error(`Unknown security setting "${String(body.level)}" (use on or off).`);
        const patch: SecurityUpdate = {};
        if (body.level !== undefined) patch.level = body.level as SecurityUpdate['level'];
        if ('offUntil' in body) patch.offUntil = (body.offUntil as string | null) ?? null;
        await security.update(patch);
      } else if (action.method === 'PATCH' && (m = path.match(/^\/people\/(\d+)$/))) {
        await peopleService.update(Number(m[1]), body as PersonUpdate);
        notifyDataChanged('people');
      } else {
        throw new Error(`This change is not supported from the chat (${action.method} ${action.path}).`);
      }
    },
    [security],
  );

  const confirmAction = useCallback(
    (entryId: number) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (entry?.role !== 'assistant' || !entry.action) return;
      if (entry.actionState !== 'pending' && entry.actionState !== 'failed') return;
      const action = entry.action;
      if (action.kind === 'add_person') {
        setPersonForm({ entryId, prefill: action.prefill ?? {} });
        return;
      }
      patchAssistant(entryId, { actionState: 'running', actionError: undefined });
      runRequest(action)
        .then(() => {
          patchAssistant(entryId, { actionState: 'done' });
          addNotice('ok', `Done: ${action.summary}`);
        })
        .catch((err: Error) => {
          patchAssistant(entryId, { actionState: 'failed', actionError: err.message });
          addNotice('error', `Could not do it: ${err.message}`);
        });
    },
    [addNotice, patchAssistant, runRequest],
  );

  const cancelAction = useCallback((entryId: number) => patchAssistant(entryId, { actionState: 'cancelled' }), [patchAssistant]);

  const closePersonForm = useCallback(() => setPersonForm(null), []);

  const submitPerson = useCallback(
    async (input: PersonInput) => {
      const form = personForm;
      const p: Person = await peopleService.create(input); // errors are shown inside the form
      notifyDataChanged('people');
      setPersonForm(null);
      if (form) patchAssistant(form.entryId, { actionState: 'done' });
      addNotice('ok', `Done: added ${p.name} as a ${personRoleLabel[p.role].toLowerCase()}.`);
    },
    [addNotice, patchAssistant, personForm],
  );

  const value = useMemo<ChatContextValue>(
    () => ({ open, setOpen, entries, sending, send, retry, clear, confirmAction, cancelAction, personForm, closePersonForm, submitPerson }),
    [open, entries, sending, send, retry, clear, confirmAction, cancelAction, personForm, closePersonForm, submitPerson],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
