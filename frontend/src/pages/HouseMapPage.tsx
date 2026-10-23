import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Pause, Play, Radio, Route } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { mapService } from '@/services';
import type { HouseMap, MapCamera, MapPerson, MapRoom, MapState, MapStatus } from '@/types';
import { cn } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { MapVideosCard } from '@/components/map/MapVideosCard';
import { CctvWall } from '@/components/map/CctvWall';

type Mode = 'live' | 'replay';
const SPEEDS = [1, 2, 4];
const PERSON_COLOR: Record<MapPerson['kind'], string> = { family: '#22c55e', guest: '#22d3ee', unknown: '#ef4444' };

/**
 * House map + safe path (side features 3 & 4). Rooms and cameras come from house_map.json; recorded
 * videos (one per room) are processed once and replayed together, the live front-door camera adds
 * what it sees now. With an intruder on the map, each resident gets the shortest way out that avoids
 * rooms with an intruder.
 */
export default function HouseMapPage() {
  const map = useAsync(() => mapService.get(), []);
  const [chosenMode, setMode] = useState<Mode>('live');
  // without a live camera on the map there is nothing to show live: always the replay
  const hasLive = !!map.data?.cameras.some((c) => c.live);
  const mode: Mode = hasLive ? chosenMode : 'replay';
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [state, setState] = useState<MapState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  const timeline = map.data?.timeline;
  const duration = timeline?.duration ?? 0;

  // occupancy + safe paths: every second in live mode, on every time change in replay
  const fetchState = useCallback(async () => {
    try {
      setState(await mapService.state(mode === 'replay' ? t : undefined, mode === 'live'));
      setStateError(null);
    } catch (e) {
      setStateError((e as Error).message);
    }
  }, [mode, t]);
  useEffect(() => {
    if (!map.data) return;
    fetchState();
    if (mode !== 'live') return;
    const id = window.setInterval(fetchState, 1000);
    return () => clearInterval(id);
  }, [map.data, mode, fetchState]);

  // replay clock
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, speed, duration]);

  // processing progress
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const s = await mapService.status();
        if (stop) return;
        setStatus(s);
        if (s.state === 'processing') window.setTimeout(poll, 1000);
        else if (s.state === 'done' && status?.state === 'processing') map.reload();
      } catch {
        /* the page still works without the status */
      }
    };
    poll();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.state === 'processing']);

  const process = async () => {
    setProcessError(null);
    try {
      setStatus(await mapService.process());
    } catch (e) {
      setProcessError((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="House map"
        description="Where residents and intruders are, room by room, and the safest way out for each resident."
        actions={
          hasLive && <div role="radiogroup" aria-label="Map mode" className="inline-flex rounded-lg border border-line bg-surface-2 p-1">
            {(['live', 'replay'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={m === 'replay' && !timeline?.ready}
                onClick={() => {
                  setMode(m);
                  setPlaying(false);
                }}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40', mode === m ? 'bg-brand text-white' : 'text-ink-2 hover:text-ink-1')}
                title={m === 'replay' && !timeline?.ready ? 'Process the recorded videos first' : undefined}
              >
                {m === 'live' ? 'Live' : 'Replay recordings'}
              </button>
            ))}
          </div>
        }
      />

      <p className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs text-ink-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <span>
          {hasLive
            ? 'Concept demo: a real home needs one camera per room. Here the live front-door camera is combined with recorded videos of the other rooms.'
            : 'Concept demo: every camera plays a recorded video, so the whole house can be replayed together. Upload one video per camera, press Process videos, then Play.'}{' '}
          Edit <code className="text-ink-1">house_map.json</code> to change rooms, doors and which video belongs to which room.
        </span>
      </p>

      {map.initialLoading ? (
        <LoadingState label="Loading the house map…" />
      ) : map.error ? (
        <ErrorState error={map.error} onRetry={map.reload} />
      ) : !map.data ? null : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title={map.data.name}
              subtitle={
                mode === 'live' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-red-600" aria-hidden /> Live
                  </span>
                ) : (
                  `Replay ${fmt(t)} / ${fmt(duration)}`
                )
              }
            />
            <div className="p-4">
              <FloorPlan map={map.data} state={state} />
              {mode === 'replay' && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="primary" icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} disabled={!timeline?.ready} title={timeline?.ready ? undefined : 'Process the recorded videos first'} onClick={() => {
                    if (!playing && t >= duration) setT(0);
                    setPlaying(!playing);
                  }}>
                    {playing ? 'Pause' : 'Play'}
                  </Button>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.25}
                    value={t}
                    onChange={(e) => setT(Number(e.target.value))}
                    className="min-w-40 flex-1 accent-brand"
                    aria-label="Replay time"
                  />
                  <span className="w-24 text-right text-xs tabular-nums text-ink-3">
                    {fmt(t)} / {fmt(duration)}
                  </span>
                  <div className="inline-flex rounded-md border border-line" role="radiogroup" aria-label="Replay speed">
                    {SPEEDS.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} className={cn('px-2 py-1 text-xs', speed === s ? 'bg-surface-3 text-ink-1' : 'text-ink-3')}>
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {stateError && <p className="mt-3 text-xs text-red-700">{stateError}</p>}
            </div>
          </Card>

          <div className="space-y-4">
            <SafePathCard state={state} map={map.data} />
            <MapVideosCard map={map.data} status={status} onChanged={() => map.reload()} onProcess={process} processError={processError} />
          </div>

          <div className="xl:col-span-3">
            <CctvWall map={map.data} state={state} mode={mode} t={t} playing={playing} speed={speed} />
          </div>
        </div>
      )}
    </>
  );
}

