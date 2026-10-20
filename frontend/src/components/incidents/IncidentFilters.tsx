import { Search, X } from 'lucide-react';
import type { Camera, IncidentQuery, IncidentStatus } from '@/types';
import { incidentStatusLabel } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';

interface Props {
  value: IncidentQuery;
  cameras: Camera[];
  onChange: (q: IncidentQuery) => void;
}

export function IncidentFilters({ value, cameras, onChange }: Props) {
  const set = <K extends keyof IncidentQuery>(k: K, v: IncidentQuery[K]) => onChange({ ...value, [k]: v });
  const active = !!(value.search || value.cameraId || value.status || value.from || value.to);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,2fr)_repeat(5,minmax(8rem,1fr))_auto]" role="search">
      <div className="relative sm:col-span-2 lg:col-span-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input aria-label="Search incidents" placeholder="Search ID, camera, location, label…" value={value.search ?? ''} onChange={(e) => set('search', e.target.value)} className="pl-9" />
      </div>
      <Select aria-label="Camera" value={value.cameraId ?? ''} onChange={(e) => set('cameraId', e.target.value)}>
        <option value="">All cameras</option>
        {cameras.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Status" value={value.status ?? ''} onChange={(e) => set('status', e.target.value as IncidentStatus | '')}>
        <option value="">All statuses</option>
        {(Object.keys(incidentStatusLabel) as IncidentStatus[]).map((s) => (
          <option key={s} value={s}>
            {incidentStatusLabel[s]}
          </option>
        ))}
      </Select>
      <Input type="date" aria-label="From date" value={value.from ?? ''} max={value.to || undefined} onChange={(e) => set('from', e.target.value)} />
      <Input type="date" aria-label="To date" value={value.to ?? ''} min={value.from || undefined} onChange={(e) => set('to', e.target.value)} />
      <Select aria-label="Sort by time" value={value.sort ?? 'newest'} onChange={(e) => set('sort', e.target.value as IncidentQuery['sort'])}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </Select>
      <Button variant="ghost" disabled={!active} icon={<X className="h-4 w-4" />} onClick={() => onChange({ sort: value.sort })}>
        Clear
      </Button>
    </div>
  );
}
