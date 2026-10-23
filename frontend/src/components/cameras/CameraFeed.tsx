import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Maximize2, Minimize2, VideoOff, WifiOff } from 'lucide-react';
import { isMock } from '@/config/env';
import { useRealtime } from '@/context/RealtimeContext';
import type { Camera } from '@/types';
import { cn, formatTime } from '@/utils/format';
import { CameraStatusBadge } from '@/components/ui/StatusBadge';
import { Viewfinder } from '@/components/ui/States';
import { DetectionList, DetectionOverlay } from './DetectionOverlay';

interface CameraFeedProps {
  camera: Camera;
  compact?: boolean;
  onSelect?: () => void;
  selected?: boolean;
  /** extra controls in the caption bar (e.g. "View incidents") */
  actions?: ReactNode;
  /** the engine is playing a recorded test video (GET /api/source kind "file"), not the camera */
  testVideo?: boolean;
}

/**
 * One CCTV tile: the MJPEG stream (or a labelled sample scene in mock mode), AI overlay,
 * connection status, fullscreen, and a clear message when the stream is unavailable.
 * Overlays sit on the video, so they keep fixed dark styling in both themes.
 */
export function CameraFeed({ camera, compact, onSelect, selected, actions, testVideo }: CameraFeedProps) {
  const { detectionsFor, cameraStatus } = useRealtime();
  const status = cameraStatus[camera.id] ?? camera.status;
  const [videoError, setVideoError] = useState(false);
  const detections = status === 'offline' ? [] : detectionsFor(camera.id);
  const now = useClock();
  const media = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(media);

  useEffect(() => setVideoError(false), [camera.streamUrl]);

  const unavailable = status === 'offline' || (!camera.streamUrl && !isMock) || videoError;
  // only the backend's camera stream is called LIVE; a test video and mock mode say what they are
  const badge = status === 'offline' ? 'NO SIGNAL' : isMock ? 'SAMPLE' : testVideo ? 'TEST VIDEO' : 'LIVE';

  return (
    <figure
      className={cn(
        'panel-tint group overflow-hidden rounded-xl border p-2 transition-colors',
        selected ? 'border-brand ring-2 ring-brand/40' : 'border-line/70',
        onSelect && 'cursor-pointer hover:border-line-strong',
      )}
      onClick={onSelect}
      onKeyDown={(e) => onSelect && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? 'button' : undefined}
      aria-label={onSelect ? `Open ${camera.name}` : undefined}
    >
      <div ref={media} className="relative aspect-video overflow-hidden rounded-2xl bg-black">
        {unavailable ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 p-4 text-center">
            {status === 'offline' ? <WifiOff className="h-7 w-7 text-danger-fg" aria-hidden /> : <VideoOff className="h-7 w-7 text-ink-3" aria-hidden />}
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
          <>
            {/* shows until the first frame paints over it */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-xs text-white/60" aria-hidden>
              <Viewfinder size="lg" className="[--vf-c:rgb(255_255_255/0.6)]" />
              Connecting to camera…
            </div>
            {/* Vision Vault streams MJPEG (multipart JPEG), which <video> cannot play but <img> can */}
            <img
              key={camera.streamUrl}
              src={camera.streamUrl}
              alt={`Live feed from ${camera.name}`}
              className="relative h-full w-full object-contain"
              onError={() => setVideoError(true)}
            />
          </>
        ) : camera.streamUrl ? (
          <video
            key={camera.streamUrl}
            src={camera.streamUrl}
            className="h-full w-full object-contain"
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


        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 font-mono text-[11px] text-white">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold tracking-wide',
                badge === 'LIVE' ? 'bg-red-600' : badge === 'NO SIGNAL' ? 'bg-black/70' : 'bg-amber-400 text-black',
              )}
            >
              {badge === 'LIVE' && <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />}
              {badge}
            </span>
            {!compact && <span className="truncate opacity-90">{camera.id.toUpperCase()}</span>}
          </span>
          <span className="shrink-0 tabular-nums opacity-90" title="Your browser's clock">
            {formatTime(now)}
          </span>
        </div>

        {!compact && !unavailable && fullscreen.supported && (
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), fullscreen.toggle())}
            className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white opacity-80 backdrop-blur transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
            title={fullscreen.active ? 'Exit full screen' : 'Full screen'}
          >
            {fullscreen.active ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 px-2 pb-1 pt-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{camera.name}</p>
          {!compact && (
            <p className="truncate text-xs text-ink-3">
              {camera.location ? `${camera.location}, camera ${camera.id}` : `Camera ${camera.id}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <CameraStatusBadge status={status} />
        </div>
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

function useFullscreen(ref: RefObject<HTMLElement>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const h = () => setActive(!!document.fullscreenElement && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, [ref]);
  return {
    supported: typeof document !== 'undefined' && !!document.fullscreenEnabled,
    active,
    toggle: () => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen()),
  };
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
