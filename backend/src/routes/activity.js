import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logActivity } from '../utils/activity.js';

const router = Router();
router.use(authenticate);

// Membuat placeholder `?,?,?` untuk daftar ID (IN clause).
const placeholders = (ids) => ids.map(() => '?').join(',');

// Pemetaan aksi log ke tiga kategori yang ditampilkan pada tab Riwayat Aktivitas.
// "insert" = data baru dicatat, "update" = data diubah/dipulihkan, "delete" = data dihapus.
const ACTION_GROUPS = {
  insert: ['create', 'register'],
  update: [
    'update',
    'update_profile',
    'restore',
    'revert',
    'archive',
    'add_dependency',
    'analyze_risk',
  ],
  delete: ['delete', 'purge'],
};

router.get(
  '/',
  requirePermission('activity.view'),
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePagination(req.query, { defaultLimit: 30 });
    const { entity_type: entityType, action_group: actionGroup } = req.query;
    const params = [];
    const clauses = [];
    if (entityType) {
      clauses.push('a.entity_type = ?');
      params.push(entityType);
    }
    if (actionGroup) {
      const actions = ACTION_GROUPS[actionGroup];
      if (!actions) throw badRequest('Kategori aksi tidak dikenal');
      clauses.push(`a.action IN (${placeholders(actions)})`);
      params.push(...actions);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM activity_log a ${where}`,
      params,
    );
    const listParams = [...params, limit, offset];
    const { rows } = await query(
      `SELECT a.*, u.name AS actor_name FROM activity_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where} ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      listParams,
    );
    res.json({ data: rows, page, limit, total: Number(countRows[0]?.total ?? 0) });
  }),
);

// Hapus banyak catatan aktivitas sekaligus (khusus admin/superadmin).
router.post(
  '/bulk-delete',
  requirePermission('activity.delete'),
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((v) => parseInt(v, 10)).filter(Number.isInteger)
      : [];
    if (ids.length === 0) throw badRequest('Tidak ada aktivitas yang dipilih');
    const { affectedRows } = await query(
      `DELETE FROM activity_log WHERE id IN (${placeholders(ids)})`,
      ids,
    );
    await logActivity({
      entityType: 'activity',
      action: 'delete',
      description: `${affectedRows} catatan aktivitas dihapus`,
      actorId: req.user.id,
    });
    res.json({ message: `${affectedRows} catatan aktivitas dihapus`, count: affectedRows });
  }),
);

// Hapus satu catatan aktivitas (khusus admin/superadmin).
router.delete(
  '/:id',
  requirePermission('activity.delete'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { affectedRows } = await query('DELETE FROM activity_log WHERE id = ?', [id]);
    if (!affectedRows) throw notFound('Aktivitas tidak ditemukan');
    res.json({ message: 'Aktivitas dihapus' });
  }),
);

export default router;
