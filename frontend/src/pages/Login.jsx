import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthBrand, BrandMark, Field, inputCls, btnPrimary, IconShield } from '../lib/ui.jsx';

const FEATURES = [
  'Manajemen proyek dan tugas dengan ketergantungan antar-tugas',
  'Analisis risiko berbasis AI/ML (RandomForest, scikit-learn)',
  'Penentuan prioritas pekerjaan otomatis dengan alasan',
  'Pemantauan progres dan riwayat aktivitas',
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <AuthBrand
        lead="Kelola proyek, pantau risiko, dan prioritaskan pekerjaan dengan bantuan analisis otomatis."
        features={FEATURES}
        note="Indikator risiko dihitung dengan model Machine Learning (RandomForest) melalui layanan AI, dengan fallback aturan bila layanan tidak tersedia."
      />

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <BrandMark />
            <div className="leading-tight text-left">
              <div className="font-bold text-xl text-gray-900">SIMProyek</div>
              <div className="text-xs text-gray-400">Powered by AI</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Masuk ke akun Anda</h2>
            <p className="text-sm text-gray-400 mt-1">Gunakan email dan password terdaftar.</p>

            {error && (
              <div className="mt-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="nama@gmail.com"
                  className={inputCls}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={inputCls}
                />
              </Field>
              <button type="submit" disabled={loading} className={`${btnPrimary} w-full`}>
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>

            <p className="mt-6 pt-5 border-t border-gray-100 flex items-start gap-2 text-xs text-gray-400 leading-relaxed">
              <IconShield className="w-4 h-4 shrink-0 mt-px text-gray-300" />
              Sesi Anda dilindungi — kredensial dikirim melalui kanal terenkripsi dan sesi memakai cookie httpOnly.
            </p>
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-700">Daftar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
