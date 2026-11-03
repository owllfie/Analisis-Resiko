import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate, requirePermission, can } from '../middleware/auth.js';
import { permissionFor } from '../services/permissions.js';
import { asyncHandler, parsePagination } from '../utils/http.js';
import { asDate, asEnum, asInt, asNumber, asString } from '../utils/validate.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { isProjectOwner } from '../utils/access.js';
import { logActivity } from '../utils/activity.js';
import { recordHistory } from '../utils/history.js';
import { analyzeProjectRisk } from '../services/risk.js';
import { getProjectTaskPriorities } from '../services/priority.js';

const router = Router();
router.use(authenticate);

const PROJECT_STATUS = ['active', 'archived', 'completed'];
const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'completed'];
const IMPORTANCE = ['low', 'medium', 'high'];

const PROJECT_SELECT = `
  SELECT p.*, u.name AS manager_name,
         COALESCE((SELECT ROUND(AVG(t.progress)) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL), 0) AS progress,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status = 'completed') AS completed_task_count
  FROM projects p
  LEFT JOIN users u ON u.id = p.manager_id
`;

// MySQL tidak memiliki ILIKE; kolasi utf8mb4_unicode_ci sudah case-insensitive,
// sehingga LIKE setara dengan ILIKE PostgreSQL.
function likeParam(q) {
  return `%${q}%`;
}

async function getProject(id) {
  const { rows } = await query(`${PROJECT_SELECT} WHERE p.id = ?`, [id]);
  if (!rows[0]) return null;
  const p = rows[0];
  return {
    ...p,
    progress: Number(p.progress ?? 0),
    task_count: Number(p.task_count ?? 0),
    completed_task_count: Number(p.completed_task_count ?? 0),
  };
}

async function assertCanViewProject(user, project) {
  if (user.role === 'superadmin' || user.role === 'admin') return;
  const perm = await permissionFor(user.role, 'project.view');
  if (!perm.allowed) throw notFound('Proyek tidak ditemukan');
  if (perm.scope === 'all') return;
  // Scope 'own': boleh bila memimpin proyek atau ditugaskan pada salah satu tugasnya.
  if (project.manager_id === user.id) return;
  const { rows } = await query(
    'SELECT 1 FROM tasks WHERE project_id = ? AND assignee_id = ? AND deleted_at IS NULL LIMIT 1',
    [project.id, user.id],
  );
  if (!rows[0]) throw notFound('Proyek tidak ditemukan');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePagination(req.query);
    const { q, status } = req.query;
    const params = [];
    const conds = [];

    const viewPerm = await permissionFor(req.user.role, 'project.view');
    if (!viewPerm.allowed) throw forbidden('Anda tidak memiliki izin melihat proyek');
    if (viewPerm.scope === 'own' && req.user.role !== 'superadmin') {
      // Scope 'own': hanya proyek yang dipimpinnya atau yang memuat tugas untuknya.
      params.push(req.user.id);
      params.push(req.user.id);
      conds.push(`(p.manager_id = ? OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = ? AND t.deleted_at IS NULL))`);
    }
    // soft delete
    conds.push('p.deleted_at IS NULL');
    if (status && PROJECT_STATUS.includes(status)) {
      params.push(status);
      conds.push(`p.status = ?`);
    }
    if (q) {
      params.push(likeParam(q));
      conds.push(`(p.name LIKE ? OR p.description LIKE ?)`);
      params.push(likeParam(q));
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS c FROM projects p ${where}`,
      params,
    );
    const listParams = [...params, limit, offset];
    const { rows } = await query(
      `${PROJECT_SELECT} ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      listParams,
    );
    res.json({ data: rows, page, limit, total: Number(countRows[0].c) });
  }),
);

