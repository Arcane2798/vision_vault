import { useAsync } from '@/hooks/useAsync';
import { statusService } from '@/services';

const POLL_MS = 2000;

/** Live engine status (FPS, unknown people in view, security level), refreshed every 2 s. */
export function useLiveStatus() {
  return useAsync(() => statusService.get(), [], POLL_MS);
}
