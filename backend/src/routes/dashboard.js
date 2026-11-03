import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { getProjectTaskPriorities } from '../services/priority.js';
import { permissionFor } from '../services/permissions.js';

const router = Router();
router.use(authenticate);

// Batasan data mengikuti scope izin 'project.view': bila scope-nya 'own',
// pengguna hanya melihat data yang terkait dirinya (dipimpin atau ditugaskan).
async function scopesFor(user) {
  if (user.role === 'superadmin') {
    return { task: { clause: '1=1', params: [] }, project: { clause: '1=1', params: [] } };
  }
  const perm = await permissionFor(user.role, 'project.view');
  if (perm.scope !== 'own') {
    return { task: { clause: '1=1', params: [] }, project: { clause: '1=1', params: [] } };
  }
  return {
    task: { clause: 't.assignee_id = ?', params: [user.id] },
    project: {
      clause: '(p.manager_id = ? OR EXISTS (SELECT 1 FROM tasks t2 WHERE t2.project_id = p.id AND t2.assignee_id = ?))',
      params: [user.id, user.id],
    },
  };
}

// Subquery "assessment terakhir per tugas" dipakai beberapa kali di bawah ini.
// ROW_NUMBER() dipakai agar tetap satu baris per tugas meski waktu sama persis.
const LATEST_ASSESSMENT_SUBQUERY = `
  SELECT ra.* FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY analyzed_at DESC, id DESC) AS rn
    FROM risk_assessments
    WHERE task_id IS NOT NULL
  ) latest
  JOIN risk_assessments ra ON ra.id = latest.id
  WHERE latest.rn = 1
`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;
    const scopes = await scopesFor(user);
    const ts = scopes.task;
    const ps = scopes.project;

    const activeProjects = await query(
      `SELECT COUNT(*) AS c FROM projects p WHERE p.status = 'active' AND p.deleted_at IS NULL AND ${ps.clause}`,
      ps.params,
    );

    const byStatus = await query(
      `SELECT t.status, COUNT(*) AS c FROM tasks t WHERE t.deleted_at IS NULL AND ${ts.clause} GROUP BY t.status`,
      ts.params,
    );
    const counts = { todo: 0, in_progress: 0, blocked: 0, completed: 0 };
    for (const r of byStatus.rows) counts[r.status] = Number(r.c);
    const totalTasks = Object.values(counts).reduce((a, b) => a + b, 0);

    const avgProgress = await query(
      `SELECT COALESCE(ROUND(AVG(t.progress)), 0) AS avg FROM tasks t WHERE t.deleted_at IS NULL AND ${ts.clause}`,
      ts.params,
    );

    const nearDue = await query(
      `SELECT t.id, t.title, t.status, t.due_date, t.progress, t.project_id, p.name AS project_name
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE ${ts.clause} AND t.deleted_at IS NULL AND t.status <> 'completed'
         AND t.due_date IS NOT NULL
         AND t.due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       ORDER BY t.due_date ASC LIMIT 10`,
      ts.params,
    );

    const highRisk = await query(
      `SELECT ra.task_id, t.title, ra.risk_level, ra.risk_score, ra.recommendation, ra.analyzed_at, t.project_id
       FROM (${LATEST_ASSESSMENT_SUBQUERY}) ra
       JOIN tasks t ON t.id = ra.task_id
       WHERE ra.risk_level = 'high' AND ${ts.clause}
       ORDER BY (ra.risk_score IS NULL), ra.risk_score DESC LIMIT 10`,
      ts.params,
    );

    const riskTrend = await query(
      `SELECT ra.risk_level, COUNT(*) AS c
       FROM (${LATEST_ASSESSMENT_SUBQUERY}) ra
       JOIN tasks t ON t.id = ra.task_id
       WHERE ${ts.clause} GROUP BY ra.risk_level`,
      ts.params,
    );

    // Prioritas teratas lintas proyek yang dapat diakses pengguna.
    const projects = await query(
      `SELECT p.id FROM projects p WHERE p.status = 'active' AND p.deleted_at IS NULL AND ${ps.clause}`,
      ps.params,
    );
    const topPriorities = [];
    for (const p of projects.rows) {
      const list = await getProjectTaskPriorities(p.id);
      topPriorities.push(...list.filter((x) => x.status !== 'completed'));
    }
    topPriorities.sort((a, b) => b.priority_score - a.priority_score);

    const lastAnalysis = await query(
      `SELECT MAX(analyzed_at) AS last FROM risk_assessments`,
    );

    res.json({
      data: {
        active_projects: Number(activeProjects.rows[0].c),
        tasks: { total: totalTasks, ...counts },
        average_progress: Number(avgProgress.rows[0].avg),
        near_due: nearDue.rows,
        high_risk: highRisk.rows,
        risk_distribution: riskTrend.rows.reduce((acc, r) => ({ ...acc, [r.risk_level]: Number(r.c) }), { low: 0, medium: 0, high: 0 }),
        top_priorities: topPriorities.slice(0, 5),
        last_analysis_at: lastAnalysis.rows[0].last,
      },
    });
  }),
);

export default router;
