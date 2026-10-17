import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api/client';

/**
 * Loads data for a screen. `loading` is the first load (no data yet); `refreshing` is a
 * reload with data on screen, which stays visible if the reload fails (`error` then explains
 * why). Responses that arrive after a newer request, or after the screen closed, are ignored.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const mounted = useRef(true);
  const hasData = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const fetchNow = useCallback(
    (mode: 'initial' | 'refresh') => {
      const id = ++request.current;
      if (mode === 'refresh' && hasData.current) setRefreshing(true);
      else setLoading(true);
      setError(null);
      run()
        .then((value) => {
          if (!mounted.current || id !== request.current) return;
          hasData.current = true;
          setData(value);
        })
        .catch((e: unknown) => {
          if (!mounted.current || id !== request.current) return;
          setError(messageOf(e));
        })
        .finally(() => {
          if (!mounted.current || id !== request.current) return;
          setLoading(false);
          setRefreshing(false);
        });
    },
    [run],
  );

  useEffect(() => {
    mounted.current = true;
    fetchNow('initial');
    return () => {
      mounted.current = false;
    };
  }, [fetchNow]);

  const reload = useCallback(() => fetchNow('refresh'), [fetchNow]);
  return { data, error, loading: loading && data === null, refreshing, reload, setData };
}

export function messageOf(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
}
