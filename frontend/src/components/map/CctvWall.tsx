import { useEffect, useRef, useState } from 'react';
import { CircleAlert, VideoOff } from 'lucide-react';
import { mapService } from '@/services';
import type { HouseMap, MapCamera, MapState } from '@/types';
import { cn } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';

interface Props {
  map: HouseMap;
  state: MapState | null;
  mode: 'live' | 'replay';
  /** replay clock (seconds) */
  t: number;
  playing: boolean;
  speed: number;
}

/**
 * A guard-monitor style grid with one tile per camera. The live front-door camera streams; each recorded
 * room camera plays its processed video (person boxes burned in) in step with the replay clock.
 */
export function CctvWall({ map, state, mode, t, playing, speed }: Props) {
  return (
    <Card>
      <CardHeader
        title="CCTV wall"
        subtitle={mode === 'replay' ? 'Every room camera, in sync with the replay' : 'Room cameras show their recordings: press Play in Replay recordings to run them together'}
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {map.cameras.map((c, i) => (
          <Tile key={c.id} index={i} cam={c} map={map} state={state} t={t} playing={mode === 'replay' && playing} speed={speed} />
        ))}
      </div>
    </Card>
  );
}

function Tile({ index, cam, map, state, t, playing, speed }: { index: number; cam: MapCamera; map: HouseMap; state: MapState | null; t: number; playing: boolean; speed: number }) {
  const people = (state?.rooms[cam.room] ?? []).filter((p) => p.camera === cam.id);
  const intruder = people.some((p) => p.kind === 'unknown');
  const room = map.rooms.find((r) => r.id === cam.room)?.name ?? cam.room;
  const local = t - (cam.offset ?? 0);

  return (
    <figure className={cn('relative aspect-video overflow-hidden rounded-lg bg-black ring-1', intruder ? 'ring-2 ring-red-500' : 'ring-line')}>
      {cam.live ? (
        <LiveFeed cam={cam} />
      ) : cam.annotatedUrl ? (
        <RecordedFeed cam={cam} local={local} playing={playing} speed={speed} />
      ) : (
        <NoSignal text={cam.videoFound ? 'Not processed yet: press Process videos' : 'No recording uploaded for this room'} />
      )}

      <figcaption className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 font-mono text-[11px] text-white">
        <span className="truncate rounded bg-black/60 px-1.5 py-0.5">
          CAM {String(index + 1).padStart(2, '0')} · {room}
        </span>
        {cam.live ? (
          <span className="flex shrink-0 items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden /> LIVE
          </span>
        ) : (
          cam.annotatedUrl && <span className="shrink-0 rounded bg-black/60 px-1.5 py-0.5 tabular-nums">REC {fmt(Math.max(0, local))}</span>
        )}
      </figcaption>

      {(intruder || people.length > 0) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 p-2 text-[11px]">
          {intruder && (
            <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white">
              <CircleAlert className="h-3 w-3" aria-hidden /> INTRUDER
            </span>
          )}
          {people
            .filter((p) => p.kind !== 'unknown')
            .map((p, i) => (
              <span key={`${p.name}-${i}`} className={cn('rounded px-1.5 py-0.5 font-medium text-black', p.kind === 'family' ? 'bg-green-400' : 'bg-cyan-300')}>
                {p.name}
              </span>
            ))}
        </div>
      )}
    </figure>
  );
}

function LiveFeed({ cam }: { cam: MapCamera }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <NoSignal text="Live camera offline" />;
  return <img src={mapService.liveStreamSrc()} alt={`Live feed from ${cam.name}`} className="h-full w-full object-contain" onError={() => setFailed(true)} />;
}

/** Follows the replay clock: seeks when paused or drifting, plays at the replay speed. */
function RecordedFeed({ cam, local, playing, speed }: { cam: MapCamera; local: number; playing: boolean; speed: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const before = local < 0;
  const after = duration !== null && local > duration;

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const v = ref.current;
    if (!v || duration === null) return;
    if (before || after) {
      v.pause();
      v.currentTime = before ? 0 : duration;
      return;
    }
    const drift = Math.abs(v.currentTime - local);
    if (playing) {
      if (drift > 0.4 + 0.25 * speed) v.currentTime = local;
      if (v.paused) v.play().catch(() => undefined);
    } else {
      v.pause();
      if (drift > 0.05) v.currentTime = local;
    }
  }, [local, playing, speed, duration, before, after]);

  if (failed) return <NoSignal text="Could not play this recording" />;
  return (
    <>
      <video
        ref={ref}
        src={mapService.videoSrc(cam)}
        muted
        playsInline
        preload="auto"
        className="h-full w-full object-contain"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
        aria-label={`Recording from ${cam.name}`}
      />
      {(before || after) && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 text-xs text-ink-2">{before ? `Recording starts at ${fmt(cam.offset ?? 0)}` : 'Recording ended'}</div>
      )}
    </>
  );
}

function NoSignal({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-[repeating-linear-gradient(0deg,#0b1220_0px,#0b1220_2px,#111a2b_2px,#111a2b_4px)] px-4 text-center">
      <VideoOff className="h-6 w-6 text-ink-3" aria-hidden />
      <p className="font-mono text-xs font-semibold tracking-widest text-ink-2">NO SIGNAL</p>
      <p className="text-[11px] text-ink-3">{text}</p>
    </div>
  );
}

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
