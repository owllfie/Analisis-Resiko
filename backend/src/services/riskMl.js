import { config } from '../config/env.js';

// Klien untuk layanan Machine Learning (FastAPI, scikit-learn) — analisis risiko v2.
// Bila layanan tidak tersedia, pemanggil akan memakai fallback berbasis aturan.

export const ML_MODEL_VERSION = 'ml-ens-v3';

const FEATURE_NAMES = [
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
];

function normalizeItem(item) {
  const out = {};
  for (const name of FEATURE_NAMES) {
    out[name] = Number.isFinite(Number(item[name])) ? Number(item[name]) : 0;
  }
  out.task_id = item.task_id ?? null;
  return out;
}

async function request(path, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.mlServiceUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`ML service merespons ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function predictBatch(items) {
  if (!items.length) return [];
  const payload = { items: items.map(normalizeItem) };
  const body = await request('/predict/batch', { method: 'POST', body: JSON.stringify(payload) });
  return body.results || [];
}

export async function fetchModelInfo() {
  return request('/model-info', { method: 'GET' });
}

export async function isHealthy() {
  try {
    await request('/health', { method: 'GET' }, 3000);
    return true;
  } catch {
    return false;
  }
}
