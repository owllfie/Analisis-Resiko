import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate, requirePermission, can } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { asDate, asEnum, asInt, asNumber, asString } from '../utils/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { isTaskOwner } from '../utils/access.js';
import { logActivity } from '../utils/activity.js';
import { recordHistory } from '../utils/history.js';

const router = Router();
router.use(authenticate);

const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'completed'];
const IMPORTANCE = ['low', 'medium', 'high'];

async function getTaskWithProject(id) {
  const { rows } = await query(
    `SELECT t.*, p.manager_id, p.name AS project_name, p.status AS project_status
     FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
    [id],
  );
  return rows[0] || null;
}

// Izin efektif untuk sebuah tugas, memperhitungkan scope 'own'.
async function taskPermissions(user, task) {
  const owner = await isTaskOwner(user, task.id);
  const [update, progress, del] = await Promise.all([
    can(user, 'task.update', { isOwner: owner }),
    can(user, 'task.progress', { isOwner: owner }),
    can(user, 'task.delete', { isOwner: owner }),
  ]);
  return { update, progress, delete: del, isAssignee: task.assignee_id === user.id };
}

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await getTaskWithProject(parseInt(req.params.id, 10));
    if (!task) throw notFound('Tugas tidak ditemukan');
    if (!(await can(req.user, 'task.progress', { isOwner: await isTaskOwner(req.user, task.id) }))) {
      throw forbidden('Anda hanya dapat melihat tugas yang ditugaskan kepada Anda');
    }
    const history = await query(
      `SELECT h.*, u.name AS updated_by_name FROM task_progress_history h
       LEFT JOIN users u ON u.id = h.updated_by WHERE h.task_id = ?
       ORDER BY h.recorded_at DESC`,
      [task.id],
    );
    const deps = await query(
      `SELECT td.depends_on_task_id, t.title, t.status FROM task_dependencies td
       JOIN tasks t ON t.id = td.depends_on_task_id WHERE td.task_id = ?`,
      [task.id],
    );
    res.json({ data: { ...task, history: history.rows, dependencies: deps.rows } });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const task = await getTaskWithProject(id);
    if (!task) throw notFound('Tugas tidak ditemukan');

    const perms = await taskPermissions(req.user, task);
    const manage = perms.update;
    const canProgress = perms.progress || perms.isAssignee;

    if (!manage && !canProgress) {
      throw forbidden('Anda tidak diizinkan mengubah tugas ini');
    }

    const fields = [];
    const params = [];
    const push = (col, value) => {
      params.push(value);
      fields.push(`${col} = ?`);
    };

    // Anggota tim hanya boleh memperbarui status, progres, durasi aktual, dan catatan.
    if (manage) {
      if (req.body?.title !== undefined) push('title', asString(req.body.title, 'title', { max: 200 }));
      if (req.body?.description !== undefined) push('description', asString(req.body.description, 'description', { required: false, max: 5000 }) || null);
      if (req.body?.assignee_id !== undefined) {
        const aid = req.body.assignee_id === null ? null : asInt(req.body.assignee_id, 'assignee_id');
        if (aid) {
          const { rows } = await query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [aid]);
          if (!rows[0]) throw badRequest('assignee_id tidak valid');
        }
        push('assignee_id', aid);
      }
      if (req.body?.estimated_duration !== undefined) push('estimated_duration', req.body.estimated_duration === null ? null : asNumber(req.body.estimated_duration, 'estimated_duration', { min: 0, max: 100000 }));
      if (req.body?.start_date !== undefined) push('start_date', asDate(req.body.start_date, 'start_date', { required: false }) || null);
      if (req.body?.due_date !== undefined) push('due_date', asDate(req.body.due_date, 'due_date', { required: false }) || null);
      if (req.body?.importance !== undefined) push('importance', asEnum(req.body.importance, 'importance', IMPORTANCE));
    } else {
      const illegal = ['title', 'description', 'assignee_id', 'estimated_duration', 'start_date', 'due_date', 'importance'];
      const attempted = illegal.filter((f) => req.body?.[f] !== undefined);
      if (attempted.length) throw forbidden(`Anggota tim tidak boleh mengubah: ${attempted.join(', ')}`);
    }

    if (req.body?.status !== undefined) push('status', asEnum(req.body.status, 'status', TASK_STATUS));
    if (req.body?.progress !== undefined) push('progress', asInt(req.body.progress, 'progress', { min: 0, max: 100 }));
    if (req.body?.actual_duration !== undefined) push('actual_duration', req.body.actual_duration === null ? null : asNumber(req.body.actual_duration, 'actual_duration', { min: 0, max: 100000 }));

    const note = req.body?.note !== undefined ? asString(req.body.note, 'note', { required: false, max: 2000 }) : null;

    if (fields.length === 0) throw badRequest('Tidak ada perubahan yang dikirim');

    // Jika progres 100, otomatis selesaikan; jika belum 100 namun completed, izinkan apa adanya.
    const newStatus = req.body?.status;
    const newProgress = req.body?.progress;
    if (newProgress === 100 && newStatus === undefined) push('status', 'completed');
    if (newStatus === 'completed' && newProgress === undefined && task.progress !== 100) push('progress', 100);

    fields.push('updated_at = NOW()');

    const updated = await withTransaction(async (client) => {
      params.push(id);
      await client.query(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`,
        params,
      );
      const { rows } = await client.query('SELECT * FROM tasks WHERE id = ?', [id]);
      const t = rows[0];
      await client.query(
        `INSERT INTO task_progress_history (task_id, progress, status, note, updated_by)
         VALUES (?,?,?,?,?)`,
        [t.id, t.progress, t.status, note, req.user.id],
      );
      return t;
    });

    await logActivity({
      entityType: 'task', entityId: id,
      action: manage ? 'update' : 'progress_update',
      description: `Tugas '${updated.title}' (Proyek: ${task.project_name}) diperbarui (status: ${updated.status}, progres: ${updated.progress}%)`,
      actorId: req.user.id,
    });
    await recordHistory({ entityType: 'task', entityId: id, action: 'update', before: task, after: updated, actorId: req.user.id });

    res.json({ data: updated });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const task = await getTaskWithProject(id);
    if (!task) throw notFound('Tugas tidak ditemukan');
    if (!(await can(req.user, 'task.delete', { isOwner: await isTaskOwner(req.user, id) }))) {
      throw forbidden('Anda tidak memiliki izin menghapus tugas ini');
    }
    await query('UPDATE tasks SET deleted_at = NOW() WHERE id = ?', [id]);
    await logActivity({ entityType: 'task', entityId: id, action: 'delete', description: `Tugas '${task.title}' (Proyek: ${task.project_name}) dihapus (soft)`, actorId: req.user.id });
    await recordHistory({ entityType: 'task', entityId: id, action: 'delete', before: task, actorId: req.user.id });
    res.json({ message: 'Tugas dipindahkan ke sampah' });
  }),
);

