import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import {
  PERMISSION_CATALOG,
  getMatrix,
  updatePermissions,
  refreshPermissions,
} from '../services/permissions.js';

const router = Router();
router.use(authenticate);

// Matriks izin lengkap: katalog fitur + keadaan izin tiap peran.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    await refreshPermissions();
    const roles = await getMatrix();
    res.json({ data: { catalog: PERMISSION_CATALOG, roles } });
  }),
);

// Simpan perubahan izin. Hanya pengguna dengan izin 'access.manage' yang boleh.
router.put(
  '/',
  requirePermission('access.manage'),
  asyncHandler(async (req, res) => {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    const affected = await updatePermissions(updates);
    await logActivity({
      entityType: 'permission',
      action: 'update',
      description: `Hak akses diperbarui (${affected} perubahan)`,
      actorId: req.user.id,
    });
    const roles = await getMatrix();
    res.json({ message: 'Hak akses disimpan', data: { roles } });
  }),
);

export default router;
