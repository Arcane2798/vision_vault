import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Incident } from '@/types';
import { cn, eventTypeLabel } from '@/utils/format';

interface Node {
  label: string;
  count: number;
  /** dot / bar colour class (status meaning) */
  tone: string;
}

/**
 * How recorded events moved through the system: which camera saw them, what kind of event it was,
 * and how the guard house responded. Every number is counted from the incidents passed in.
 */
export function DetectionFlow({ incidents }: { incidents: Incident[] }) {
  const total = incidents.length;

  const byCamera = countBy(incidents, (i) => i.cameraName).map(([label, count]) => ({ label, count, tone: 'bg-brand' }));
  const byType = countBy(incidents, (i) => i.label).map(([label, count]) => ({
    label: eventTypeLabel(label),
    count,
    tone: label === 'intrusion' ? 'bg-danger' : 'bg-caution',
  }));
  const responded = incidents.filter((i) => i.guardNotified && i.guardAcknowledgedAt).length;
  const awaiting = incidents.filter((i) => i.guardNotified && !i.guardAcknowledgedAt).length;
  const ownerOnly = incidents.filter((i) => !i.guardNotified).length;
  const byResponse: Node[] = [
    { label: 'Guard house responded', count: responded, tone: 'bg-ok' },
    { label: 'Guard notified, no reply', count: awaiting, tone: 'bg-guard' },
    { label: 'Sent to you only', count: ownerOnly, tone: 'bg-ink-3' },
  ].filter((n) => n.count > 0);

  const columns: Array<{ title: string; nodes: Node[] }> = [
    { title: 'Seen by', nodes: byCamera },
    { title: 'What happened', nodes: byType },
    { title: 'Response', nodes: byResponse },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start">
      {columns.map((col, ci) => (
        <Fragment key={col.title}>
          {ci > 0 && (
            <div className="flex justify-center text-ink-3 md:pt-9" aria-hidden>
              <ChevronRight className="h-4 w-4 rotate-90 md:rotate-0" />
            </div>
          )}
          <section aria-label={col.title} className="min-w-0">
            <p className="eyebrow mb-2">{col.title}</p>
            <ul className="space-y-2">
              {col.nodes.map((n) => (
                <li key={n.label} className="rounded-xl bg-surface-1 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', n.tone)} aria-hidden />
                      <span className="truncate">{n.label}</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink-1">{n.count}</span>
                  </div>
                  {/* share of all events, so the columns read as one flow */}
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div className={cn('h-full rounded-full', n.tone)} style={{ width: `${total ? Math.max(4, (n.count / total) * 100) : 0}%` }} />
                  </div>
                  <span className="sr-only">{total ? Math.round((n.count / total) * 100) : 0}% of events</span>
                </li>
              ))}
            </ul>
          </section>
        </Fragment>
      ))}
    </div>
  );
}

function countBy<T>(items: T[], key: (t: T) => string): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
