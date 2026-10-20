import { useEffect, useState } from 'react';
import { VideoOff, WifiOff } from 'lucide-react';
import { isMock } from '@/config/env';
import { useRealtime } from '@/context/RealtimeContext';
import type { Camera } from '@/types';
import { cn, formatTime } from '@/utils/format';
import { CameraStatusBadge } from '@/components/ui/StatusBadge';
import { DetectionList, DetectionOverlay } from './DetectionOverlay';

interface CameraFeedProps {
  camera: Camera;
  compact?: boolean;
  onSelect?: () => void;
  selected?: boolean;
}

/**
 * One CCTV tile: HTML5 video (or a labelled sample scene in mock mode), live AI overlay,
 * connection status, and a clear message when the stream is unavailable.
 */
export function CameraFeed({ camera, compact, onSelect, selected }: CameraFeedProps) {
  const { detectionsFor, cameraStatus } = useRealtime();
  const status = cameraStatus[camera.id] ?? camera.status;
  const [videoError, setVideoError] = useState(false);
  const detections = status === 'offline' ? [] : detectionsFor(camera.id);
  const now = useClock();

  useEffect(() => setVideoError(false), [camera.streamUrl]);

  const unavailable = status === 'offline' || (!camera.streamUrl && !isMock) || videoError;

  return (
    <figure
      className={cn(
        'group overflow-hidden rounded-xl border bg-surface-1 transition-colors',
        selected ? 'border-brand ring-2 ring-brand/40' : 'border-line',
        onSelect && 'cursor-pointer hover:border-ink-3',
      )}
      onClick={onSelect}
      onKeyDown={(e) => onSelect && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? 'button' : undefined}
      aria-label={onSelect ? `Open ${camera.name}` : undefined}
    >
      <div className="relative aspect-video bg-black">
        {unavailable ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 p-4 text-center">
            {status === 'offline' ? <WifiOff className="h-7 w-7 text-danger" aria-hidden /> : <VideoOff className="h-7 w-7 text-ink-3" aria-hidden />}
            <p className="text-sm font-medium">{status === 'offline' ? 'Camera offline' : 'Stream unavailable'}</p>
            {!compact && (
              <p className="max-w-xs text-xs text-ink-3">
                {status === 'offline'
                  ? 'No signal from this camera. Check its power and network connection.'
                  : videoError
                    ? 'The video could not be played. The stream URL may be wrong or the format is not supported by the browser.'
                    : 'No stream URL is configured for this camera.'}
              </p>
            )}
          </div>
        ) : camera.streamUrl && isMjpeg(camera.streamUrl) ? (
          // Vision Vault streams MJPEG (multipart JPEG), which <video> cannot play but <img> can
          <img key={camera.streamUrl} src={camera.streamUrl} alt={`Live feed from ${camera.name}`} className="h-full w-full object-cover" onError={() => setVideoError(true)} />
        ) : camera.streamUrl ? (
          <video
            key={camera.streamUrl}
            src={camera.streamUrl}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
            loop
            controls={!compact}
            onError={() => setVideoError(true)}
          />
        ) : (
          <SampleScene seed={camera.id} />
        )}

        {!unavailable && <DetectionOverlay detections={detections} compact={compact} />}
        <DetectionList detections={detections} />

        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">
          {status !== 'offline' && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden />}
          {status === 'offline' ? 'NO SIGNAL' : 'LIVE'}
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">{formatTime(now)}</div>
        {isMock && !unavailable && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-warn/90 px-1.5 py-0.5 text-[10px] font-semibold text-black">SAMPLE FEED</div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{camera.name}</p>
          {!compact && <p className="truncate text-xs text-ink-3">{camera.location}</p>}
        </div>
        <CameraStatusBadge status={status} />
      </figcaption>
    </figure>
  );
}

const isMjpeg = (url: string) => /\/video(\?|$)|\.mjpe?g(\?|$)/i.test(url);

function useClock() {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Placeholder "scene" for mock mode so the grid looks like CCTV without real footage. */
function SampleScene({ seed }: { seed: string }) {
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 40;
  return (
    <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, hsl(${200 + hue} 18% 22%), hsl(${210 + hue} 20% 9%))` }}>
      <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.35))', clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)' }} />
      <div className="absolute left-[6%] top-[25%] h-[30%] w-[22%] bg-white/5" />
      <div className="absolute right-[6%] top-[20%] h-[36%] w-[24%] bg-white/5" />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.025)_0,rgba(255,255,255,.025)_1px,transparent_1px,transparent_3px)]" />
    </div>
  );
}
