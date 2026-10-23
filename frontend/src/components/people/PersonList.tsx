import { useRef, useState } from 'react';
import { CalendarClock, Eye, EyeOff, ImagePlus, MapPin, Pencil, Trash2, UserRound } from 'lucide-react';
import { peopleService } from '@/services';
import type { Person } from '@/types';
import { formatLastSeen, formatWindow } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { AccessBadge, PersonRoleBadge } from './PersonBadges';

interface PersonListProps {
  people: Person[];
  uploadingId?: number | null;
  togglingId?: number | null;
  onEdit: (p: Person) => void;
  onAddPhotos: (p: Person, files: File[]) => void;
  onToggleRecognition: (p: Person) => void;
  onDelete: (p: Person) => void;
}

export function PersonList({ people, uploadingId, togglingId, ...actions }: PersonListProps) {
  return (
    <ul className="divide-y divide-line">
      {people.map((p) => (
        <PersonRow key={p.id} person={p} uploading={uploadingId === p.id} toggling={togglingId === p.id} {...actions} />
      ))}
    </ul>
  );
}

function PersonRow({
  person: p,
  uploading,
  toggling,
  onEdit,
  onAddPhotos,
  onToggleRecognition,
  onDelete,
}: Omit<PersonListProps, 'people' | 'uploadingId' | 'togglingId'> & { person: Person; uploading: boolean; toggling: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Thumbnail person={p} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{p.name}</p>
            <PersonRoleBadge role={p.role} />
            <AccessBadge person={p} />
          </div>
          {p.role === 'guest' && (
            <p className="flex items-center gap-1.5 text-xs text-ink-2">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Allowed: {formatWindow(p.validFrom, p.validTo)}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {formatLastSeen(p.lastSeen)} · {p.photoCount} photo{p.photoCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 sm:justify-end">
        <Button
          size="sm"
          variant="ghost"
          className={p.recognition ? undefined : 'text-red-700 hover:text-red-800'}
          icon={p.recognition ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          loading={toggling}
          aria-pressed={!p.recognition}
          title={p.recognition ? 'Testing: make the camera treat this person as unknown' : 'Let the camera recognise this person again'}
          onClick={() => onToggleRecognition(p)}
        >
          {p.recognition ? 'Recognition on' : 'Recognition off'}
        </Button>
        <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(p)}>
          {p.role === 'guest' ? 'Edit window' : 'Edit'}
        </Button>
        <Button size="sm" variant="ghost" icon={<ImagePlus className="h-4 w-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : 'Add photos'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label={`Add photos of ${p.name}`}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ''; // allow picking the same file again
            if (files.length) onAddPhotos(p, files);
          }}
        />
        <Button size="sm" variant="ghost" className="text-red-700 hover:text-red-800" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete(p)}>
          Delete
        </Button>
      </div>
    </li>
  );
}

function Thumbnail({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  if (failed || person.photoCount === 0) {
    return (
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink-3" aria-hidden>
        <UserRound className="h-6 w-6" />
      </span>
    );
  }
  return <img src={peopleService.photoSrc(person)} alt={`Photo of ${person.name}`} loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" onError={() => setFailed(true)} />;
}
