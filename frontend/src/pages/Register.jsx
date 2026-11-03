import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthBrand, BrandMark, Field, inputCls, btnPrimary, IconShield } from '../lib/ui.jsx';

const FEATURES = [
  'Buat akun dan mulai kelola proyek Anda',
  'Analisis risiko berbasis AI/ML (scikit-learn)',
  'Penentuan prioritas pekerjaan otomatis dengan alasan',
  'Pemantauan progres dan riwayat aktivitas',
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Konfirmasi password tidak cocok');
      return;
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <AuthBrand
        lead="Daftar sekarang untuk mengelola proyek, memantau risiko, dan memprioritaskan pekerjaan."
        features={FEATURES}
        note="Akun baru berperan sebagai member. Peran dapat ditingkatkan oleh administrator."
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
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Buat akun baru</h2>
            <p className="text-sm text-gray-400 mt-1">Isi data berikut untuk mendaftar.</p>

            {error && (
              <div className="mt-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Nama lengkap">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Nama Anda"
                  className={inputCls}
                />
              </Field>
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
                  autoComplete="new-password"
                  placeholder="Minimal 6 karakter"
                  className={inputCls}
                />
              </Field>
              <Field label="Konfirmasi password">
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Ulangi password"
                  className={inputCls}
                />
              </Field>
              <button type="submit" disabled={loading} className={`${btnPrimary} w-full`}>
                {loading ? 'Memproses...' : 'Daftar'}
              </button>
            </form>

            <p className="mt-6 pt-5 border-t border-gray-100 flex items-start gap-2 text-xs text-gray-400 leading-relaxed">
              <IconShield className="w-4 h-4 shrink-0 mt-px text-gray-300" />
              Password disimpan dalam bentuk ter-hash (bcrypt) dan tidak pernah disimpan dalam bentuk asli.
            </p>
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Sudah punya akun?{' '}
            <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
