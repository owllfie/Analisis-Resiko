import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { asEmail, asEnum, asString } from '../utils/validate.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logActivity } from '../utils/activity.js';
import { recordHistory } from '../utils/history.js';

const router = Router();
router.use(authenticate);

const ROLES = ['superadmin', 'admin', 'manager', 'member'];
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at });

// Membuat placeholder `?,?,?` untuk daftar ID (IN clause).
const placeholders = (ids) => ids.map(() => '?').join(',');

// Admin dan manajer dapat melihat daftar pengguna (untuk penetapan penanggung jawab).
router.get(
  '/',
  requirePermission('user.view'),
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePagination(req.query);
    const role = req.query.role;
    const params = [];
    let where = 'WHERE deleted_at IS NULL';
    if (role && ROLES.includes(role)) {
      params.push(role);
      where += ` AND role = ?`;
    }
    const { rows: countRows } = await query(`SELECT COUNT(*) AS c FROM users ${where}`, [...params]);
    const listParams = [...params, limit, offset];
    const { rows } = await query(
      `SELECT id, name, email, role, created_at FROM users ${where}
       ORDER BY name ASC LIMIT ? OFFSET ?`,
      listParams,
    );
    res.json({ data: rows, page, limit, total: Number(countRows[0].c) });
  }),
);

router.post(
  '/',
  requirePermission('user.manage'),
  asyncHandler(async (req, res) => {
    const name = asString(req.body?.name, 'name', { max: 120 });
    const email = asEmail(req.body?.email);
    const password = asString(req.body?.password, 'password', { min: 6, max: 200 });
    const role = asEnum(req.body?.role, 'role', ROLES);
    const hash = await bcrypt.hash(password, 10);
    const { insertId } = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)`,
      [name, email, hash, role],
    );
    const { rows } = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [insertId],
    );
    const created = rows[0];
    await logActivity({
      entityType: 'user', entityId: created.id, action: 'create',
      description: `Pengguna ${email} (${role}) dibuat`, actorId: req.user.id,
    });
    await recordHistory({ entityType: 'user', entityId: created.id, action: 'create', after: created, actorId: req.user.id });
    res.status(201).json({ data: created });
  }),
);

// Hapus banyak pengguna sekaligus (soft delete).
router.post(
  '/bulk-delete',
  requirePermission('user.manage'),
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => parseInt(v, 10)).filter(Number.isInteger) : [];
    const targets = ids.filter((id) => id !== req.user.id);
    if (targets.length === 0) throw badRequest('Tidak ada pengguna yang dipilih');

    const { rows: existing } = await query(
      `SELECT id, name, role FROM users WHERE id IN (${placeholders(targets)}) AND deleted_at IS NULL`,
      targets,
    );
    if (existing.length) {
      const existingIds = existing.map((u) => u.id);
      await query(
        `UPDATE users SET deleted_at = NOW() WHERE id IN (${placeholders(existingIds)})`,
        existingIds,
      );
      for (const u of existing) {
        await recordHistory({ entityType: 'user', entityId: u.id, action: 'delete', before: u, actorId: req.user.id });
      }
      await logActivity({
        entityType: 'user', action: 'delete',
        description: `${existing.length} pengguna dipindahkan ke sampah`, actorId: req.user.id,
      });
    }
    res.json({ message: `${existing.length} pengguna dipindahkan ke sampah`, count: existing.length });
  }),
);

router.patch(
  '/:id',
  requirePermission('user.manage'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { rows: beforeRows } = await query('SELECT id, name, role FROM users WHERE id = ?', [id]);
    const before = beforeRows[0] || null;
    const fields = [];
    const params = [];
    if (req.body?.name !== undefined) {
      params.push(asString(req.body.name, 'name', { max: 120 }));
      fields.push(`name = ?`);
    }
    if (req.body?.role !== undefined) {
      params.push(asEnum(req.body.role, 'role', ROLES));
      fields.push(`role = ?`);
    }
    if (req.body?.password) {
      params.push(await bcrypt.hash(asString(req.body.password, 'password', { min: 6, max: 200 }), 10));
      fields.push(`password_hash = ?`);
    }
    if (fields.length === 0) throw badRequest('Tidak ada perubahan yang dikirim');
    fields.push('updated_at = NOW()');
    params.push(id);
    const { affectedRows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
    if (!affectedRows) throw notFound('Pengguna tidak ditemukan');
    const { rows } = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [id],
    );
    await logActivity({
      entityType: 'user', entityId: id, action: 'update',
      description: `Pengguna ${rows[0].email} diperbarui`, actorId: req.user.id,
    });
    await recordHistory({ entityType: 'user', entityId: id, action: 'update', before, after: rows[0], actorId: req.user.id });
    res.json({ data: rows[0] });
  }),
);

router.delete(
  '/:id',
  requirePermission('user.manage'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) throw badRequest('Tidak dapat menghapus akun sendiri');
    const { rows: beforeRows } = await query('SELECT id, name, role FROM users WHERE id = ?', [id]);
    const before = beforeRows[0] || null;
    const { affectedRows } = await query('UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!affectedRows) throw notFound('Pengguna tidak ditemukan');
    const { rows } = await query('SELECT id, email FROM users WHERE id = ?', [id]);
    await logActivity({
      entityType: 'user', entityId: id, action: 'delete',
      description: `Pengguna ${rows[0].email} dihapus (soft)`, actorId: req.user.id,
    });
    await recordHistory({ entityType: 'user', entityId: id, action: 'delete', before, actorId: req.user.id });
    res.json({ message: 'Pengguna dipindahkan ke sampah' });
  }),
);

export default router;
