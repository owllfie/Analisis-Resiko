import { query } from '../config/db.js';

// Definisi entitas yang perubahannya direkam ke tabel `update_history`.
// `columns` = kolom yang boleh dikembalikan (revert) ke nilai sebelumnya.
export const HISTORY_ENTITIES = {
  project: {
    table: 'projects',
    columns: ['name', 'description', 'start_date', 'due_date', 'status', 'manager_id', 'budget'],
  },
  task: {
    table: 'tasks',
    columns: [
      'title', 'description', 'assignee_id', 'status', 'progress',
      'estimated_duration', 'actual_duration', 'start_date', 'due_date', 'importance',
    ],
  },
  user: {
    table: 'users',
    // email tidak diikutkan karena bersifat unik/tidak diubah; password tidak pernah dicatat.
    columns: ['name', 'role'],
  },
};

function pick(obj, columns) {
  const out = {};
  if (!obj) return out;
  for (const col of columns) {
    if (obj[col] !== undefined) out[col] = obj[col];
  }
  return out;
}

// Catat perubahan ke `update_history`. `before` = kondisi sebelum (dipakai untuk revert),
// `after` = kondisi sesudah. Hanya perubahan (update) yang dicatat agar Histori Update
// berisi jejak perubahan kolom, bukan pembuatan maupun penghapusan data.
// Kegagalan pencatatan tidak menggagalkan operasi utama.
export async function recordHistory(
  { entityType, entityId, action, before = null, after = null, metadata = {}, actorId = null },
  client = null,
) {
  if (action !== 'update') return;
  const spec = HISTORY_ENTITIES[entityType];
  if (!spec) return;
  const runner = client ? client.query.bind(client) : query;

  const snapshot = pick(before, spec.columns);
  const next = pick(after, spec.columns);
  const diff = {};
  // Bandingkan kolom yang berubah saja; yang sama tidak perlu dicatat.
  for (const key of new Set([...Object.keys(snapshot), ...Object.keys(next)])) {
    const from = snapshot[key] ?? null;
    const to = next[key] ?? null;
    if (String(from) !== String(to)) diff[key] = { from, to };
  }

  // Tidak ada kolom yang benar-benar berubah -> tidak perlu mencatat histori.
  if (Object.keys(diff).length === 0) return;

  try {
    await runner(
      `INSERT INTO update_history (entity_type, entity_id, action, snapshot, diff, metadata, actor_id)
       VALUES (?,?,?,?,?,?,?)`,
      [entityType, entityId, action, JSON.stringify(snapshot), JSON.stringify(diff), JSON.stringify(metadata), actorId],
    );
  } catch (err) {
    console.error('[history] gagal mencatat histori:', err.message);
  }
}
