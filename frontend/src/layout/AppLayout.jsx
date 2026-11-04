import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import ProfileModal from './ProfileModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSearch } from '../context/SearchContext.jsx';

function pageMeta(pathname) {
  if (pathname === '/') return { title: 'Dashboard', subtitle: 'Ringkasan proyek, risiko, dan prioritas' };
  if (pathname.startsWith('/projects/')) return { title: 'Detail Proyek', subtitle: 'Informasi proyek, tugas, dan ketergantungan' };
  if (pathname.startsWith('/projects')) return { title: 'Proyek', subtitle: 'Kelola seluruh proyek dan progresnya' };
  if (pathname.startsWith('/risk')) return { title: 'Analisis Risiko', subtitle: 'Indikator risiko berbasis AI/ML dan faktor penyebabnya' };
  if (pathname.startsWith('/priorities')) return { title: 'Prioritas Pekerjaan', subtitle: 'Urutan tugas yang disarankan beserta alasannya' };
  if (pathname.startsWith('/activity')) return { title: 'Riwayat Aktivitas', subtitle: 'Catatan perubahan data dan analisis' };
  if (pathname.startsWith('/users')) return { title: 'Manajemen Pengguna', subtitle: 'Kelola akun dan peran pengguna' };
  if (pathname.startsWith('/access')) return { title: 'Matriks Hak Akses', subtitle: 'Perbandingan izin tiap peran terhadap fitur aplikasi' };
  if (pathname.startsWith('/trash')) return { title: 'Sampah', subtitle: 'Pulihkan atau hapus permanen data yang dihapus' };
  if (pathname.startsWith('/history')) return { title: 'Histori Update', subtitle: 'Riwayat perubahan progres tugas dari waktu ke waktu' };
  return { title: 'SIMProyek', subtitle: 'Sistem Informasi Manajemen Proyek' };
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { search, setSearch } = useSearch();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const meta = pageMeta(location.pathname);

  useEffect(() => {
    setSidebarOpen(false);
    setNavigating(true);
    const t = setTimeout(() => setNavigating(false), 500);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const firstName = user?.name?.split(' ')[0] || 'Pengguna';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {navigating && (
        <div className="fixed top-0 left-0 right-0 z-[60] h-1 overflow-hidden">
          <div className="h-full w-1/3 bg-indigo-600 rounded-r-full animate-topbar" />
        </div>
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        onOpenProfile={() => setProfileModal(true)}
        onLogout={handleLogout}
      />

      <div className="lg:pl-64">
        <Navbar
          title={meta.title}
          subtitle={`Selamat datang kembali, ${firstName}`}
          search={search}
          setSearch={setSearch}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onReload={() => window.location.reload()}
        />
        <main className="p-3 sm:p-4 lg:p-6">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      <ProfileModal open={profileModal} onClose={() => setProfileModal(false)} />
    </div>
  );
}