router.post(
  '/',
  requirePermission('project.create'),
  asyncHandler(async (req, res) => {
    const name = asString(req.body?.name, 'name', { max: 200 });
    const description = asString(req.body?.description, 'description', { required: false, max: 5000 }) || null;
    const startDate = asDate(req.body?.start_date, 'start_date', { required: false }) || null;
    const dueDate = asDate(req.body?.due_date, 'due_date', { required: false }) || null;
    const status = req.body?.status ? asEnum(req.body.status, 'status', PROJECT_STATUS) : 'active';
    const budget = req.body?.budget != null && req.body.budget !== ''
      ? asNumber(req.body.budget, 'budget', { min: 0, max: 1_000_000_000_000 })
      : null;
    let managerId = req.user.role === 'admin' && req.body?.manager_id
      ? asInt(req.body.manager_id, 'manager_id')
      : req.user.id;

    if (startDate && dueDate && dueDate < startDate) throw badRequest('due_date tidak boleh sebelum start_date');

    if (managerId !== req.user.id) {
      const { rows } = await query('SELECT id FROM users WHERE id = ? AND role IN (\'manager\',\'admin\')', [managerId]);
      if (!rows[0]) throw badRequest('manager_id tidak valid');
    }

    const { insertId } = await query(
      `INSERT INTO projects (name, description, start_date, due_date, status, manager_id, budget)
       VALUES (?,?,?,?,?,?,?)`,
      [name, description, startDate, dueDate, status, managerId, budget],
    );
    await logActivity({
      entityType: 'project', entityId: insertId, action: 'create',
      description: `Proyek '${name}' dibuat`, actorId: req.user.id,
    });
    const created = await getProject(insertId);
    await recordHistory({ entityType: 'project', entityId: created.id, action: 'create', after: created, actorId: req.user.id });
    res.status(201).json({ data: created });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await getProject(parseInt(req.params.id, 10));
    if (!project) throw notFound('Proyek tidak ditemukan');
    await assertCanViewProject(req.user, project);

    const tasksRes = await query(
      `SELECT t.*, u.name AS assignee_name FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at ASC`,
      [project.id],
    );
    const depsRes = await query(
      `SELECT td.task_id, td.depends_on_task_id FROM task_dependencies td
       JOIN tasks t ON t.id = td.task_id WHERE t.project_id = ?`,
      [project.id],
    );
    res.json({ data: { ...project, tasks: tasksRes.rows, dependencies: depsRes.rows } });
  }),
);

router.patch(
  '/:id',
  requirePermission('project.update', (req) => isProjectOwner(req.user, parseInt(req.params.id, 10))),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const project = await getProject(id);
    if (!project) throw notFound('Proyek tidak ditemukan');

    const fields = [];
    const params = [];
    const push = (col, value) => {
      params.push(value);
      fields.push(`${col} = ?`);
    };

    if (req.body?.name !== undefined) push('name', asString(req.body.name, 'name', { max: 200 }));
    if (req.body?.description !== undefined) push('description', asString(req.body.description, 'description', { required: false, max: 5000 }) || null);
    if (req.body?.start_date !== undefined) push('start_date', asDate(req.body.start_date, 'start_date', { required: false }) || null);
    if (req.body?.due_date !== undefined) push('due_date', asDate(req.body.due_date, 'due_date', { required: false }) || null);
    if (req.body?.status !== undefined) push('status', asEnum(req.body.status, 'status', PROJECT_STATUS));
    if (req.body?.budget !== undefined) {
      push('budget', req.body.budget === null || req.body.budget === ''
        ? null
        : asNumber(req.body.budget, 'budget', { min: 0, max: 1_000_000_000_000 }));
    }
    if (req.body?.manager_id !== undefined && req.user.role === 'admin') push('manager_id', asInt(req.body.manager_id, 'manager_id'));

    if (fields.length === 0) throw badRequest('Tidak ada perubahan yang dikirim');
    fields.push('updated_at = NOW()');
    params.push(id);
    await query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, params);
    await logActivity({
      entityType: 'project', entityId: id, action: 'update',
      description: `Proyek '${project.name}' diperbarui`, actorId: req.user.id,
    });
    const updated = await getProject(id);
    await recordHistory({ entityType: 'project', entityId: id, action: 'update', before: project, after: updated, actorId: req.user.id });
    res.json({ data: updated });
  }),
);