function FloorPlan({ map, state }: { map: HouseMap; state: MapState | null }) {
  const W = map.width ?? Math.max(...map.rooms.map((r) => r.x + r.w));
  const H = map.height ?? Math.max(...map.rooms.map((r) => r.y + r.h));
  const centre = useMemo(() => Object.fromEntries(map.rooms.map((r) => [r.id, [r.x + r.w / 2, r.y + r.h / 2]])), [map.rooms]);
  const intruder = new Set(state?.intruderRooms ?? []);
  const paths = (state?.safePaths ?? []).filter((p) => p.path && p.path.length > 1);

  return (
    <svg viewBox={`-0.2 -0.2 ${W + 0.4} ${H + 0.4}`} className="h-auto w-full rounded-lg bg-surface-2" role="img" aria-label="Floor plan with people and safe paths">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#15803d" />
        </marker>
      </defs>
      {map.rooms.map((r) => (
        <g key={r.id}>
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={0.15}
            fill={intruder.has(r.id) ? 'rgba(239,68,68,0.22)' : r.exit ? 'rgba(34,197,94,0.08)' : 'rgba(148,163,184,0.06)'}
            stroke={intruder.has(r.id) ? '#ef4444' : r.exit ? '#22c55e' : '#475569'}
            strokeWidth={intruder.has(r.id) ? 0.08 : 0.04}
            strokeDasharray={r.exit ? '0.25 0.15' : undefined}
          />
          <text x={r.x + 0.25} y={r.y + 0.55} fontSize={0.42} fill="#334155" fontWeight={600}>
            {r.name}
          </text>
          {r.exit && (
            <text x={r.x + 0.25} y={r.y + 1.05} fontSize={0.32} fill="#15803d">
              way out
            </text>
          )}
          <People room={r} people={state?.rooms[r.id] ?? []} cameras={map.cameras} />
        </g>
      ))}
      {paths.map((p) => (
        <polyline
          key={p.name}
          points={p.path!.map((id) => centre[id].join(',')).join(' ')}
          fill="none"
          stroke="#15803d"
          strokeWidth={0.14}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd="url(#arrow)"
          opacity={0.9}
        />
      ))}
      {map.doors.map(([a, b]) => (
        <Door key={`${a}-${b}`} a={map.rooms.find((r) => r.id === a)} b={map.rooms.find((r) => r.id === b)} />
      ))}
      {map.cameras.map((c) => {
        const r = map.rooms.find((x) => x.id === c.room);
        return r ? <CameraMark key={c.id} cam={c} room={r} /> : null;
      })}
    </svg>
  );
}

