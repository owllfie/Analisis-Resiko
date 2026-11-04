import { readFileSync } from 'node:fs';

import { query } from '../config/db.js';
import { logActivity } from '../utils/activity.js';
import { badRequest } from '../utils/errors.js';

// Versi fallback berbasis aturan (dipakai bila model client gagal dimuat).
export const RISK_MODEL_VERSION = 'rules-v1';

// Metadata model client-side. File ini dihasilkan oleh ml/export_client_model.py
// dan hanya berisi metadata (bukan bobot/training data).
const FALLBACK_MODEL_INFO = {
  model_version: 'ml-mlp-v4',
  algorithm: 'MLPClassifier(96,48)',
  engine: 'client',
  available: true,
  classes: ['high', 'low', 'medium'],
  feature_names: [
    'duration_days',
    'progress',
    'days_remaining',
    'importance',
    'dependency_count',
    'unfinished_dependency_count',
    'assignee_workload',
    'team_size',
    'project_complexity',
    'manager_experience',
    'historical_risk_score',
    'budget_per_task',
  ],
  feature_labels: {},
  feature_importances: [],
  metrics: {},
  dataset: {},
};

function loadModelInfo() {
  try {
    return JSON.parse(readFileSync(new URL('./modelInfo.json', import.meta.url), 'utf8'));
  } catch {
    return FALLBACK_MODEL_INFO;
  }
}

export const CLIENT_MODEL_INFO = loadModelInfo();
export const ML_MODEL_VERSION = CLIENT_MODEL_INFO.model_version || 'ml-mlp-v4';

const FEATURE_NAMES = CLIENT_MODEL_INFO.feature_names || FALLBACK_MODEL_INFO.feature_names;
const FEATURE_LABELS = CLIENT_MODEL_INFO.feature_labels || {};
const ALLOWED_RISK_LEVELS = new Set(['low', 'medium', 'high']);
// Batasi agar payload hasil inferensi browser tetap di bawah limit JSON backend.
const MAX_PREDICTIONS = 1000;
const MAX_DRIVERS = 10;
const SEVERITY = { low: 12, medium: 50, high: 90 };

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function levelFromScore(score) {
  if (score < 35) return 'low';
  if (score < 65) return 'medium';
  return 'high';
}

/**
 * Menghitung indikator risiko untuk satu tugas berdasarkan aturan transparan.
 * @param {object} task  Data tugas (menggunakan penamaan kolom database).
 * @param {object} options { now, dependencies }
 * @returns {object} { risk_level, risk_score, predicted_delay_days, contributing_factors, recommendation, model_version }
 */
