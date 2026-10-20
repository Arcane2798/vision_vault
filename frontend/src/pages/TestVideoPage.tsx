import { useRef, useState } from 'react';
import { CheckCircle2, Film, Play, RotateCcw, Upload, Video } from 'lucide-react';
import { config } from '@/config/env';
import { useAsync } from '@/hooks/useAsync';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { cameraService, sourceService } from '@/services';
import type { VideoSource, VideoSourceUpdate } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { CameraFeed } from '@/components/cameras/CameraFeed';
import { LiveStatusStrip } from '@/components/live/LiveStatusStrip';
import { cn, formatRelative } from '@/utils/format';

const POLL_MS = 1500;

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/** Run a recorded video through the AI engine instead of the live camera (played once, then held on its last frame). */
export default function TestVideoPage() {
  const cameras = useAsync(() => cameraService.list(), [], config.refreshIntervalMs);
  const source = useAsync(() => sourceService.get(), [], POLL_MS);
  const live = useLiveStatus();
  const [switching, setSwitching] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const camera = cameras.data?.[0];
  const src = source.data;

  const switchTo = async (target: VideoSourceUpdate) => {
    setSwitching(target.kind === 'file' ? target.name : 'camera');
    setActionError(null);
    try {
      await sourceService.set(target);
      source.reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Test with a recorded video"
        description="Plays a video through the AI engine instead of the live camera. Detection, alerts, incidents and Telegram work exactly as they do live. Frames are stamped TEST VIDEO."
      />

      <LiveStatusStrip status={live.data} loading={live.loading} error={live.error} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {cameras.initialLoading ? (
            <Card>
              <LoadingState label="Loading feed…" />
            </Card>
          ) : cameras.error && !cameras.data ? (
            <Card>
              <ErrorState error={cameras.error} onRetry={cameras.reload} />
            </Card>
          ) : camera ? (
            <CameraFeed camera={camera} />
          ) : (
            <Card>
              <EmptyState title="No video feed" message="The backend did not report a camera. Check that it is running." />
            </Card>
          )}

          {src && <NowPlaying source={src} switching={switching} onSwitch={switchTo} />}
          {actionError && (
            <p role="alert" className="text-sm text-danger">
              {actionError}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <UploadCard onUploaded={(name) => switchTo({ kind: 'file', name })} />

          <Card>
            <CardHeader title="Recorded videos" subtitle="Saved in the backend's test_videos/ folder" />
            {source.initialLoading ? (
              <LoadingState label="Loading videos…" />
            ) : source.error && !src ? (
              <ErrorState error={source.error} onRetry={source.reload} />
            ) : !src?.videos.length ? (
              <EmptyState title="No videos yet" message="Upload a recording above to test the system with it." />
            ) : (
              <ul className="divide-y divide-line">
                {src.videos.map((v) => {
                  const playing = src.kind === 'file' && src.name === v.name;
                  return (
                    <li key={v.name} className="flex items-center gap-3 px-4 py-3">
                      <Film className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={v.name}>
                          {v.name}
                        </p>
                        <p className="text-xs text-ink-3">
                          {formatSize(v.sizeBytes)} · added {formatRelative(v.modifiedAt)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={playing ? 'secondary' : 'primary'}
                        icon={playing ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        loading={switching === v.name}
                        disabled={switching !== null}
                        onClick={() => switchTo({ kind: 'file', name: v.name })}
                      >
                        {playing ? 'Restart' : 'Play'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function NowPlaying({ source, switching, onSwitch }: { source: VideoSource; switching: string | null; onSwitch: (t: VideoSourceUpdate) => void }) {
  if (source.kind === 'camera') {
    return (
      <Card className="flex items-center gap-3 px-4 py-3">
        <Video className="h-5 w-5 text-green-400" aria-hidden />
        <p className="text-sm">
          Watching the <span className="font-medium">live camera</span>. Pick a recorded video to test with it.
        </p>
      </Card>
    );
  }
  const pct = Math.round((source.progress ?? 0) * 100);
  return (
    <Card className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {source.finished ? <CheckCircle2 className="h-5 w-5 text-green-400" aria-hidden /> : <Film className="h-5 w-5 text-brand" aria-hidden />}
        <p className="min-w-0 flex-1 truncate text-sm">
          {source.finished ? 'Finished: ' : 'Playing: '}
          <span className="font-medium">{source.name}</span>
          {!source.finished && <span className="text-ink-3"> · {pct}%</span>}
        </p>
        {source.finished && (
          <Button size="sm" icon={<RotateCcw className="h-4 w-4" />} disabled={switching !== null} onClick={() => onSwitch({ kind: 'file', name: source.name! })}>
            Replay
          </Button>
        )}
        <Button size="sm" variant="primary" icon={<Video className="h-4 w-4" />} loading={switching === 'camera'} disabled={switching !== null} onClick={() => onSwitch({ kind: 'camera' })}>
          Back to live camera
        </Button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-[width]', source.finished ? 'bg-green-500' : 'bg-brand')} style={{ width: `${source.finished ? 100 : pct}%` }} />
      </div>
      {source.finished && <p className="text-xs text-ink-3">Any incidents it raised are on the Incidents page. The live camera stays off until you switch back.</p>}
    </Card>
  );
}

function UploadCard({ onUploaded }: { onUploaded: (name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const video = await sourceService.upload(file);
      setFile(null);
      if (input.current) input.current.value = '';
      onUploaded(video.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Upload a recording" subtitle=".mp4, .mov, .avi, .mkv or .webm, up to 500 MB. It starts playing once uploaded." />
      <div className="space-y-3 p-4">
        <input
          ref={input}
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:text-ink-1 hover:file:bg-[#2b3848]"
        />
        {file && <p className="text-xs text-ink-3">{formatSize(file.size)}</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button variant="primary" icon={<Upload className="h-4 w-4" />} loading={busy} disabled={!file} onClick={upload} className="w-full">
          {busy ? 'Uploading…' : 'Upload and play'}
        </Button>
      </div>
    </Card>
  );
}
