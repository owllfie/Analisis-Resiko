import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { asInt } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logActivity } from '../utils/activity.js';
import { HISTORY_ENTITIES } from '../utils/history.js';

const router = Router();
router.use(authenticate);

// Frontend memakai nama jamak (projects/tasks/users); tabel menyimpan bentuk tunggal.
const ENTITY_ALIAS = {
  projects: 'project',
  project: 'project',
  tasks: 'task',
  task: 'task',
  users: 'user',
  user: 'user',
};

router.get(
  '/',
  requirePermission('history.view'),
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePagination(req.query);
    const entityParam = req.query.entity;
    const id = req.query.id ? parseInt(req.query.id, 10) : null;
    // Histori Update hanya menampilkan perubahan kolom (action = 'update'),
    // bukan pembuatan maupun penghapusan data.
    let where = "action = 'update'";
    const params = [];
    if (entityParam && ENTITY_ALIAS[entityParam]) {
      params.push(ENTITY_ALIAS[entityParam]);
      where += ` AND entity_type = ?`;
    }
    if (id) {
      params.push(id);
      where += ` AND entity_id = ?`;
    }
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM update_history h WHERE ${where}`,
      params,
    );
    const listParams = [...params, limit, offset];
    const { rows } = await query(
      `SELECT h.*, u.name AS actor_name FROM update_history h
       LEFT JOIN users u ON u.id = h.actor_id
       WHERE ${where} ORDER BY h.created_at DESC
       LIMIT ? OFFSET ?`,
      listParams,
    );
    res.json({ data: rows, page, limit, total: Number(countRows[0]?.total ?? 0) });
  }),
);

router.post(
  '/revert',
  requirePermission('history.revert'),
  asyncHandler(async (req, res) => {
    const historyId = asInt(req.body.historyId, 'historyId');
    const { rows } = await query('SELECT * FROM update_history WHERE id = ?', [historyId]);
    if (!rows[0]) throw notFound('Riwayat tidak ditemukan');
    const h = rows[0];
    if (h.reverted_at) throw badRequest('Riwayat ini sudah pernah di-revert');
    if (h.action !== 'update') throw badRequest('Hanya riwayat perubahan (update) yang dapat di-revert');

    const spec = HISTORY_ENTITIES[h.entity_type];
    if (!spec) throw badRequest('Entitas riwayat tidak dikenal');

    const snapshot = h.snapshot || {};
    const columns = Object.keys(snapshot).filter((c) => spec.columns.includes(c));
    if (columns.length === 0) throw badRequest('Tidak ada data yang dapat dikembalikan');

    const sets = columns.map((c) => `${c} = ?`);
    const params = columns.map((c) => snapshot[c]);
    params.push(h.entity_id);
    const result = await query(
      `UPDATE ${spec.table} SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params,
    );
    if (!result.affectedRows) throw notFound('Data asal tidak ditemukan (mungkin sudah dihapus)');

    await query('UPDATE update_history SET reverted_at = NOW(), reverted_by = ? WHERE id = ?', [req.user.id, historyId]);
    await logActivity({
      entityType: h.entity_type,
      entityId: h.entity_id,
      action: 'revert',
      description: `Perubahan #${historyId} dikembalikan ke kondisi sebelumnya`,
      actorId: req.user.id,
    });
    res.json({ message: 'Perubahan berhasil dikembalikan', restored: columns });
  }),
);

// Hapus satu catatan histori (khusus admin/superadmin).
router.delete(
  '/:id',
  requirePermission('history.revert'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw badRequest('ID histori tidak valid');
    const { affectedRows } = await query('DELETE FROM update_history WHERE id = ?', [id]);
    if (!affectedRows) throw notFound('Riwayat tidak ditemukan');
    res.json({ message: 'Riwayat dihapus' });
  }),
);

export default router;
