import { query } from '../config/db.js';

// Katalog izin yang dikenal aplikasi. `key` dipakai di kode dan di database,
// sedangkan `label`/`description`/`group` hanya untuk tampilan matriks.
// Menambah izin baru cukup dilakukan di sini + memakai `can()` pada rute terkait.
export const PERMISSION_CATALOG = [
  { key: 'project.view', group: 'Proyek', label: 'Melihat proyek & tugas', description: 'Membuka detail proyek dan daftar tugasnya', ownable: true },
  { key: 'project.create', group: 'Proyek', label: 'Membuat proyek', description: 'Menambah proyek baru', ownable: false },
  { key: 'project.update', group: 'Proyek', label: 'Mengubah proyek', description: 'Menyunting data dan anggaran proyek', ownable: true },
  { key: 'project.delete', group: 'Proyek', label: 'Menghapus / mengarsipkan proyek', description: 'Menghapus atau mengarsipkan proyek', ownable: true },
  { key: 'task.create', group: 'Proyek', label: 'Membuat tugas', description: 'Menambah tugas pada proyek', ownable: true },
  { key: 'task.update', group: 'Proyek', label: 'Mengubah detail tugas', description: 'Menyunting judul, penanggung jawab, dan atribut tugas', ownable: true },
  { key: 'task.progress', group: 'Proyek', label: 'Memperbarui progres tugas', description: 'Mengubah status, progres, dan durasi aktual', ownable: true },
  { key: 'task.delete', group: 'Proyek', label: 'Menghapus tugas', description: 'Menghapus tugas (masuk ke Sampah)', ownable: true },
  { key: 'dependency.manage', group: 'Proyek', label: 'Mengelola prasyarat tugas', description: 'Mengatur ketergantungan antar tugas', ownable: true },
  { key: 'risk.analyze', group: 'Proyek', label: 'Menjalankan analisis risiko', description: 'Memicu analisis AI pada proyek', ownable: false },

  { key: 'user.view', group: 'Administrasi', label: 'Melihat daftar pengguna', description: 'Diperlukan untuk menetapkan penanggung jawab', ownable: false },
  { key: 'user.manage', group: 'Administrasi', label: 'Manajemen Pengguna', description: 'Membuat, mengubah, dan menghapus akun beserta perannya', ownable: false },
  { key: 'history.view', group: 'Administrasi', label: 'Melihat histori update', description: 'Melihat riwayat perubahan data', ownable: true },
  { key: 'history.revert', group: 'Administrasi', label: 'Mengembalikan perubahan (revert)', description: 'Membatalkan perubahan data tertentu', ownable: false },
  { key: 'activity.view', group: 'Administrasi', label: 'Melihat riwayat aktivitas', description: 'Melihat catatan aktivitas pengguna', ownable: false },
  { key: 'activity.delete', group: 'Administrasi', label: 'Menghapus log aktivitas', description: 'Membersihkan catatan aktivitas', ownable: false },
  { key: 'trash.manage', group: 'Administrasi', label: 'Mengelola sampah', description: 'Memulihkan atau menghapus permanen data terhapus', ownable: false },
  { key: 'access.manage', group: 'Administrasi', label: 'Mengelola hak akses', description: 'Mengubah izin peran pada halaman Matriks Hak Akses', ownable: false },
];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);
export const ROLES = ['superadmin', 'admin', 'manager', 'member'];

// Izin yang tidak pernah boleh dicabut dari superadmin, agar tidak ada
// kemungkinan terkunci dari halaman pengelolaan akses.
const SUPERADMIN_LOCKED = new Set(['access.manage', 'user.manage']);

// Cache sederhana di memori. Dimuat ulang setiap kali izin diubah.
let cache = null;

async function loadAll() {
  const { rows } = await query('SELECT role, permission_key, allowed, scope FROM role_permissions');
  const map = new Map();
  for (const r of rows) {
    map.set(`${r.role}:${r.permission_key}`, {
      allowed: Number(r.allowed) === 1,
      scope: r.scope === 'own' ? 'own' : 'all',
    });
  }
  return map;
}

export async function refreshPermissions() {
  cache = await loadAll();
  return cache;
}

async function getCache() {
  if (!cache) cache = await loadAll();
  return cache;
}

// Mengembalikan izin efektif untuk sebuah peran: { allowed, scope }.
// Bila baris tidak ada di database, izin dianggap DITOLAK (aman secara bawaan).
export async function permissionFor(role, key) {
  const map = await getCache();
  const hit = map.get(`${role}:${key}`);
  return hit || { allowed: false, scope: 'all' };
}

// Inti pemeriksaan izin:
//  - izin harus `allowed`
//  - bila `scope = 'own'`, pemanggil harus menyatakan bahwa ia memiliki data
//    (`isOwner = true`), kecuali izinnya `all`.
export async function can(user, key, { isOwner = false } = {}) {
  if (!user) return false;
  // Superadmin selalu boleh, kecuali izinnya sudah dicabut secara eksplisit
  // untuk kunci yang tidak terkunci. Ini menjaga superadmin tetap bisa mengelola.
  const perm = await permissionFor(user.role, key);
  if (!perm.allowed) return false;
  if (perm.scope === 'all') return true;
  return isOwner || user.role === 'superadmin';
}

// Matriks lengkap untuk halaman pengelolaan (semua peran x semua izin).
export async function getMatrix() {
  const map = await getCache();
  return ROLES.map((role) => ({
    role,
    permissions: PERMISSION_KEYS.map((key) => {
      const hit = map.get(`${role}:${key}`) || { allowed: false, scope: 'all' };
      const catalog = PERMISSION_CATALOG.find((p) => p.key === key);
      return {
        key,
        allowed: hit.allowed,
        scope: hit.scope,
        locked: role === 'superadmin' && SUPERADMIN_LOCKED.has(key),
        ownable: !!catalog?.ownable,
      };
    }),
  }));
}

// Menyimpan perubahan izin. `updates` = array { role, permissionKey, allowed, scope }.
export async function updatePermissions(updates) {
  const valid = [];
  for (const u of updates || []) {
    const role = String(u.role || '');
    const key = String(u.permissionKey || u.key || '');
    if (!ROLES.includes(role)) continue;
    if (!PERMISSION_KEYS.includes(key)) continue;
    const locked = role === 'superadmin' && SUPERADMIN_LOCKED.has(key);
    const allowed = u.allowed ? 1 : 0;
    const scope = u.scope === 'own' ? 'own' : 'all';
    // Izin terkunci tidak dapat diubah maupun dicabut.
    if (locked) continue;
    valid.push([role, key, allowed, scope]);
  }
  if (valid.length === 0) return 0;

  let affected = 0;
  for (const [role, key, allowed, scope] of valid) {
    const { affectedRows } = await query(
      `INSERT INTO role_permissions (role, permission_key, allowed, scope)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), scope = VALUES(scope)`,
      [role, key, allowed, scope],
    );
    affected += affectedRows;
  }
  await refreshPermissions();
  return affected;
}
