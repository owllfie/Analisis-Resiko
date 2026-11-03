export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatCurrency(value) {
  if (value == null || value === '') return '-';
  const n = Number(value);
  if (Number.isNaN(n)) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

// Format angka dengan pemisah ribuan titik, tanpa simbol mata uang (mis. 150000000 -> "150.000.000").
export function formatThousands(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (Number.isFinite(n)) return Math.round(n).toLocaleString('id-ID');
  const digits = String(value).replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('id-ID') : '';
}

// Ubah nilai apa pun (angka atau string berformat) menjadi string digit saja untuk state/input angka.
export function toDigits(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value).replace(/\D/g, '');
  return String(Math.round(n));
}

export function relativeDays(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

const AVATAR_COLORS = [
  'bg-indigo-600', 'bg-violet-600', 'bg-blue-600', 'bg-emerald-600',
  'bg-amber-600', 'bg-rose-600', 'bg-cyan-600', 'bg-fuchsia-600',
];

export function avatarColor(seed = '') {
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) sum += seed.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export const ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Admin', manager: 'Manajer', member: 'Anggota' };
export const ROLE_BADGE = {
  superadmin: 'bg-violet-100 text-violet-700',
  admin: 'bg-indigo-100 text-indigo-700',
  manager: 'bg-green-100 text-green-700',
  member: 'bg-amber-100 text-amber-700',
};
export const STATUS_LABEL = {
  todo: 'To Do',
  in_progress: 'Dikerjakan',
  blocked: 'Terhambat',
  completed: 'Selesai',
};
export const STATUS_BADGE = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
};
export const RISK_LABEL = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };
export const RISK_BADGE = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};
export const IMPORTANCE_LABEL = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };
export const IMPORTANCE_BADGE = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-red-100 text-red-700',
};
export const PROJECT_STATUS_LABEL = {
  active: 'Aktif',
  archived: 'Diarsipkan',
  completed: 'Selesai',
};
export const PROJECT_STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-600',
  completed: 'bg-blue-100 text-blue-700',
};
