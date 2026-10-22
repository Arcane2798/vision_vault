import { Ban, Check, CheckCircle2, ClipboardEdit, UserPlus, XCircle } from 'lucide-react';
import type { ActionState } from '@/context/ChatContext';
import type { PendingAction } from '@/types';
import { formatWindow, personRoleLabel } from '@/utils/format';
import { Button } from '@/components/ui/Button';

interface Props {
  action: PendingAction;
  state: ActionState;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATE_TEXT: Partial<Record<ActionState, { text: string; cls: string; Icon: typeof Check }>> = {
  done: { text: 'Done', cls: 'text-ok-fg', Icon: CheckCircle2 },
  cancelled: { text: 'Cancelled', cls: 'text-ink-3', Icon: Ban },
  expired: { text: 'Replaced by a newer suggestion', cls: 'text-ink-3', Icon: Ban },
};

/** A change the assistant proposes. Nothing happens until the homeowner presses Confirm. */
export function ActionCard({ action, state, error, onConfirm, onCancel }: Props) {
  const addPerson = action.kind === 'add_person';
  const final = STATE_TEXT[state];
  const open = state === 'pending' || state === 'running' || state === 'failed';

  return (
    <div className="mt-2 rounded-lg border border-brand/40 bg-surface-1 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-fg">
        {addPerson ? <UserPlus className="h-3.5 w-3.5" aria-hidden /> : <ClipboardEdit className="h-3.5 w-3.5" aria-hidden />}
        Needs your confirmation
      </p>
      <p className="mt-1 text-sm text-ink-1">{action.summary}</p>

      {action.kind === 'request' ? (
        <p className="mt-1 break-all font-mono text-[11px] text-ink-3">
          {action.method} {action.path}
        </p>
      ) : (
        <dl className="mt-1.5 space-y-0.5 text-xs text-ink-2">
          {action.prefill?.name && (
            <div>
              <dt className="inline text-ink-3">Name: </dt>
              <dd className="inline">{action.prefill.name}</dd>
            </div>
          )}
          <div>
            <dt className="inline text-ink-3">Role: </dt>
            <dd className="inline">{personRoleLabel[action.prefill?.role === 'family' ? 'family' : 'guest']}</dd>
          </div>
          {action.prefill?.role !== 'family' && (
            <div>
              <dt className="inline text-ink-3">Allowed: </dt>
              <dd className="inline">{formatWindow(action.prefill?.validFrom ?? null, action.prefill?.validTo ?? null)}</dd>
            </div>
          )}
          <p className="pt-1 text-ink-3">Not registered yet - the form needs face photos.</p>
        </dl>
      )}

      {state === 'failed' && error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-danger-fg">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {open ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" icon={addPerson ? <UserPlus className="h-4 w-4" /> : <Check className="h-4 w-4" />} loading={state === 'running'} onClick={onConfirm}>
            {addPerson ? 'Open form' : state === 'failed' ? 'Try again' : 'Confirm'}
          </Button>
          <Button size="sm" variant="ghost" disabled={state === 'running'} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : (
        final && (
          <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${final.cls}`}>
            <final.Icon className="h-3.5 w-3.5" aria-hidden />
            {final.text}
          </p>
        )
      )}
    </div>
  );
}
