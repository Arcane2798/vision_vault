import type { Detection } from '@/types';
import { formatConfidence, formatTime } from '@/utils/format';

/**
 * Draws AI bounding boxes over a video/image. Boxes are dashed amber and tagged "AI" so they are
 * never mistaken for a confirmed incident. bbox values are 0-1 relative to the frame.
 */
export function DetectionOverlay({ detections, compact }: { detections: Detection[]; compact?: boolean }) {
  if (!detections.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {detections.map((d) => (
        <div
          key={d.id}
          className="absolute rounded-sm border-2 border-dashed border-warn"
          style={{ left: `${d.bbox.x * 100}%`, top: `${d.bbox.y * 100}%`, width: `${d.bbox.width * 100}%`, height: `${d.bbox.height * 100}%` }}
        >
          <span className="absolute -top-px left-0 -translate-y-full whitespace-nowrap rounded-t bg-warn px-1.5 py-0.5 font-mono text-[10px] font-semibold text-black">
            AI · {d.label} {formatConfidence(d.confidence)}
            {!compact && ` · ${formatTime(d.timestamp)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Text version of the overlay for screen readers and for a detection log. */
export function DetectionList({ detections }: { detections: Detection[] }) {
  return (
    <ul className="sr-only" aria-live="polite">
      {detections.map((d) => (
        <li key={d.id}>
          AI prediction {d.label}, confidence {formatConfidence(d.confidence)}, at {formatTime(d.timestamp)}
        </li>
      ))}
    </ul>
  );
}
