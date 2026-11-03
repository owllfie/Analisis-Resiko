import { useCallback, useEffect, useState } from 'react';
import { api } from './client.js';
import { useRealtime } from '../context/RealtimeContext.jsx';

export function useApiGet(path, deps = []) {
  const { enabled, intervalMs, markUpdated } = useRealtime();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (silent = false) => {
      if (!path) {
        setData(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api.get(path);
        setData(res);
        setError(null);
        markUpdated();
      } catch (err) {
        // Saat auto-refresh (silent) gagal, pertahankan data lama agar layar tidak kosong.
        if (!silent) setError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [path, markUpdated],
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled || !path) return undefined;
    const id = setInterval(() => load(true), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, path, load]);

  return { data, error, loading, reload: () => load(false), setData };
}
