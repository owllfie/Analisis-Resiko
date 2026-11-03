import { initials, avatarColor } from './format.js';

export const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition disabled:opacity-50 shadow-sm shadow-indigo-600/20';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-50';
export const btnGhost =
  'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-gray-500 text-sm font-medium hover:bg-gray-100 transition disabled:opacity-50';
export const btnDanger =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition disabled:opacity-50';
export const btnSm = 'px-3 py-1.5 text-xs';

export function Card({ children, className = '', padded = true }) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
      <div className={padded ? 'p-6' : ''}>{children}</div>
    </section>
  );
}

export function CardHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4 ${className}`}>
      <div>
        <h2 className="font-bold text-lg text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, color = 'text-indigo-600', bg = 'bg-indigo-50' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 font-medium truncate">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 truncate">{value}</p>
          {hint && <p className={`mt-1 text-xs font-semibold ${color}`}>{hint}</p>}
        </div>
        {icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
            <span className={color}>{icon}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Badge({ tone = 'bg-gray-100 text-gray-600', children }) {
  return <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${tone}`}>{children}</span>;
}

export function ProgressBar({ value, className = '' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`h-2 rounded-full bg-gray-100 overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Spinner({ label = 'Memuat data...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="w-8 h-8 rounded-full border-[3px] border-gray-200 border-t-indigo-600 animate-spin" />
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Belum ada data', message }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="font-semibold text-gray-700">{title}</p>
      {message && <p className="text-sm text-gray-400 mt-1">{message}</p>}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm flex items-center justify-between gap-3">
      <span>{error.message || String(error)}</span>
      {onRetry && (
        <button className="text-red-700 font-semibold hover:underline shrink-0" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children }) {
  const tones = {
    info: 'bg-blue-50 border-blue-100 text-blue-700',
    success: 'bg-green-50 border-green-100 text-green-700',
    warn: 'bg-amber-50 border-amber-100 text-amber-700',
  };
  return <div className={`px-4 py-3 rounded-xl border text-sm ${tones[tone] || tones.info}`}>{children}</div>;
}

export function Modal({ title, subtitle, onClose, children, footer, size = 'max-w-lg', closeOnBackdrop = true, closeOnEsc = true }) {
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      onClose?.();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={handleBackdrop} onKeyDown={(e) => { if (e.key === 'Escape' && closeOnEsc) onClose?.(); }} tabIndex={-1}>
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${size} max-h-[90vh] overflow-auto animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-20">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0" aria-label="Tutup">
            <IconClose className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white z-20">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title = 'Konfirmasi', message, confirmLabel = 'Ya, lanjutkan', onConfirm, onCancel, danger = true, loading }) {
  if (!open) return null;
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="max-w-md"
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={loading}>Batal</button>
          <button
            type="button"
            className={danger ? `${btnPrimary} bg-red-600 hover:bg-red-700 shadow-red-600/20` : btnPrimary}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
    </Modal>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Avatar({ name, className = 'w-9 h-9 text-sm' }) {
  return (
    <div className={`rounded-full ${avatarColor(name || '')} text-white flex items-center justify-center font-semibold shrink-0 ${className}`}>
      {initials(name)}
    </div>
  );
}

export function Checkbox({ checked = false, indeterminate = false, onChange, ariaLabel, className = '' }) {
  return (
    <label className={`inline-flex items-center justify-center cursor-pointer ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        ref={(el) => {
          if (el) el.indeterminate = !checked && indeterminate;
        }}
        onChange={(e) => onChange?.(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
      />
    </label>
  );
}

export function Pagination({ page, totalPages, total, onChange }) {
  if (!totalPages || totalPages <= 1) {
    if (total != null) {
      return (
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-sm text-gray-400">Menampilkan <span className="font-semibold text-gray-600">{total}</span> data</p>
        </div>
      );
    }
    return null;
  }
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i += 1) pages.push(i);
  const btnCls = 'w-8 h-8 flex items-center justify-center rounded-lg text-sm transition';
  return (
    <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-gray-400">
        Menampilkan <span className="font-semibold text-gray-600">{total}</span> data · halaman {page} dari {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className={`${btnCls} ${page <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
          aria-label="Halaman sebelumnya"
        >
          ‹
        </button>
        {start > 1 && <span className="px-1 text-gray-400">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`${btnCls} ${p === page ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {p}
          </button>
        ))}
        {end < totalPages && <span className="px-1 text-gray-400">…</span>}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className={`${btnCls} ${page >= totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
          aria-label="Halaman berikutnya"
        >
          ›
        </button>
      </div>
    </div>
  );
}

/* ---------- Brand ---------- */
export function BrandMark({ className = 'w-9 h-9', iconClassName = 'w-5 h-5', tone = 'bg-indigo-600' }) {
  return (
    <div className={`${tone} rounded-xl flex items-center justify-center shrink-0 ${className}`}>
      <svg className={`text-white ${iconClassName}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11h10M9 15h7M9 7h10" />
        <path d="M4.5 5.5h.01M4.5 9.5h.01M4.5 13.5h.01" />
      </svg>
    </div>
  );
}

// Panel merek untuk halaman Login & Register (dua kolom).
export function AuthBrand({ title = 'Sistem Informasi Manajemen Proyek Berbasis AI', lead, features = [], note }) {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white flex-col justify-between p-10 xl:p-12">
      {/* Pola titik halus + kilau lembut agar panel terasa matang tanpa ramai */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.15]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)', backgroundSize: '22px 22px' }}
      />
      <div aria-hidden="true" className="absolute -top-24 -right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex items-center gap-3">
        <BrandMark className="w-11 h-11 bg-white/15" iconClassName="w-6 h-6" />
        <div className="leading-tight">
          <div className="font-bold text-xl tracking-tight">SIMProyek</div>
          <div className="text-xs text-indigo-200">Powered by AI</div>
        </div>
      </div>

      <div className="relative my-10">
        <h1 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight">{title}</h1>
        {lead && <p className="mt-4 text-indigo-100 max-w-md leading-relaxed">{lead}</p>}
        {features.length > 0 && (
          <ul className="mt-8 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-indigo-50">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <IconCheck className="w-3.5 h-3.5" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {note && <p className="relative text-xs text-indigo-200 leading-relaxed max-w-md">{note}</p>}
    </div>
  );
}

/* ---------- Icons ---------- */
const base = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2 };

function I({ className = 'w-5 h-5', children, strokeWidth }) {
  return (
    <svg {...base} strokeWidth={strokeWidth || 2} className={className} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const IconDashboard = (p) => <I {...p}><path d="M3 12l9-8 9 8" /><path d="M5 10v10h14V10" /></I>;
export const IconProjects = (p) => <I {...p}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></I>;
export const IconRisk = (p) => <I {...p}><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></I>;
export const IconPriority = (p) => <I {...p}><path d="M3 6h11M3 12h11M3 18h11" /><path d="M18 9l3-3-3-3M21 15l-3 3 3 3" /></I>;
export const IconActivity = (p) => <I {...p}><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></I>;
export const IconUsers = (p) => <I {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></I>;
export const IconSearch = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></I>;
export const IconRefresh = (p) => <I {...p}><path d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992" /><path d="M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991l-3.181 3.182A8.25 8.25 0 014.031 19.63" /></I>;
export const IconClock = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>;
export const IconMenu = (p) => <I {...p}><path d="M4 6h16M4 12h16M4 18h16" /></I>;
export const IconClose = (p) => <I {...p}><path d="M6 18L18 6M6 6l12 12" /></I>;
export const IconPlus = (p) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
export const IconEdit = (p) => <I {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></I>;
export const IconTrash = (p) => <I {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></I>;
export const IconCheck = (p) => <I {...p}><path d="M20 6L9 17l-5-5" /></I>;
export const IconArrowUp = (p) => <I {...p}><path d="M12 19V5M5 12l7-7 7 7" /></I>;
export const IconArrowDown = (p) => <I {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></I>;
export const IconLogout = (p) => <I {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></I>;
export const IconUser = (p) => <I {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></I>;
export const IconCalendar = (p) => <I {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></I>;
export const IconChart = (p) => <I {...p}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></I>;
export const IconTarget = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></I>;
export const IconLink = (p) => <I {...p}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></I>;
export const IconSpark = (p) => <I {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /></I>;
export const IconBook = (p) => <I {...p}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></I>;
export const IconInfo = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></I>;
export const IconShield = (p) => <I {...p}><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" /></I>;
export const IconCpu = (p) => <I {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></I>;
