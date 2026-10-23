import { useState } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import { config } from '@/config/env';
import { useAsync } from '@/hooks/useAsync';
import { useDataVersion } from '@/hooks/useDataVersion';
import { peopleService } from '@/services';
import type { Person } from '@/types';
import { personRoleLabel } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { PersonList } from '@/components/people/PersonList';
import { AddPersonModal, EditAccessModal } from '@/components/people/PersonForms';

type Notice = { ok: boolean; text: string } | null;

/** Residents (always allowed) and registered visitors (allowed inside their time window). */
export default function PeoplePage() {
  const changed = useDataVersion('people'); // e.g. added or edited from the assistant chat
  const people = useAsync(() => peopleService.list(), [changed], config.refreshIntervalMs);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshing, setRefreshing] = useState(false);

  const list = people.data ?? [];
  const residents = list.filter((p) => p.role === 'family');
  const visitors = list.filter((p) => p.role === 'guest');

  const done = (text: string) => {
    setNotice({ ok: true, text });
    people.reload();
  };

  const addPhotos = async (p: Person, files: File[]) => {
    setUploadingId(p.id);
    setNotice(null);
    try {
      await peopleService.addPhotos(p.id, files);
      done(`Added ${files.length} photo${files.length === 1 ? '' : 's'} for ${p.name}.`);
    } catch (e) {
      setNotice({ ok: false, text: `Could not add photos for ${p.name}: ${(e as Error).message}` });
    } finally {
      setUploadingId(null);
    }
  };

  const toggleRecognition = async (p: Person) => {
    setTogglingId(p.id);
    setNotice(null);
    try {
      const fresh = await peopleService.update(p.id, { recognition: !p.recognition });
      done(
        (fresh.recognition ? `${p.name} is recognised again.` : `Recognition off: the camera now treats ${p.name} as an unknown person.`) +
          ' For House map recordings, press Re-process videos on the House map page.',
      );
    } catch (e) {
      setNotice({ ok: false, text: `Could not change recognition for ${p.name}: ${(e as Error).message}` });
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await peopleService.remove(deleting.id);
      done(`Deleted ${deleting.name}.`);
    } catch (e) {
      setNotice({ ok: false, text: `Could not delete ${deleting.name}: ${(e as Error).message}` });
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  };

  const refreshFaces = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const fresh = await peopleService.reloadFaces();
      done(`Faces refreshed: the engine re-read the photos of all ${fresh.length} people.`);
    } catch (e) {
      setNotice({ ok: false, text: `Could not refresh faces: ${(e as Error).message}` });
    } finally {
      setRefreshing(false);
    }
  };

  const listProps = { uploadingId, togglingId, onEdit: setEditing, onAddPhotos: addPhotos, onToggleRecognition: toggleRecognition, onDelete: setDeleting };

  return (
    <>
      <PageHeader
        title="Residents & Visitors"
        description="Residents pass silently. Visitors are allowed only inside their time window."
        actions={
          <>
            <Button
              icon={<RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
              onClick={refreshFaces}
              disabled={refreshing}
              title="Re-read the faces/ folder, e.g. after copying photos in by hand"
            >
              {refreshing ? 'Refreshing faces…' : 'Refresh faces'}
            </Button>
            <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => (setNotice(null), setAdding(true))}>
              Add person
            </Button>
          </>
        }
      />

      {notice && (
        <p role="status" className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${notice.ok ? 'border-ok/40 bg-ok/10 text-green-700' : 'border-danger/40 bg-danger/10 text-red-700'}`}>
          {notice.text}
        </p>
      )}

      {people.initialLoading ? (
        <Card>
          <LoadingState label="Loading residents and visitors…" />
        </Card>
      ) : people.error && !people.data ? (
        <Card>
          <ErrorState error={people.error} onRetry={people.reload} />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader title={`${personRoleLabel.family}s (family)`} subtitle={`${residents.length} registered · always allowed, no alert`} />
            {residents.length ? (
              <PersonList people={residents} {...listProps} />
            ) : (
              <EmptyState title="No residents yet" message="Add each family member with a few clear face photos so the camera recognises them." />
            )}
          </Card>
          <Card>
            <CardHeader title={`${personRoleLabel.guest}s`} subtitle={`${visitors.length} registered · alert when seen outside their window`} />
            {visitors.length ? (
              <PersonList people={visitors} {...listProps} />
            ) : (
              <EmptyState title="No visitors registered" message="Register a visitor with a time window, e.g. a relative coming on Saturday 2-6 pm." />
            )}
          </Card>
        </div>
      )}

      {adding && (
        <AddPersonModal
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            const p = await peopleService.create(input);
            setAdding(false);
            done(`Added ${p.name} as a ${personRoleLabel[p.role].toLowerCase()}.`);
          }}
        />
      )}

      {editing && (
        <EditAccessModal
          person={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (patch) => {
            const p = await peopleService.update(editing.id, patch);
            setEditing(null);
            done(`Saved access for ${p.name}.`);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? ''}?`}
        message={
          <>
            This removes <b>{deleting?.name}</b> and all {deleting?.photoCount ?? 0} of their photos from this computer. The camera will treat them as an unknown person from now on.
          </>
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
