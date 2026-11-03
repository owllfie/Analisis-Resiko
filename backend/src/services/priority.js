import { query } from '../config/db.js';

// Mesin penentuan prioritas berbasis aturan.
// Bobot dapat dikonfigurasi. Skor prioritas TIDAK sama dengan skor risiko.
export const PRIORITY_WEIGHTS = {
  urgency: 0.4,
  importance: 0.2,
  risk: 0.3,
  capacity: 0.1,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(due, now) {
  const d = toDate(due);
  if (!d) return null;
  return Math.round((d.getTime() - now.getTime()) / DAY_MS);
}

export function urgencyScore(dueDate, now) {
  const days = daysUntil(dueDate, now);
  if (days == null) return 20;
  if (days < 0) return 100;
  if (days <= 2) return 85;
  if (days <= 5) return 65;
  if (days <= 10) return 45;
  if (days <= 20) return 25;
  return 10;
}

export function importanceScore(importance) {
  if (importance === 'high') return 100;
  if (importance === 'medium') return 55;
  return 20;
}

export function riskScoreFromLevel(level, score) {
  if (score != null && !Number.isNaN(Number(score))) return Number(score);
  if (level === 'high') return 80;
  if (level === 'medium') return 55;
  if (level === 'low') return 20;
  return 25;
}

export function capacityScore(activeTaskCount) {
  // Semakin banyak tugas aktif anggota, semakin rendah kapasitas tersisa.
  if (activeTaskCount <= 1) return 100;
  if (activeTaskCount === 2) return 80;
  if (activeTaskCount === 3) return 55;
  if (activeTaskCount === 4) return 35;
  return 20;
}

/**
 * Menghitung prioritas untuk daftar tugas.
 * @param {Array} tasks tugas dengan properti: id, title, status, due_date, importance, assignee_id
 * @param {object} options { now, riskByTask: Map, depsByTask: Map, workloadByUser: Map }
 */
export function computeTaskPriorities(tasks, options = {}) {
  const now = options.now || new Date();
  const riskByTask = options.riskByTask || new Map();
  const depsByTask = options.depsByTask || new Map();
  const workloadByUser = options.workloadByUser || new Map();

  const scored = tasks.map((task) => {
    const risk = riskByTask.get(task.id) || {};
    const deps = depsByTask.get(task.id) || [];
    const reasons = [];

    const urgency = urgencyScore(task.due_date, now);
    const importance = importanceScore(task.importance);
    const riskVal = riskScoreFromLevel(risk.risk_level, risk.risk_score);
    const activeCount = task.assignee_id ? (workloadByUser.get(task.assignee_id) || 0) : 0;
    const capacity = capacityScore(activeCount);

    const coeff = {
      urgency: Math.min(urgency / 100, 1),
      importance: Math.min(importance / 100, 1),
      risk: Math.min(riskVal / 100, 1),
      capacity: Math.min(capacity / 100, 1),
    };

    let base =
      PRIORITY_WEIGHTS.urgency * coeff.urgency +
      PRIORITY_WEIGHTS.importance * coeff.importance +
      PRIORITY_WEIGHTS.risk * coeff.risk +
      PRIORITY_WEIGHTS.capacity * coeff.capacity;
    base *= 100;

    // Penjelasan dimensi
    const days = daysUntil(task.due_date, now);
    if (days != null) {
      if (days < 0) reasons.push(`Tenggat sudah lewat ${Math.abs(days)} hari (urgensi tinggi)`);
      else if (days <= 2) reasons.push(`Tenggat sangat dekat (${days} hari lagi)`);
      else if (days <= 5) reasons.push(`Tenggat dekat (${days} hari lagi)`);
      else reasons.push(`Tenggat ${days} hari lagi`);
    }
    if (task.importance === 'high') reasons.push('Tingkat kepentingan tinggi');
    if (risk.risk_level === 'high') reasons.push('Indikator risiko tinggi dari analisis terakhir');
    else if (risk.risk_level === 'medium') reasons.push('Indikator risiko sedang');
    if (activeCount >= 4) reasons.push(`Beban anggota tinggi (${activeCount} tugas aktif), kapasitas terbatas`);

    // Kesiapan dependensi: tugas yang prasyaratnya belum selesai diturunkan.
    const blockedBy = deps.filter((d) => d.status !== 'completed');
    let readiness = 1;
    if (blockedBy.length > 0 && task.status !== 'completed') {
      readiness = 0.4;
      reasons.push(
        `Belum dapat dimulai sepenuhnya: menunggu prasyarat (${blockedBy.map((d) => d.title).join(', ')})`,
      );
    }

    let priority = task.status === 'completed' ? 0 : Math.round(base * readiness * 100) / 100;
    if (task.status === 'completed') reasons.push('Tugas sudah selesai');

    return {
      task_id: task.id,
      title: task.title,
      status: task.status,
      project_id: task.project_id,
      assignee_id: task.assignee_id,
      due_date: task.due_date,
      importance: task.importance,
      risk_level: risk.risk_level || null,
      risk_score: risk.risk_score ?? null,
      blocked_by: blockedBy.map((d) => ({ id: d.depends_on_task_id, title: d.title })),
      components: {
        urgency: Math.round(urgency),
        importance,
        risk: Math.round(riskVal),
        capacity,
      },
      priority_score: priority,
      reasons,
    };
  });

  scored.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return String(a.due_date || '').localeCompare(String(b.due_date || ''));
  });

  return scored.map((s, i) => ({ ...s, position: i + 1 }));
}

/**
 * Mengambil data proyek dan menghitung urutan prioritas tugasnya.
 */
export async function getProjectTaskPriorities(projectId) {
  const tasksRes = await query('SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL', [projectId]);
  const tasks = tasksRes.rows;

  // Assessment terakhir per tugas (padanan DISTINCT ON di PostgreSQL).
  const riskRes = await query(
    `SELECT ra.task_id, ra.risk_level, ra.risk_score, ra.analyzed_at
     FROM (
       SELECT id, task_id, risk_level, risk_score, analyzed_at,
              ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY analyzed_at DESC, id DESC) AS rn
       FROM risk_assessments
       WHERE project_id = ? AND task_id IS NOT NULL
     ) ra
     WHERE ra.rn = 1`,
    [projectId],
  );
  const riskByTask = new Map(riskRes.rows.map((r) => [r.task_id, r]));

  const depsRes = await query(
    `SELECT td.task_id, t.id AS depends_on_task_id, t.title, t.status, t.progress
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_task_id
     WHERE t.project_id = ?`,
    [projectId],
  );
  const depsByTask = new Map();
  for (const d of depsRes.rows) {
    if (!depsByTask.has(d.task_id)) depsByTask.set(d.task_id, []);
    depsByTask.get(d.task_id).push(d);
  }

  // Beban kerja: jumlah tugas aktif per anggota (di seluruh proyek aktif).
  const workloadRes = await query(
    `SELECT assignee_id, COUNT(*) AS c
     FROM tasks
     WHERE assignee_id IS NOT NULL AND deleted_at IS NULL AND status IN ('todo','in_progress','blocked')
     GROUP BY assignee_id`,
  );
  const workloadByUser = new Map(workloadRes.rows.map((r) => [r.assignee_id, Number(r.c)]));

  return computeTaskPriorities(tasks, { riskByTask, depsByTask, workloadByUser });
}