// Hapus banyak proyek sekaligus (soft delete).
router.post(
  '/bulk-delete',
  requirePermission('project.delete'),
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => parseInt(v, 10)).filter(Number.isInteger) : [];
    if (ids.length === 0) throw badRequest('Tidak ada proyek yang dipilih');
    const delPerm = await permissionFor(req.user.role, 'project.delete');
    let count = 0;
    for (const id of ids) {
      const project = await getProject(id);
      if (!project || project.deleted_at) continue;
      const allowed = delPerm.scope === 'all' || (await isProjectOwner(req.user, project.id));
      if (!allowed) continue;
      await query('UPDATE projects SET deleted_at = NOW() WHERE id = ?', [id]);
      await logActivity({ entityType: 'project', entityId: id, action: 'delete', description: `Proyek '${project.name}' dihapus (soft)`, actorId: req.user.id });
      await recordHistory({ entityType: 'project', entityId: id, action: 'delete', before: project, actorId: req.user.id });
      count += 1;
    }
    res.json({ message: `${count} proyek dipindahkan ke sampah`, count });
  }),
);

router.delete(
  '/:id',
  requirePermission('project.delete', (req) => isProjectOwner(req.user, parseInt(req.params.id, 10))),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const project = await getProject(id);
    if (!project) throw notFound('Proyek tidak ditemukan');

    if (req.query.archive === 'true') {
      await query("UPDATE projects SET status = 'archived', updated_at = NOW() WHERE id = ?", [id]);
      await logActivity({ entityType: 'project', entityId: id, action: 'archive', description: `Proyek '${project.name}' diarsipkan`, actorId: req.user.id });
      await recordHistory({ entityType: 'project', entityId: id, action: 'archive', before: project, after: { ...project, status: 'archived' }, actorId: req.user.id });
      return res.json({ message: 'Proyek diarsipkan' });
    }

    await query('UPDATE projects SET deleted_at = NOW() WHERE id = ?', [id]);
    await logActivity({ entityType: 'project', entityId: id, action: 'delete', description: `Proyek '${project.name}' dihapus (soft)`, actorId: req.user.id });
    await recordHistory({ entityType: 'project', entityId: id, action: 'delete', before: project, actorId: req.user.id });
    res.json({ message: 'Proyek dipindahkan ke sampah' });
  }),
);

// ---- Tugas dalam proyek ----

router.get(
  '/:id/tasks',
  asyncHandler(async (req, res) => {
    const project = await getProject(parseInt(req.params.id, 10));
    if (!project) throw notFound('Proyek tidak ditemukan');
    await assertCanViewProject(req.user, project);
    const { rows } = await query(
      `SELECT t.*, u.name AS assignee_name FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at ASC`,
      [project.id],
    );
    res.json({ data: rows });
  }),
);

