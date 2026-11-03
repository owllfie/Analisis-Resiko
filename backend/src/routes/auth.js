import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { asEmail, asString } from '../utils/validate.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../utils/token.js';
import { logActivity } from '../utils/activity.js';

const router = Router();

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = asEmail(req.body?.email);
    const password = asString(req.body?.password, 'password', { max: 200 });

    const { rows } = await query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    // Bandingkan tetap dilakukan agar waktu respons tidak membocorkan keberadaan akun.
    const hash = user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw unauthorized('Email atau password salah');

    const token = signToken(user);
    setAuthCookie(res, token);
    // Login tidak dicatat ke Riwayat Aktivitas agar log hanya berisi perubahan data.

    res.json({ user: publicUser(user), token });
  }),
);

// Pendaftaran akun mandiri. Pengguna baru selalu berperan sebagai 'member'.
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const name = asString(req.body?.name, 'name', { max: 120 });
    const email = asEmail(req.body?.email);
    const password = asString(req.body?.password, 'password', { min: 6, max: 200 });

    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.rows[0]) throw conflict('Email sudah terdaftar');

    const hash = await bcrypt.hash(password, 10);
    const { insertId } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?,?,?,'member')`,
      [name, email, hash],
    );
    const user = { id: insertId, name, email, role: 'member' };

    const token = signToken(user);
    setAuthCookie(res, token);
    await logActivity({
      entityType: 'user',
      entityId: user.id,
      action: 'register',
      description: `Akun baru terdaftar: ${user.email}`,
      actorId: user.id,
    });

    res.status(201).json({ user: publicUser(user), token });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    clearAuthCookie(res);
    res.json({ message: 'Berhasil keluar' });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  }),
);

// Pengguna memperbarui profilnya sendiri (nama dan/atau password).
router.patch(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const id = req.user.id;
    const fields = [];
    const params = [];

    if (req.body?.name !== undefined) {
      params.push(asString(req.body.name, 'name', { max: 120 }));
      fields.push(`name = ?`);
    }

    if (req.body?.newPassword) {
      const newPassword = asString(req.body.newPassword, 'newPassword', { min: 6, max: 200 });
      const currentPassword = asString(req.body.currentPassword, 'currentPassword', { max: 200 });
      const { rows } = await query('SELECT password_hash FROM users WHERE id = ?', [id]);
      const ok = await bcrypt.compare(currentPassword, rows[0]?.password_hash || '');
      if (!ok) throw unauthorized('Password saat ini salah');
      params.push(await bcrypt.hash(newPassword, 10));
      fields.push(`password_hash = ?`);
    }

    if (fields.length === 0) throw badRequest('Tidak ada perubahan yang dikirim');
    fields.push('updated_at = NOW()');
    params.push(id);
    await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
    const { rows: updatedRows } = await query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [id],
    );
    await logActivity({
      entityType: 'user', entityId: id, action: 'update_profile',
      description: `${updatedRows[0].email} memperbarui profil`, actorId: id,
    });
    res.json({ data: publicUser(updatedRows[0]) });
  }),
);

export default router;
