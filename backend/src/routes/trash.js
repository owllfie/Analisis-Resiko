import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { asEnum } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logActivity } from '../utils/activity.js';
import { recordHistory } from '../utils/history.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('trash.manage'));

const ENTITIES = ['projects', 'tasks', 'users'];

const SELECT_BY_ENTITY = {
  projects: 'SELECT id, name FROM projects WHERE deleted_at IS NOT NULL',
  tasks: 'SELECT t.id, t.title AS name FROM tasks t WHERE t.deleted_at IS NOT NULL',
  users: 'SELECT id, name, email FROM users WHERE deleted_at IS NOT NULL',
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePagination(req.query);
    const entity = req.query.entity;
    const wanted = ENTITIES.includes(entity) ? [entity] : ENTITIES;
    const items = [];
    let total = 0;

    for (const key of wanted) {
      const base = SELECT_BY_ENTITY[key];
      const { rows } = await query(`${base} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
      const { rows: countRows } = await query(`SELECT COUNT(*) AS c FROM (${base}) x`);
      total += Number(countRows[0].c);
      for (const row of rows) items.push({ ...row, entity: key });
    }
    res.json({ data: items, page, limit, total });
  }),
);

router.post(
  '/:entity/:id/restore',
  asyncHandler(async (req, res) => {
    const entity = asEnum(req.params.entity, 'entity', ENTITIES);
    const id = parseInt(req.params.id, 10);
    if (entity === 'projects') {
      const { affectedRows } = await query('UPDATE projects SET deleted_at = NULL WHERE id = ?', [id]);
      if (!affectedRows) throw notFound();
      const { rows } = await query('SELECT id, name FROM projects WHERE id = ?', [id]);
      await logActivity({ entityType: 'project', entityId: id, action: 'restore', description: `Proyek '${rows[0].name}' dipulihkan`, actorId: req.user.id });
      await recordHistory({ entityType: 'project', entityId: id, action: 'restore', after: { name: rows[0].name }, actorId: req.user.id });
    } else if (entity === 'tasks') {
      const { affectedRows } = await query('UPDATE tasks SET deleted_at = NULL WHERE id = ?', [id]);
      if (!affectedRows) throw notFound();
      const { rows } = await query('SELECT id, title FROM tasks WHERE id = ?', [id]);
      await logActivity({ entityType: 'task', entityId: id, action: 'restore', description: `Tugas '${rows[0].title}' dipulihkan`, actorId: req.user.id });
      await recordHistory({ entityType: 'task', entityId: id, action: 'restore', after: { title: rows[0].title }, actorId: req.user.id });
    } else if (entity === 'users') {
      const { affectedRows } = await query('UPDATE users SET deleted_at = NULL WHERE id = ?', [id]);
      if (!affectedRows) throw notFound();
      const { rows } = await query('SELECT id, name FROM users WHERE id = ?', [id]);
      await logActivity({ entityType: 'user', entityId: id, action: 'restore', description: `Pengguna '${rows[0].name}' dipulihkan`, actorId: req.user.id });
      await recordHistory({ entityType: 'user', entityId: id, action: 'restore', after: { name: rows[0].name }, actorId: req.user.id });
    }
    res.json({ message: 'Dipulihkan' });
  }),
);

// Hapus permanen satu item di sampah (khusus admin/superadmin).
router.delete(
  '/:entity/:id',
  asyncHandler(async (req, res) => {
    const entity = asEnum(req.params.entity, 'entity', ENTITIES);
    const id = parseInt(req.params.id, 10);
    if (entity === 'users' && id === req.user.id) throw badRequest('Tidak dapat menghapus akun sendiri');

    if (entity === 'projects') {
      const { rows } = await query('SELECT name FROM projects WHERE id = ? AND deleted_at IS NOT NULL', [id]);
      if (!rows[0]) throw notFound('Item tidak ditemukan di sampah');
      await query('DELETE FROM projects WHERE id = ?', [id]);
      await logActivity({ entityType: 'project', entityId: id, action: 'purge', description: `Proyek '${rows[0].name}' dihapus permanen`, actorId: req.user.id });
    } else if (entity === 'tasks') {
      const { rows } = await query('SELECT title FROM tasks WHERE id = ? AND deleted_at IS NOT NULL', [id]);
      if (!rows[0]) throw notFound('Item tidak ditemukan di sampah');
      await query('DELETE FROM tasks WHERE id = ?', [id]);
      await logActivity({ entityType: 'task', entityId: id, action: 'purge', description: `Tugas '${rows[0].title}' dihapus permanen`, actorId: req.user.id });
    } else if (entity === 'users') {
      if (id === req.user.id) throw badRequest('Tidak dapat menghapus akun sendiri');
      const { rows } = await query('SELECT name FROM users WHERE id = ? AND deleted_at IS NOT NULL', [id]);
      if (!rows[0]) throw notFound('Item tidak ditemukan di sampah');
      await query('DELETE FROM users WHERE id = ?', [id]);
      await logActivity({ entityType: 'user', entityId: id, action: 'purge', description: `Pengguna '${rows[0].name}' dihapus permanen`, actorId: req.user.id });
    }
    res.json({ message: 'Item dihapus permanen' });
  }),
);

export default router;