/** A door: an amber mark in the middle of the wall two rooms share; the one to a way out is labelled. */
function Door({ a, b }: { a?: MapRoom; b?: MapRoom }) {
  if (!a || !b) return null;
  const span = (lo1: number, hi1: number, lo2: number, hi2: number) => [Math.max(lo1, lo2), Math.min(hi1, hi2)];
  let seg: [number, number, number, number] | null = null; // x1 y1 x2 y2
  const vertical = a.x + a.w === b.x ? a.x + a.w : b.x + b.w === a.x ? a.x : null;
  const horizontal = a.y + a.h === b.y ? a.y + a.h : b.y + b.h === a.y ? a.y : null;
  if (vertical !== null) {
    const [lo, hi] = span(a.y, a.y + a.h, b.y, b.y + b.h);
    const len = Math.min(1.4, (hi - lo) * 0.5);
    if (hi > lo) seg = [vertical, (lo + hi - len) / 2, vertical, (lo + hi + len) / 2];
  } else if (horizontal !== null) {
    const [lo, hi] = span(a.x, a.x + a.w, b.x, b.x + b.w);
    const len = Math.min(1.4, (hi - lo) * 0.5);
    if (hi > lo) seg = [(lo + hi - len) / 2, horizontal, (lo + hi + len) / 2, horizontal];
  }
  if (!seg) return null;
  const front = a.exit || b.exit;
  return (
    <g>
      <line x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} stroke="#f38121" strokeWidth={0.16} strokeLinecap="round" />
      {front && (
        <text x={seg[0] - 0.25} y={(seg[1] + seg[3]) / 2 + 0.12} fontSize={0.34} textAnchor="end" fill="#c2410c">
          Front door
        </text>
      )}
    </g>
  );
}

/** Camera icon pointing where it looks, with its field of view (clipped to its room). */
/** Where a camera sits and which way it looks (degrees, 0 = right, 90 = down). Without hints in
 *  house_map.json: the top-right corner of its room, looking down-left into it. */
function cameraPose(cam: MapCamera, room: MapRoom) {
  return { x: cam.x ?? room.x + room.w - 0.4, y: cam.y ?? room.y + 0.4, facing: cam.facing ?? 135 };
}

function CameraMark({ cam, room }: { cam: MapCamera; room: MapRoom }) {
  const { x, y, facing } = cameraPose(cam, room);
  const half = ((cam.fov ?? 90) / 2) * (Math.PI / 180);
  const dir = facing * (Math.PI / 180);
  const R = 4;
  const p = (ang: number) => `${x + R * Math.cos(ang)},${y + R * Math.sin(ang)}`;
  const colour = cam.live ? '#ef4444' : cam.videoFound ? '#94a3b8' : '#7f1d1d';
  const clip = `cam-clip-${cam.id}`;
  return (
    <g>
      <clipPath id={clip}>
        <rect x={room.x} y={room.y} width={room.w} height={room.h} />
      </clipPath>
      <path d={`M ${x},${y} L ${p(dir - half)} A ${R} ${R} 0 0 1 ${p(dir + half)} Z`} fill={colour} opacity={0.13} clipPath={`url(#${clip})`} />
      <g transform={`translate(${x}, ${y}) rotate(${facing})`}>
        <rect x={-0.3} y={-0.17} width={0.42} height={0.34} rx={0.06} fill={colour} />
        <path d="M 0.12,-0.1 L 0.3,-0.17 L 0.3,0.17 L 0.12,0.1 Z" fill={colour} />
      </g>
      <title>{`${cam.name}${cam.live ? ' (live)' : cam.videoFound ? '' : ' (video missing)'}`}</title>
    </g>
  );
}

