import { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, CircleAlert, RefreshCw, Upload } from 'lucide-react';
import { mapService } from '@/services';
import type { HouseMap, MapCamera, MapStatus } from '@/types';
import { cn, formatDateTime } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';

interface Props {
  map: HouseMap;
  status: MapStatus | null;
  onChanged: (map: HouseMap) => void;
  onProcess: () => void;
  processError: string | null;
}

/**
 * Recorded room cameras: upload one video per room (each saved under the file name in house_map.json),
 * line the videos up with a start offset, then process them once for the map replay.
 */
export function MapVideosCard({ map, status, onChanged, onProcess, processError }: Props) {
  const recorded = map.cameras.filter((c) => !c.live);
  const live = map.cameras.find((c) => c.live);
  const processing = status?.state === 'processing';
  const missing = recorded.filter((c) => !c.videoFound);
  const uploaded = recorded.length - missing.length;
  const tl = map.timeline;

  return (
    <Card>
      <CardHeader title="Room cameras (recorded videos)" subtitle="One video per room, played together on the map" />
      <div className="space-y-4 p-4">
        <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-3">
          <li>Record each room at the same time (or note when each recording starts).</li>
          <li>Upload each video to its room below. Set an offset if a video starts later than the others.</li>
          <li>Press <b className="text-ink-2">Process videos</b>, then switch to <b className="text-ink-2">Replay recordings</b>.</li>
        </ol>

        {live && (
          <p className="flex items-center gap-2 text-sm">
            <CameraIcon className="h-4 w-4 text-red-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {live.name} <span className="text-ink-3">· {roomName(map, live.room)}</span>
            </span>
            <span className="text-xs text-ink-3">live camera</span>
          </p>
        )}

        <ul className="space-y-3">
          {recorded.map((c) => (
            <CameraRow key={c.id} map={map} cam={c} disabled={processing} onChanged={onChanged} />
          ))}
        </ul>

        <div className="space-y-2 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant={tl.stale || !tl.ready ? 'primary' : 'secondary'} icon={<RefreshCw className="h-4 w-4" />} loading={processing} disabled={uploaded === 0} onClick={onProcess}>
              {tl.ready ? 'Re-process videos' : 'Process videos'}
            </Button>
            <span className="text-xs text-ink-3">
              {processing
                ? `Processing ${cameraName(map, status?.camera)} · ${Math.round((status?.progress ?? 0) * 100)}%`
                : uploaded === 0
                  ? 'Upload at least one room video first'
                  : tl.ready
                    ? `Ready · ${fmt(tl.duration)} of recordings${tl.processedAt ? ` · processed ${formatDateTime(tl.processedAt)}` : ''}`
                    : 'All videos uploaded · not processed yet'}
            </span>
          </div>
          {uploaded > 0 && missing.length > 0 && !processing && (
            <p className="text-xs text-ink-3">
              No video yet for {missing.map((c) => roomName(map, c.room)).join(', ')}: {missing.length > 1 ? 'those rooms stay' : 'that room stays'} empty on the map.
            </p>
          )}
          {tl.stale && !processing && (
            <p className="flex items-start gap-1.5 text-xs text-amber-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Videos changed since the last processing. Press Re-process videos to update the replay.
            </p>
          )}
          {(processError || status?.state === 'error') && (
            <p className="flex items-start gap-1.5 text-xs text-red-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {processError ?? status?.error}
            </p>
          )}
          <p className="text-xs text-ink-3">Processing takes about as long as the videos and slows the live camera meanwhile.</p>
        </div>
      </div>
    </Card>
  );
}

function CameraRow({ map, cam, disabled, onChanged }: { map: HouseMap; cam: MapCamera; disabled: boolean; onChanged: (m: HouseMap) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [offset, setOffset] = useState(String(cam.offset ?? 0));
  const [savingOffset, setSavingOffset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => setOffset(String(cam.offset ?? 0)), [cam.offset]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setDone(null);
    try {
      onChanged(await mapService.uploadVideo(cam.id, file));
      setDone(`Uploaded ${file.name}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveOffset = async () => {
    const value = Number(offset);
    if (!Number.isFinite(value) || value === (cam.offset ?? 0)) {
      setOffset(String(cam.offset ?? 0));
      return;
    }
    setSavingOffset(true);
    setError(null);
    try {
      onChanged(await mapService.setOffset(cam.id, value));
    } catch (e) {
      setError((e as Error).message);
      setOffset(String(cam.offset ?? 0));
    } finally {
      setSavingOffset(false);
    }
  };

  return (
    <li className={cn('rounded-lg border px-3 py-2', cam.videoFound ? 'border-line bg-surface-2/50' : 'border-amber-400/40 bg-amber-400/5')}>
      <div className="flex flex-wrap items-center gap-2">
        <CameraIcon className={cn('h-4 w-4 shrink-0', cam.videoFound ? 'text-ink-2' : 'text-amber-300')} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {cam.name} <span className="font-normal text-ink-3">· {roomName(map, cam.room)}</span>
          </p>
          <p className={cn('truncate text-xs', cam.videoFound ? 'text-ink-3' : 'text-amber-300')}>
            {cam.videoFound
              ? `${cam.video} · ${cam.videoDuration != null ? fmt(cam.videoDuration) : 'length unknown'}${cam.videoSizeBytes ? ` · ${mb(cam.videoSizeBytes)}` : ''}`
              : `No video yet (will be saved as ${cam.video})`}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
          className="hidden"
          aria-label={`Video for ${cam.name}`}
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <Button size="sm" variant={cam.videoFound ? 'secondary' : 'primary'} icon={<Upload className="h-4 w-4" />} loading={uploading} disabled={disabled} onClick={() => fileRef.current?.click()}>
          {cam.videoFound ? 'Replace' : 'Upload video'}
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
        <label htmlFor={`offset-${cam.id}`} className="whitespace-nowrap">
          Starts at
        </label>
        <div className="w-20 shrink-0">
          <Input
            id={`offset-${cam.id}`}
            type="number"
            min={0}
            max={3600}
            step={0.5}
            value={offset}
            disabled={savingOffset}
            onChange={(e) => setOffset(e.target.value)}
            onBlur={saveOffset}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-7 px-2 text-xs"
          />
        </div>
        <span className="whitespace-nowrap">s into the replay</span>
      </div>
      {uploading && <p className="mt-1 text-xs text-ink-2">Uploading… (large videos take a while)</p>}
      {done && !uploading && <p className="mt-1 truncate text-xs text-green-300">{done}</p>}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </li>
  );
}

const roomName = (map: HouseMap, id: string) => map.rooms.find((r) => r.id === id)?.name ?? id;
const cameraName = (map: HouseMap, id: string | null | undefined) => map.cameras.find((c) => c.id === id)?.name ?? '';
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
