import { Link, NavLink } from 'react-router-dom';
import {
  IconDashboard, IconProjects, IconRisk, IconPriority, IconActivity, IconUsers, IconClose, IconLogout, IconUser, IconTrash, IconBook, IconShield,
  Avatar, BrandMark,
} from '../lib/ui.jsx';
import { ROLE_BADGE, ROLE_LABEL } from '../lib/format.js';

const NAV = [
  {
    group: 'Utama',
    items: [{ to: '/', label: 'Dashboard', icon: IconDashboard, end: true }],
  },
  {
    group: 'Manajemen',
    items: [
      { to: '/projects', label: 'Proyek', icon: IconProjects },
      { to: '/risk', label: 'Analisis Risiko', icon: IconRisk },
      { to: '/priorities', label: 'Prioritas Pekerjaan', icon: IconPriority },
    ],
  },
  {
    group: 'Administrasi',
    items: [
      { to: '/activity', label: 'Riwayat Aktivitas', icon: IconActivity },
      { to: '/users', label: 'Manajemen Pengguna', icon: IconUsers, roles: ['admin', 'superadmin'] },
      { to: '/access', label: 'Matriks Hak Akses', icon: IconShield, roles: ['admin', 'superadmin'] },
      { to: '/trash', label: 'Sampah', icon: IconTrash, roles: ['admin', 'superadmin'] },
      { to: '/history', label: 'Histori Update', icon: IconActivity, roles: ['admin', 'superadmin', 'manager'] },
    ],
  },
  {
    group: 'Bantuan',
    items: [{ to: '/panduan', label: 'Panduan & AI', icon: IconBook }],
  },
];

function SidebarItem({ to, label, icon: Icon, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
          isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
        }`
      }
    >
      <Icon className="w-5 h-5 shrink-0" />
      {label}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose, user, profileOpen, setProfileOpen, onOpenProfile, onLogout }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200/70 shadow-[1px_0_3px_rgba(15,23,42,0.04)] flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="p-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark />
            <div className="leading-tight">
              <div className="font-bold text-lg tracking-tight text-gray-900">SIMProyek</div>
              <div className="text-[11px] text-gray-400 font-medium">Powered by AI</div>
            </div>
          </Link>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 lg:hidden" aria-label="Tutup sidebar">
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 flex-1 overflow-y-auto pb-4">
          {NAV.map((section) => {
            const items = section.items.filter((it) => !it.roles || it.roles.includes(user?.role));
            if (!items.length) return null;
            return (
              <div key={section.group}>
                <div className="mt-4 mb-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.group}
                </div>
                <div className="space-y-1">
                  {items.map((it) => (
                    <SidebarItem key={it.to} {...it} onNavigate={onClose} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-100 relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition text-left"
          >
            <Avatar name={user?.name} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{user?.name}</div>
              <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${ROLE_BADGE[user?.role] || 'bg-gray-100 text-gray-600'}`}>
                {ROLE_LABEL[user?.role] || user?.role}
              </span>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {profileOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-2 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden animate-slide-up">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-sm font-semibold text-gray-800">{user?.name}</div>
                <div className="text-xs text-gray-400 truncate">{user?.email}</div>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { setProfileOpen(false); onOpenProfile(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  <IconUser className="w-4 h-4" /> Profil Saya
                </button>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition"
                >
                  <IconLogout className="w-4 h-4" /> Keluar
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
