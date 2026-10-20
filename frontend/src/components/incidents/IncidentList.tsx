import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Incident } from '@/types';
import { eventTypeLabel, formatConfidence, formatDateTime, incidentHeadline, incidentIdentity, isRuleBased } from '@/utils/format';
import { IncidentStatusBadge } from '@/components/ui/StatusBadge';
import { GuardNotifiedBadge } from './GuardNotifiedBadge';

/** Table on desktop, cards on mobile. Each row opens the incident details. */
export function IncidentList({ incidents, showSnapshot = true }: { incidents: Incident[]; showSnapshot?: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <tr>
              {showSnapshot && <th className="px-4 py-2.5 font-medium">Evidence</th>}
              <th className="px-4 py-2.5 font-medium">Incident</th>
              <th className="px-4 py-2.5 font-medium">Date &amp; time</th>
              <th className="px-4 py-2.5 font-medium">Camera</th>
              <th className="px-4 py-2.5 font-medium">Event</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="sr-only">Open</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => navigate(`/incidents/${i.id}`)}>
                {showSnapshot && (
                  <td className="px-4 py-2">
                    {i.snapshotUrl ? (
                      <img src={i.snapshotUrl} alt="" loading="lazy" className="h-12 w-20 rounded object-cover" />
                    ) : (
                      <div className="grid h-12 w-20 place-items-center rounded bg-surface-3 text-[10px] text-ink-3">No image</div>
                    )}
                  </td>
                )}
                <td className="px-4 py-2 font-mono text-xs">
                  <Link to={`/incidents/${i.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {i.id}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-ink-2">{formatDateTime(i.timestamp)}</td>
                <td className="px-4 py-2">
                  <p>{i.cameraName}</p>
                  <p className="text-xs text-ink-3">{i.location}</p>
                </td>
                <td className="px-4 py-2">
                  <p>{eventTypeLabel(i.label)}</p>
                  <p className="text-xs text-ink-3">{isRuleBased(i.label) ? incidentIdentity(i) : `${formatConfidence(i.confidence)} confidence`}</p>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <IncidentStatusBadge status={i.status} />
                    {i.guardNotified && <GuardNotifiedBadge />}
                  </div>
                </td>
                <td className="px-2 text-ink-3">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {incidents.map((i) => (
          <li key={i.id}>
            <Link to={`/incidents/${i.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
              {showSnapshot && i.snapshotUrl && <img src={i.snapshotUrl} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded object-cover" />}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{i.cameraName}</p>
                  <span className="font-mono text-[11px] text-ink-3">{i.id}</span>
                </div>
                <p className="text-xs text-ink-2">{incidentHeadline(i)}</p>
                <p className="text-xs text-ink-3">{formatDateTime(i.timestamp)}</p>
                <div className="flex flex-wrap gap-1">
                  <IncidentStatusBadge status={i.status} />
                  {i.guardNotified && <GuardNotifiedBadge />}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