const VIEW_DEPTH = 3; // people are drawn this far in front of the camera that sees them (map units)
const STEP = 1.5; // spacing between people seen by the same camera (room for the names)

/** People in a room, each drawn inside the view of the camera that saw them: someone seen by the
 *  front-door camera appears by the door, someone seen by the corner camera in that corner. */
function People({ room, people, cameras }: { room: MapRoom; people: MapPerson[]; cameras: MapCamera[] }) {
  const byCamera = new Map<string, MapPerson[]>();
  for (const p of people) byCamera.set(p.camera, [...(byCamera.get(p.camera) ?? []), p]);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return (
    <>
      {[...byCamera].flatMap(([camId, seen]) => {
        const cam = cameras.find((c) => c.id === camId);
        const pose = cam ? cameraPose(cam, room) : null;
        const dir = ((pose?.facing ?? 90) * Math.PI) / 180;
        // a point straight ahead of the camera (or the room centre for an unknown camera) ...
        const ax = pose ? pose.x + VIEW_DEPTH * Math.cos(dir) : room.x + room.w / 2;
        const ay = pose ? pose.y + VIEW_DEPTH * Math.sin(dir) : room.y + room.h / 2;
        // ... with several people side by side across the view, kept inside the room
        return seen.map((p, i) => {
          const off = (i - (seen.length - 1) / 2) * STEP;
          const x = clamp(ax - Math.sin(dir) * off, room.x + 0.6, room.x + room.w - 0.6);
          const y = clamp(ay + Math.cos(dir) * off, room.y + 0.9, room.y + room.h - 0.9);
          return (
            <g key={`${camId}-${p.name}-${i}`}>
              <circle cx={x} cy={y} r={0.28} fill={PERSON_COLOR[p.kind]} stroke="#0f172a" strokeWidth={0.05}>
                <title>{`${p.kind === 'unknown' ? 'Unknown person' : p.name}${cam ? ` · seen by ${cam.name}` : ''}`}</title>
              </circle>
              <text x={x} y={y + 0.62} fontSize={0.28} textAnchor="middle" fill="#1f2430">
                {p.kind === 'unknown' ? 'Unknown' : p.name}
              </text>
            </g>
          );
        });
      })}
    </>
  );
}

function SafePathCard({ state, map }: { state: MapState | null; map: HouseMap }) {
  const intruders = state?.intruderRooms ?? [];
  return (
    <Card className={intruders.length ? 'border-red-500/50' : undefined}>
      <CardHeader title="Safe way out" subtitle={intruders.length ? `Intruder in: ${intruders.map((r) => roomName(map, r)).join(', ')}` : 'Shown when an intruder is on the map'} />
      <div className="p-4">
        {!intruders.length ? (
          <EmptyState title="No intruder on the map" message="When an unknown person is seen in a room, each resident gets the shortest route out that avoids them." />
        ) : !state?.safePaths.length ? (
          <p className="text-sm text-ink-2">No resident is on the map right now, so there is no route to suggest.</p>
        ) : (
          <ul className="space-y-3">
            {state.safePaths.map((p) => (
              <li key={p.name} className={cn('rounded-lg border px-3 py-2 text-sm', p.path ? 'border-green-500/40 bg-green-500/10' : 'border-red-500/40 bg-red-500/10')}>
                <p className="flex items-center gap-1.5 font-semibold">
                  <Route className="h-4 w-4" aria-hidden /> {p.name} <span className="font-normal text-ink-3">· in the {roomName(map, p.from)}</span>
                </p>
                <p className="mt-1 text-ink-1">{p.advice}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

const roomName = (map: HouseMap, id: string) => map.rooms.find((r) => r.id === id)?.name ?? id;

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
