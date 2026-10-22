import { config, isMock } from '@/config/env';
import { sourceService } from '@/services';
import { useAsync } from './useAsync';

/** True while the engine plays a recorded test video instead of the camera (live mode only). */
export function useTestVideoSource(): boolean {
  const source = useAsync(() => (isMock ? Promise.resolve(null) : sourceService.get()), [], config.refreshIntervalMs);
  return source.data?.kind === 'file';
}