router.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const task = await getTaskWithProject(parseInt(req.params.id, 10));
    if (!task) throw notFound('Tugas tidak ditemukan');
    if (!(await can(req.user, 'history.view', { isOwner: await isTaskOwner(req.user, task.id) }))) {
      throw forbidden('Anda hanya dapat melihat riwayat tugas Anda');
    }
    const { rows } = await query(
      `SELECT h.*, u.name AS updated_by_name FROM task_progress_history h
       LEFT JOIN users u ON u.id = h.updated_by WHERE h.task_id = ?
       ORDER BY h.recorded_at DESC`,
      [task.id],
    );
    res.json({ data: rows });
  }),
);

// ---- Dependensi tugas ----

router.post(
  '/:id/dependencies',
  requirePermission('dependency.manage', (req) => isTaskOwner(req.user, parseInt(req.params.id, 10))),
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    const task = await getTaskWithProject(taskId);
    if (!task) throw notFound('Tugas tidak ditemukan');

    const dependsOnId = asInt(req.body?.depends_on_task_id, 'depends_on_task_id');
    if (dependsOnId === taskId) throw badRequest('Tugas tidak dapat bergantung pada dirinya sendiri');

    const dep = await getTaskWithProject(dependsOnId);
    if (!dep || dep.project_id !== task.project_id) {
      throw badRequest('Tugas prasyarat harus berada dalam proyek yang sama');
    }

    // Deteksi siklus: apakah dependsOn sudah (transitif) bergantung pada taskId?
    // MySQL 8 mendukung CTE rekursif (padanan WITH RECURSIVE PostgreSQL).
    const { rows: cycle } = await query(
      `WITH RECURSIVE chain(id) AS (
         SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?
         UNION
         SELECT td.depends_on_task_id FROM task_dependencies td
         JOIN chain c ON c.id = td.task_id
       )
       SELECT 1 FROM chain WHERE id = ? LIMIT 1`,
      [dependsOnId, taskId],
    );
    if (cycle[0]) throw conflict('Dependensi ini akan membentuk siklus yang tidak valid');

    const { insertId } = await query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?,?)`,
      [taskId, dependsOnId],
    );
    const { rows } = await query('SELECT * FROM task_dependencies WHERE id = ?', [insertId]);
    await logActivity({ entityType: 'task', entityId: taskId, action: 'add_dependency', description: `Menambahkan prasyarat '${dep.title}' pada tugas '${task.title}' (Proyek: ${task.project_name})`, actorId: req.user.id });
    res.status(201).json({ data: rows[0] });
  }),
);

router.delete(
  '/:id/dependencies/:dependsOnId',
  requirePermission('dependency.manage', (req) => isTaskOwner(req.user, parseInt(req.params.id, 10))),
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    const dependsOnId = parseInt(req.params.dependsOnId, 10);
    const task = await getTaskWithProject(taskId);
    if (!task) throw notFound('Tugas tidak ditemukan');
    const { affectedRows } = await query(
      `DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?`,
      [taskId, dependsOnId],
    );
    if (!affectedRows) throw notFound('Dependensi tidak ditemukan');
    res.json({ message: 'Dependensi dihapus' });
  }),
);

export default router;