router.post(
  '/:id/tasks',
  requirePermission('task.create', (req) => isProjectOwner(req.user, parseInt(req.params.id, 10))),
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.id, 10);
    const project = await getProject(projectId);
    if (!project) throw notFound('Proyek tidak ditemukan');

    const title = asString(req.body?.title, 'title', { max: 200 });
    const description = asString(req.body?.description, 'description', { required: false, max: 5000 }) || null;
    const assigneeId = req.body?.assignee_id ? asInt(req.body.assignee_id, 'assignee_id') : null;
    const status = req.body?.status ? asEnum(req.body.status, 'status', TASK_STATUS) : 'todo';
    const progress = req.body?.progress !== undefined ? asInt(req.body.progress, 'progress', { min: 0, max: 100 }) : 0;
    const estimated = req.body?.estimated_duration != null ? asNumber(req.body.estimated_duration, 'estimated_duration', { min: 0, max: 100000 }) : null;
    const actual = req.body?.actual_duration != null ? asNumber(req.body.actual_duration, 'actual_duration', { min: 0, max: 100000 }) : null;
    const startDate = req.body?.start_date ? asDate(req.body.start_date, 'start_date') : null;
    const dueDate = req.body?.due_date ? asDate(req.body.due_date, 'due_date') : null;
    const importance = req.body?.importance ? asEnum(req.body.importance, 'importance', IMPORTANCE) : 'medium';

    if (assigneeId) {
      const { rows } = await query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [assigneeId]);
      if (!rows[0]) throw badRequest('assignee_id tidak valid');
    }

    const created = await withTransaction(async (client) => {
      const { insertId } = await client.query(
        `INSERT INTO tasks
           (project_id, title, description, assignee_id, status, progress, estimated_duration, actual_duration, start_date, due_date, importance)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [projectId, title, description, assigneeId, status, progress, estimated, actual, startDate, dueDate, importance],
      );
      await client.query(
        `INSERT INTO task_progress_history (task_id, progress, status, note, updated_by)
         VALUES (?,?,?,'Tugas dibuat',?)`,
        [insertId, progress, status, req.user.id],
      );
      const { rows } = await client.query('SELECT * FROM tasks WHERE id = ?', [insertId]);
      return rows[0];
    });

    await logActivity({ entityType: 'task', entityId: created.id, action: 'create', description: `Tugas '${title}' (Proyek: ${project.name}) dibuat`, actorId: req.user.id });
    await recordHistory({ entityType: 'task', entityId: created.id, action: 'create', after: created, actorId: req.user.id });
    res.status(201).json({ data: created });
  }),
);

// ---- Analisis risiko & prioritas ----

router.post(
  '/:id/analyze-risk',
  asyncHandler(async (req, res) => {
    const project = await getProject(parseInt(req.params.id, 10));
    if (!project) throw notFound('Proyek tidak ditemukan');
    await assertCanViewProject(req.user, project);
    if (!(await can(req.user, 'risk.analyze'))) {
      throw forbidden('Anda tidak memiliki izin memicu analisis risiko');
    }
    const results = await analyzeProjectRisk(project.id, req.user.id);
    res.json({ data: results, model_version: results[0]?.model_version || 'rules-v1' });
  }),
);

router.get(
  '/:id/risk-assessments',
  asyncHandler(async (req, res) => {
    const project = await getProject(parseInt(req.params.id, 10));
    if (!project) throw notFound('Proyek tidak ditemukan');
    await assertCanViewProject(req.user, project);
    // Assessment terakhir per tugas (padanan DISTINCT ON di PostgreSQL).
    // Memakai ROW_NUMBER() agar tetap satu baris per tugas meski waktu sama persis.
    const { rows } = await query(
      `SELECT ra.*, t.title AS task_title
       FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY analyzed_at DESC, id DESC) AS rn
         FROM risk_assessments
         WHERE project_id = ? AND task_id IS NOT NULL
       ) latest
       JOIN risk_assessments ra ON ra.id = latest.id
       LEFT JOIN tasks t ON t.id = ra.task_id
       WHERE latest.rn = 1`,
      [project.id],
    );
    rows.sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
    res.json({ data: rows });
  }),
);

router.get(
  '/:id/task-priorities',
  asyncHandler(async (req, res) => {
    const project = await getProject(parseInt(req.params.id, 10));
    if (!project) throw notFound('Proyek tidak ditemukan');
    await assertCanViewProject(req.user, project);
    const data = await getProjectTaskPriorities(project.id);
    res.json({ data, weights: (await import('../services/priority.js')).PRIORITY_WEIGHTS });
  }),
);

export default router;
