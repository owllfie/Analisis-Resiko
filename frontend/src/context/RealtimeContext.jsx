import { createContext, useCallback, useContext, useState } from 'react';

const RealtimeContext = createContext(null);

const DEFAULT_INTERVAL = 15000;

export function RealtimeProvider({ children }) {
  const [enabled, setEnabled] = useState(true);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL);
  const [lastUpdated, setLastUpdated] = useState(null);

  const markUpdated = useCallback(() => setLastUpdated(Date.now()), []);
  const toggle = useCallback(() => setEnabled((e) => !e), []);

  const value = { enabled, setEnabled, toggle, intervalMs, setIntervalMs, lastUpdated, markUpdated };
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime harus dipakai di dalam RealtimeProvider');
  return ctx;
}
