import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">Memuat aplikasi...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role) && user.role !== 'superadmin') {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="font-semibold text-gray-800">Akses ditolak</p>
          <p className="text-sm text-gray-400 mt-1">Anda tidak memiliki izin membuka halaman ini.</p>
        </div>
      </div>
    );
  }
  return children;
}