export function computeTaskRisk(task, options = {}) {
  const now = options.now || new Date();
  const dependencies = options.dependencies || [];

  let score = 0;
  const factors = [];

  const status = task.status;
  const progress = Number(task.progress ?? 0);
  const importance = task.importance || 'medium';
  const due = toDate(task.due_date);
  const start = toDate(task.start_date);
  const est = task.estimated_duration != null ? Number(task.estimated_duration) : null;

  if (status !== 'completed') {
    // 1) Kedekatan/pelanggaran tenggat
    if (due) {
      const remaining = daysBetween(now, due); // negatif = sudah lewat
      if (remaining < 0) {
        const over = Math.abs(remaining);
        score += 45;
        factors.push({
          factor: 'overdue',
          detail: `Tenggat sudah terlewat ${over} hari`,
          impact: 'high',
        });
      } else if (remaining <= 2) {
        score += 30;
        factors.push({
          factor: 'deadline_near',
          detail: `Tenggat hanya ${remaining} hari lagi`,
          impact: 'high',
        });
      } else if (remaining <= 5) {
        score += 18;
        factors.push({
          factor: 'deadline_soon',
          detail: `Tenggat ${remaining} hari lagi`,
          impact: 'medium',
        });
      } else if (remaining <= 10) {
        score += 8;
        factors.push({
          factor: 'deadline_upcoming',
          detail: `Tenggat ${remaining} hari lagi`,
          impact: 'low',
        });
      }
    }

    // 2) Keterlambatan progres dibanding rencana
    if (due && start && progress < 100) {
      const total = daysBetween(start, due);
      const elapsed = daysBetween(start, now);
      if (total && total > 0 && elapsed != null) {
        const expected = Math.max(0, Math.min(100, (elapsed / total) * 100));
        const lag = Math.round(expected - progress);
        if (lag >= 40) score += 30;
        else if (lag >= 25) score += 22;
        else if (lag >= 15) score += 12;
        else if (lag >= 5) score += 5;

        if (lag >= 15) {
          factors.push({
            factor: 'progress_lag',
            detail: `Progres aktual ${progress}% sementara perkiraan rencana sekitar ${Math.round(expected)}% (selisih ${lag}%)`,
            impact: lag >= 40 ? 'high' : 'medium',
          });
        }
      }
    }

    // 3) Tugas terhambat
    if (status === 'blocked') {
      score += 25;
      factors.push({ factor: 'blocked', detail: 'Tugas berstatus terhambat (blocked)', impact: 'high' });
    }

    // 4) Ketergantungan belum selesai
    const unfinishedDeps = dependencies.filter((d) => d.status !== 'completed');
    if (unfinishedDeps.length > 0) {
      score += 12;
      factors.push({
        factor: 'dependency_unfinished',
        detail: `Menunggu ${unfinishedDeps.length} tugas prasyarat yang belum selesai`,
        impact: unfinishedDeps.length >= 2 ? 'high' : 'medium',
      });
    }
  }

  // 5) Tingkat kepentingan (hanya relevan untuk tugas yang belum selesai)
  if (status !== 'completed') {
    if (importance === 'high') {
      score += 10;
      factors.push({ factor: 'importance', detail: 'Tingkat kepentingan tinggi', impact: 'medium' });
    } else if (importance === 'medium') {
      score += 4;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel = status === 'completed' ? 'low' : levelFromScore(score);

  // Perkiraan keterlambatan sederhana (berbasis aturan, bukan model ML yang terlatih).
  let predictedDelay = null;
  if (status !== 'completed' && est != null && est > 0 && due) {
    const remainingWork = ((100 - progress) / 100) * est;
    const available = Math.max(0, daysBetween(now, due) ?? 0);
    const delay = remainingWork - available;
    if (delay > 0) predictedDelay = Math.round(delay * 10) / 10;
  }

  return {
    risk_level: riskLevel,
    risk_score: score,
    predicted_delay_days: predictedDelay,
    contributing_factors: factors,
    recommendation: buildRecommendation(riskLevel, factors, status),
    model_version: RISK_MODEL_VERSION,
  };
}

function buildRecommendation(riskLevel, factors, status) {
  if (status === 'completed') return 'Tugas sudah selesai. Tidak ada tindakan yang diperlukan.';
  const top = factors
    .slice()
    .sort((a, b) => impactWeight(b.impact) - impactWeight(a.impact))[0];
  if (!top) return 'Tidak ada indikator risiko signifikan. Lanjutkan pemantauan berkala.';

  const map = {
    overdue: 'Segera tindak lanjuti tugas yang sudah melewati tenggat; pertimbangkan penyesuaian jadwal atau bantuan sumber daya.',
    deadline_near: 'Prioritaskan tugas ini karena tenggatnya sangat dekat; pastikan hambatan segera diselesaikan.',
    deadline_soon: 'Jadwalkan penyelesaian tugas ini dalam beberapa hari ke depan.',
    deadline_upcoming: 'Pantau tugas ini agar progres tetap sesuai rencana.',
    progress_lag: 'Tinjau hambatan dan sesuaikan alokasi agar progres menyusul rencana.',
    blocked: 'Identifikasi penyebab hambatan dan eskalasikan kepada manajer proyek.',
    dependency_unfinished: 'Selesaikan atau percepat tugas prasyarat sebelum melanjutkan tugas ini.',
    importance: 'Pastikan sumber daya memadai karena tugas ini penting bagi proyek.',
  };
  return map[top.factor] || (riskLevel === 'high'
    ? 'Tugas berisiko tinggi; tinjau segera bersama manajer proyek.'
    : 'Pantau tugas dan perbarui progres secara berkala.');
}

function impactWeight(impact) {
  return impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
}

const IMPORTANCE_MAP = { low: 0, medium: 1, high: 2 };

const FEATURE_ADVICE = {
  days_remaining: 'Tenggat makin dekat/terlewat. Prioritaskan atau sesuaikan jadwal tugas ini.',
  progress: 'Progres masih tertinggal dari rencana. Tinjau hambatan dan percepat penyelesaian.',
  importance: 'Tugas berkepentingan tinggi; pastikan sumber daya memadai.',
  unfinished_dependency_count: 'Ada prasyarat yang belum selesai; selesaikan lebih dulu.',
  dependency_count: 'Banyak ketergantungan antar-tugas; koordinasikan urutan pengerjaan.',
  assignee_workload: 'Beban penanggung jawab tinggi; pertimbangkan redistribusi tugas.',
  team_size: 'Ukuran tim memengaruhi kapasitas penyelesaian tugas ini.',
  project_complexity: 'Kompleksitas proyek tinggi meningkatkan ketidakpastian.',
  manager_experience: 'Pengalaman manajer memengaruhi kestabilan pengelolaan risiko.',
  historical_risk_score: 'Riwayat risiko proyek ini cenderung tinggi.',
  budget_per_task: 'Anggaran per tugas ketat; waspadai keterbatasan sumber daya.',
  duration_days: 'Durasi rencana tugas memengaruhi risiko penyelesaian.',
};

function impactFromRank(index, total) {
  if (index < 2) return 'high';
  if (index < 4 && total > 2) return 'medium';
  return 'low';
}

function describeDriver(driver) {
  const arah = driver.direction === 'up' ? 'menaikkan' : 'menurunkan';
  return `${driver.label} (nilai ${driver.value}) ${arah} risiko.`;
}

function recommendationFromDrivers(riskLevel, drivers) {
  const top = drivers.find((d) => d.direction === 'up') || drivers[0];
  if (!top) {
    return riskLevel === 'high'
      ? 'Tugas berisiko tinggi; tinjau segera bersama manajer proyek.'
      : 'Pantau tugas dan perbarui progres secara berkala.';
  }
  const advice = FEATURE_ADVICE[top.feature];
  const prefix = riskLevel === 'high' ? 'Risiko tinggi. ' : '';
  return advice ? `${prefix}${advice}` : 'Pantau tugas dan perbarui progres secara berkala.';
}

function exportDrivers(drivers) {
  return drivers.map((d, i) => ({
    feature: d.feature,
    label: d.label,
    detail: describeDriver(d),
    impact: impactFromRank(i, drivers.length),
    direction: d.direction,
    value: d.value,
  }));
}

/**
 * Membangun vektor fitur ML untuk satu tugas berdasarkan konteks proyek.
 */
export function buildFeatureVector(task, ctx) {
  const now = ctx.now;
  const start = toDate(task.start_date);
  const due = toDate(task.due_date);

  let duration = null;
  if (start && due) duration = Math.round((due.getTime() - start.getTime()) / DAY_MS);
  else if (task.estimated_duration != null) duration = Number(task.estimated_duration);
  if (!duration || duration <= 0) duration = 7;

  const daysRemaining = due ? Math.round((due.getTime() - now.getTime()) / DAY_MS) : 30;

  const deps = ctx.depsByTask.get(task.id) || [];
  const unfinished = deps.filter((d) => d.status !== 'completed').length;

  const workload = task.assignee_id ? ctx.workloadByUser.get(task.assignee_id) || 0 : 0;

  return {
    task_id: task.id,
    duration_days: duration,
    progress: Number(task.progress ?? 0),
    days_remaining: daysRemaining,
    importance: IMPORTANCE_MAP[task.importance] ?? 1,
    dependency_count: deps.length,
    unfinished_dependency_count: unfinished,
    assignee_workload: workload,
    team_size: ctx.teamSize,
    project_complexity: ctx.complexity,
    manager_experience: ctx.managerExperience,
    historical_risk_score: ctx.historicalRisk,
    budget_per_task: ctx.budgetPerTask,
  };
}

async function gatherContext(projectId, tasks, depsByTask) {
  const now = new Date();

  const projectRes = await query('SELECT manager_id, budget, name FROM projects WHERE id = ?', [projectId]);
  const project = projectRes.rows[0] || {};

  const teamSize = new Set(tasks.map((t) => t.assignee_id).filter(Boolean)).size || 1;
  const complexity = tasks.length;
  const budget = project.budget != null ? Number(project.budget) : 0;
  const budgetPerTask = budget > 0 ? Math.round((budget / tasks.length) * 100) / 100 : 0;

  let managerExperience = 0;
  if (project.manager_id) {
    const { rows } = await query(
      'SELECT COUNT(DISTINCT id) AS c FROM projects WHERE manager_id = ? AND deleted_at IS NULL',
      [project.manager_id],
    );
    managerExperience = Number(rows[0].c);
  }

  // Assessment terakhir per tugas (padanan DISTINCT ON di PostgreSQL).
  const histRes = await query(
    `SELECT COALESCE(AVG(risk_score), 0) AS avg FROM (
       SELECT ra.risk_score FROM (
         SELECT id, task_id, risk_score,
                ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY analyzed_at DESC, id DESC) AS rn
         FROM risk_assessments
         WHERE project_id = ? AND task_id IS NOT NULL
       ) ranked
       JOIN risk_assessments ra ON ra.id = ranked.id
       WHERE ranked.rn = 1
     ) x`,
    [projectId],
  );
  const historicalRisk = Math.round(Number(histRes.rows[0].avg) || 0);

  const workloadRes = await query(
    `SELECT assignee_id, COUNT(*) AS c FROM tasks
     WHERE assignee_id IS NOT NULL AND deleted_at IS NULL AND status IN ('todo','in_progress','blocked')
     GROUP BY assignee_id`,
  );
  const workloadByUser = new Map(workloadRes.rows.map((r) => [r.assignee_id, Number(r.c)]));

  return { now, teamSize, complexity, managerExperience, historicalRisk, budgetPerTask, workloadByUser, depsByTask, projectName: project.name || `#${projectId}` };
}

async function loadProjectRiskContext(projectId) {
  const tasksRes = await query('SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL', [projectId]);
  const tasks = tasksRes.rows;
  if (tasks.length === 0) return { tasks: [], depsByTask: new Map(), ctx: null };

  const depsRes = await query(
    `SELECT td.task_id, t.id AS depends_on_task_id, t.title, t.status, t.progress
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_task_id
     WHERE t.project_id = ? AND t.deleted_at IS NULL`,
    [projectId],
  );
  const depsByTask = new Map();
  for (const d of depsRes.rows) {
    if (!depsByTask.has(d.task_id)) depsByTask.set(d.task_id, []);
    depsByTask.get(d.task_id).push(d);
  }

  const ctx = await gatherContext(projectId, tasks, depsByTask);
  return { tasks, depsByTask, ctx };
}

/**
 * Data fitur yang dibutuhkan browser untuk menjalankan model.
 * Endpoint ini hanya membaca database (query ringan) — tidak ada inferensi
 * Machine Learning di server.
 */
export async function getProjectRiskFeatures(projectId) {
  const { tasks, ctx } = await loadProjectRiskContext(projectId);
  if (!ctx) {
    return {
      engine: 'client',
      model_version: ML_MODEL_VERSION,
      feature_names: FEATURE_NAMES,
      items: [],
    };
  }

  const pending = tasks.filter((task) => task.status !== 'completed');
  return {
    engine: 'client',
    model_version: ML_MODEL_VERSION,
    feature_names: FEATURE_NAMES,
    items: pending.map((task) => buildFeatureVector(task, ctx)),
  };
}

function finiteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function sanitizeDriver(raw) {
  const feature = String(raw?.feature || '');
  if (!FEATURE_NAMES.includes(feature)) return null;
  const contribution = finiteNumber(raw?.contribution, 0);
  return {
    feature,
    label: FEATURE_LABELS[feature] || feature,
    value: finiteNumber(raw?.value, 0),
    contribution,
    direction: raw?.direction === 'down' || contribution < 0 ? 'down' : 'up',
  };
}

/**
 * Validasi & normalisasi prediksi yang dikirim browser.
 * Skor/level dihitung ulang dari probabilitas agar data client tidak bisa
 * membuat nilai yang tidak konsisten.
 */
export function normalizePredictions(predictions, pendingTasks) {
  const byTask = new Map();
  if (predictions == null) return byTask;
  if (!Array.isArray(predictions)) throw badRequest('predictions harus berupa array');
  if (predictions.length > MAX_PREDICTIONS) {
    throw badRequest(`Maksimal ${MAX_PREDICTIONS} prediksi per analisis`);
  }

  const pendingIds = new Set(pendingTasks.map((task) => task.id));
  for (const raw of predictions) {
    const taskId = Number(raw?.task_id);
    if (!Number.isInteger(taskId) || !pendingIds.has(taskId)) continue;
    if (raw?.risk_level != null && !ALLOWED_RISK_LEVELS.has(raw.risk_level)) continue;

    const rawProbabilities = raw?.probabilities || {};
    const low = Math.max(0, finiteNumber(rawProbabilities.low, 0));
    const medium = Math.max(0, finiteNumber(rawProbabilities.medium, 0));
    const high = Math.max(0, finiteNumber(rawProbabilities.high, 0));
    const total = low + medium + high;
    if (!(total > 0)) continue;

    const probabilities = { low: low / total, medium: medium / total, high: high / total };
    let riskLevel = 'low';
    let confidence = probabilities.low;
    if (probabilities.medium > confidence) {
      riskLevel = 'medium';
      confidence = probabilities.medium;
    }
    if (probabilities.high > confidence) {
      riskLevel = 'high';
      confidence = probabilities.high;
    }
    const riskScore = Math.round(
      (probabilities.low * SEVERITY.low
        + probabilities.medium * SEVERITY.medium
        + probabilities.high * SEVERITY.high) * 100,
    ) / 100;

    const drivers = Array.isArray(raw?.drivers)
      ? raw.drivers.slice(0, MAX_DRIVERS).map(sanitizeDriver).filter(Boolean)
      : [];

    byTask.set(taskId, {
      risk_level: riskLevel,
      risk_score: riskScore,
      confidence: round4(confidence),
      probabilities: {
        low: round4(probabilities.low),
        medium: round4(probabilities.medium),
        high: round4(probabilities.high),
      },
      drivers,
    });
  }
  return byTask;
}

/**
 * Menjalankan analisis risiko untuk seluruh tugas dalam sebuah proyek dan menyimpannya.
 *
 * Prediksi model dihitung di browser lalu dikirim melalui `predictions`.
 * Bila tidak ada prediksi valid (mis. model client gagal dimuat), backend memakai
 * fallback aturan rules-v1 yang murah dan transparan.
 */
export async function analyzeProjectRisk(projectId, actorId, predictions = null) {
  const { tasks, depsByTask, ctx } = await loadProjectRiskContext(projectId);
  if (tasks.length === 0) return [];

  const { now } = ctx;

  // Hasil aturan (dipakai untuk fallback & estimasi keterlambatan sederhana).
  const rulesByTask = new Map();
  for (const task of tasks) {
    rulesByTask.set(task.id, computeTaskRisk(task, { now, dependencies: depsByTask.get(task.id) || [] }));
  }

  const pending = tasks.filter((task) => task.status !== 'completed');
  const predictionsByTask = normalizePredictions(predictions, pending);
  const usedMl = predictionsByTask.size > 0;

  const results = [];
  for (const task of tasks) {
    const rules = rulesByTask.get(task.id);
    let risk;
    if (task.status === 'completed') {
      risk = {
        risk_level: 'low',
        risk_score: 0,
        confidence: usedMl || pending.length === 0 ? 1 : null,
        probabilities: usedMl || pending.length === 0 ? { low: 1, medium: 0, high: 0 } : null,
        contributing_factors: [],
        recommendation: 'Tugas sudah selesai. Tidak ada tindakan yang diperlukan.',
        predicted_delay_days: null,
        model_version: usedMl ? ML_MODEL_VERSION : RISK_MODEL_VERSION,
      };
    } else if (predictionsByTask.has(task.id)) {
      const ml = predictionsByTask.get(task.id);
      risk = {
        risk_level: ml.risk_level,
        risk_score: ml.risk_score,
        confidence: ml.confidence,
        probabilities: ml.probabilities,
        contributing_factors: exportDrivers(ml.drivers),
        recommendation: recommendationFromDrivers(ml.risk_level, ml.drivers),
        predicted_delay_days: rules.predicted_delay_days,
        model_version: ML_MODEL_VERSION,
      };
    } else {
      risk = {
        risk_level: rules.risk_level,
        risk_score: rules.risk_score,
        confidence: null,
        probabilities: null,
        contributing_factors: rules.contributing_factors,
        recommendation: rules.recommendation,
        predicted_delay_days: rules.predicted_delay_days,
        model_version: RISK_MODEL_VERSION,
      };
    }

    const { insertId } = await query(
      `INSERT INTO risk_assessments
         (project_id, task_id, risk_level, risk_score, predicted_delay_days, contributing_factors,
          recommendation, model_version, confidence, probabilities, analyzed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        projectId,
        task.id,
        risk.risk_level,
        risk.risk_score,
        risk.predicted_delay_days,
        JSON.stringify(risk.contributing_factors),
        risk.recommendation,
        risk.model_version,
        risk.confidence,
        risk.probabilities ? JSON.stringify(risk.probabilities) : null,
      ],
    );
    const { rows: insertedRows } = await query('SELECT * FROM risk_assessments WHERE id = ?', [insertId]);
    results.push({ ...insertedRows[0], task_title: task.title });
  }

  const modelUsed = usedMl ? ML_MODEL_VERSION : RISK_MODEL_VERSION;
  await logActivity({
    entityType: 'project',
    entityId: projectId,
    action: 'analyze_risk',
    description: `Analisis risiko & prioritas (${modelUsed}) untuk ${tasks.length} tugas di proyek '${ctx.projectName}'`,
    actorId,
  });

  return results;
}
