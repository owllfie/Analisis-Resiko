import { forbidden } from './errors.js';
import { query } from '../config/db.js';

export const isSuperAdmin = (user) => user?.role === 'superadmin';
export const isAdmin = (user) => user?.role === 'admin' || isSuperAdmin(user);
export const isManager = (user) => user?.role === 'manager' || isAdmin(user);

// Menyatakan apakah pengguna "memiliki" proyek terkait, yaitu admin/superadmin
// (semua data) atau manajer yang memimpin proyek tersebut. Dipakai sebagai
// penentu `isOwner` pada izin ber-scope 'own'.
export async function isProjectOwner(user, projectId) {
  if (isAdmin(user)) return true;
  if (!projectId) return false;
  const { rows } = await query('SELECT manager_id FROM projects WHERE id = ?', [projectId]);
  return rows[0]?.manager_id === user?.id;
}

// Menyatakan apakah pengguna "memiliki" tugas terkait: admin/superadmin,
// manajer pemilik proyek, atau anggota yang ditugaskan pada tugas itu.
export async function isTaskOwner(user, taskId) {
  if (isAdmin(user)) return true;
  if (!taskId) return false;
  const { rows } = await query(
    `SELECT t.assignee_id, p.manager_id
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?`,
    [taskId],
  );
  const row = rows[0];
  if (!row) return false;
  return row.manager_id === user?.id || row.assignee_id === user?.id;
}

export function assertProjectManage(user, project) {
  if (isAdmin(user)) return;
  if (user?.role === 'manager' && project.manager_id === user.id) return;
  throw forbidden('Hanya admin atau manajer proyek ini yang dapat mengubah proyek');
}

// Dapat melihat proyek bila admin, manajer pemilik, atau anggota yang punya tugas di dalamnya.
export function assertProjectView(user, project, hasAssignedTask) {
  if (isSuperAdmin(user) || isAdmin(user)) return;
  if (user?.role === 'manager' && project.manager_id === user.id) return;
  if (user?.role === 'manager') return;
  if (user?.role === 'member' && hasAssignedTask) return;
  throw forbidden('Anda tidak memiliki akses ke proyek ini');
}
