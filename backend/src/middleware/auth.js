import { query } from '../config/db.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { COOKIE_NAME, verifyToken } from '../utils/token.js';
import { can as canDo } from '../services/permissions.js';

export async function authenticate(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME];
    const header = req.headers.authorization;
    if (!token && header?.startsWith('Bearer ')) token = header.slice(7);
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw unauthorized('Sesi tidak valid atau kedaluwarsa');
    }

    const { rows } = await query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [payload.sub],
    );
    if (!rows[0]) throw unauthorized('Akun tidak ditemukan');

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    const r = req.user.role;
    const allowed = roles.length === 0 || roles.includes(r) || r === 'superadmin';
    if (!allowed) {
      return next(forbidden('Peran Anda tidak diizinkan melakukan aksi ini'));
    }
    next();
  };
}

// Penjaga berbasis izin. `key` = kunci izin dari katalog (mis. 'project.create').
// `ownerOf` = fungsi opsional (req) => boolean yang menyatakan apakah pengguna
// memiliki data terkait; dipakai saat izin ber-scope 'own'.
export function requirePermission(key, ownerOf = null) {
  return async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();
      const isOwner = ownerOf ? !!(await ownerOf(req)) : false;
      const ok = await canDo(req.user, key, { isOwner });
      if (!ok) throw forbidden('Anda tidak memiliki izin untuk aksi ini');
      next();
    } catch (err) {
      next(err);
    }
  };
}

export { canDo as can };

