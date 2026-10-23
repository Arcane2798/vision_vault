import { useEffect, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { statusService } from '@/services';

const POLL_MS = 2000;

/**
 * Live engine status (FPS, unknown people in view, security level), refreshed every 2 s.
 * useAsync keeps the last data when a poll fails, so `stale` marks that case: the numbers on screen
 * are no longer current and must not be presented as live. `updatedAt` = last successful poll.
 */
export function useLiveStatus() {
  const s = useAsync(() => statusService.get(), [], POLL_MS);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // every successful poll returns a new object
  useEffect(() => {
    if (s.data) setUpdatedAt(Date.now());
  }, [s.data]);
  return { ...s, updatedAt, stale: !!s.data && !!s.error };
}
