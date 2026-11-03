import { useEffect, useState } from 'react';
import { IconMenu, IconSearch, IconRefresh, IconClock, IconClose } from '../lib/ui.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';

export default function Navbar({ title, subtitle, search, setSearch, onToggleSidebar, onReload }) {
  const [now, setNow] = useState(() => new Date());
  const { enabled, toggle, lastUpdated, intervalMs } = useRealtime();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeLabel = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <header className="bg-white/95 backdrop-blur border-b border-gray-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sticky top-0 z-30">
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition lg:hidden"
            aria-label="Buka/tutup sidebar"
          >
            <IconMenu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 truncate">{title}</h1>
            <p className="text-sm text-gray-400 truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative hidden md:block">
            <span className="absolute left-3 top-2.5 text-gray-400">
              <IconSearch className="w-4 h-4" />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari proyek atau tugas..."
              className="w-56 lg:w-72 pl-10 pr-9 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                title="Bersihkan pencarian"
                className="absolute right-2 top-2 p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <IconClose className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={onReload}
            title="Muat ulang data"
            aria-label="Muat ulang data"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
          >
            <IconRefresh className="w-5 h-5" />
          </button>

          <button
            onClick={toggle}
            title={enabled ? `Auto-refresh aktif tiap ${Math.round(intervalMs / 1000)} detik. Klik untuk mematikan.` : 'Auto-refresh nonaktif. Klik untuk mengaktifkan.'}
            aria-pressed={enabled}
            className={`hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition ${
              enabled
                ? 'border-green-100 bg-green-50 text-green-700 hover:bg-green-100'
                : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
            }`}
          >
            <span className="relative flex w-2 h-2">
              {enabled && <span className="absolute inline-flex w-full h-full rounded-full bg-green-500 opacity-75 animate-ping" />}
              <span className={`relative inline-flex w-2 h-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
            </span>
            {enabled ? 'Live' : 'Off'}
          </button>

          <div className="hidden lg:flex items-center gap-2.5 pl-3 border-l border-gray-100">
            <IconClock className="w-5 h-5 text-gray-400" />
            <div className="leading-tight">
              <div className="font-semibold text-sm text-gray-700 tabular-nums">{timeLabel}</div>
              <div className="text-xs text-gray-400">{dateLabel}</div>
              <div className="text-[10px] text-gray-400">
                {updatedLabel ? `Data diperbarui ${updatedLabel}` : 'Menunggu data...'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
