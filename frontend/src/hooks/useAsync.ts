import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** true only for the very first load - later refreshes keep showing the old data */
  initialLoading: boolean;
  reload: () => void;
}

/**
 * Runs an async loader, re-runs it when `deps` change and optionally every `refreshMs`.
 * Ignores stale responses so a slow old request never overwrites a newer one.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = [], refreshMs?: number): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const callId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const id = ++callId.current;
    setLoading(true);
    loaderRef
      .current()
      .then((d) => {
        if (id !== callId.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => id === callId.current && setError(e))
      .finally(() => id === callId.current && setLoading(false));
  }, []);

  useEffect(run, deps);

  useEffect(() => {
    if (!refreshMs) return;
    const t = window.setInterval(() => document.visibilityState === 'visible' && run(), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs, run]);

  return { data, error, loading, initialLoading: loading && data === undefined, reload: run };
}
