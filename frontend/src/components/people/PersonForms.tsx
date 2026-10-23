import { useState, type FormEvent, type ReactNode } from 'react';
import type { Person, PersonInput, PersonPrefill, PersonRole, PersonUpdate } from '@/types';
import { fromDateTimeLocal, personRoleLabel, toDateTimeLocal } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

/** Mirrors the backend's valid_person_name (rules.py): it becomes the faces/<name>/ folder. */
const NAME_RE = /^[A-Za-z0-9 _-]{1,40}$/;

function validateName(raw: string): string | undefined {
  const name = raw.trim();
  if (!name) return 'Enter a name.';
  if (!NAME_RE.test(name)) return 'Use 1-40 letters, digits, spaces, "-" or "_".';
  if (name.toLowerCase() === 'unknown') return '"unknown" is reserved.';
  return undefined;
}

function validateWindow(from: string, to: string): string | undefined {
  if (from && to && new Date(from) >= new Date(to)) return 'The end must be after the start.';
  return undefined;
}

const ROLE_HINT: Record<PersonRole, string> = {
  family: 'Residents are always allowed in. No alert is sent.',
  guest: 'Visitors are allowed only inside their time window; outside it the homeowner is alerted.',
};

function RoleSelect({ value, onChange }: { value: PersonRole; onChange: (r: PersonRole) => void }) {
  return (
    <Field label="Role" hint={ROLE_HINT[value]}>
      {(id, describedBy) => (
        <Select id={id} aria-describedby={describedBy} value={value} onChange={(e) => onChange(e.target.value as PersonRole)}>
          <option value="family">{personRoleLabel.family} (family)</option>
          <option value="guest">{personRoleLabel.guest}</option>
        </Select>
      )}
    </Field>
  );
}

function WindowFields({ from, to, onFrom, onTo, error }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; error?: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-ink-2">Allowed time window</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From">
          {(id) => <Input id={id} type="datetime-local" className="[color-scheme:dark]" value={from} onChange={(e) => onFrom(e.target.value)} aria-invalid={!!error} />}
        </Field>
        <Field label="Until">
          {(id) => <Input id={id} type="datetime-local" className="[color-scheme:dark]" value={to} onChange={(e) => onTo(e.target.value)} aria-invalid={!!error} />}
        </Field>
      </div>
      <p className={error ? 'text-xs text-red-700' : 'text-xs text-ink-3'}>{error ?? 'Leave a field empty for no limit on that side.'}</p>
    </fieldset>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

interface AddPersonModalProps {
  onClose: () => void;
  onSubmit: (input: PersonInput) => Promise<void>;
  /** prefilled values, e.g. suggested by the assistant (dates ISO) */
  initial?: PersonPrefill;
  /** short note shown above the form */
  intro?: ReactNode;
}

/** Add a resident or visitor with one or more face photos. */
export function AddPersonModal({ onClose, onSubmit, initial, intro }: AddPersonModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<PersonRole>(initial?.role === 'family' ? 'family' : 'guest');
  const [from, setFrom] = useState(toDateTimeLocal(initial?.validFrom ?? null));
  const [to, setTo] = useState(toDateTimeLocal(initial?.validTo ?? null));
  const [photos, setPhotos] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = validateName(name);
  const windowError = role === 'guest' ? validateWindow(from, to) : undefined;
  const photoError = photos.length === 0 ? 'Add at least one clear photo of the face.' : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameError || windowError || photoError) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        role,
        validFrom: role === 'guest' ? fromDateTimeLocal(from) : undefined,
        validTo: role === 'guest' ? fromDateTimeLocal(to) : undefined,
        photos,
      });
    } catch (err) {
      setError((err as Error).message); // e.g. backend 400 "A person named Ali already exists."
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Add resident or visitor"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="add-person-form" variant="primary" loading={busy}>
            {busy ? 'Uploading…' : 'Add person'}
          </Button>
        </>
      }
    >
      <form id="add-person-form" className="space-y-4" onSubmit={submit} noValidate>
        {intro && <div className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm text-brand">{intro}</div>}
        <Field label="Name" error={touched ? nameError : undefined} hint="Shown on the live video when recognised.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} aria-invalid={touched && !!nameError} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ali" autoFocus={!initial?.name} />}
        </Field>
        <RoleSelect value={role} onChange={setRole} />
        {role === 'guest' && <WindowFields from={from} to={to} onFrom={setFrom} onTo={setTo} error={windowError} />}
        <Field label="Face photos" error={touched ? photoError : undefined} hint="One or more clear, front-facing photos. They stay on this computer.">
          {(id, describedBy) => (
            <input
              id={id}
              type="file"
              accept="image/*"
              multiple
              aria-describedby={describedBy}
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:text-ink-1 hover:file:bg-surface-2"
            />
          )}
        </Field>
        {photos.length > 0 && (
          <p className="text-xs text-ink-3">
            {photos.length} photo{photos.length === 1 ? '' : 's'} selected: {photos.map((p) => p.name).join(', ')}
          </p>
        )}
        <FormError message={error} />
      </form>
    </Modal>
  );
}

/** Change role and/or visitor window (PATCH /api/people/{id}). */
export function EditAccessModal({ person, onClose, onSubmit }: { person: Person; onClose: () => void; onSubmit: (patch: PersonUpdate) => Promise<void> }) {
  const [role, setRole] = useState<PersonRole>(person.role);
  const [from, setFrom] = useState(toDateTimeLocal(person.validFrom));
  const [to, setTo] = useState(toDateTimeLocal(person.validTo));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const windowError = role === 'guest' ? validateWindow(from, to) : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (windowError) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        role === 'guest'
          ? { role, validFrom: fromDateTimeLocal(from) ?? null, validTo: fromDateTimeLocal(to) ?? null }
          : { role, validFrom: null, validTo: null },
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Edit access - ${person.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="edit-access-form" variant="primary" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-access-form" className="space-y-4" onSubmit={submit} noValidate>
        <RoleSelect value={role} onChange={setRole} />
        {role === 'guest' && <WindowFields from={from} to={to} onFrom={setFrom} onTo={setTo} error={windowError} />}
        <FormError message={error} />
      </form>
    </Modal>
  );
}
