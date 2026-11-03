import { query } from '../config/db.js';

export async function logActivity({ entityType, entityId, action, description, actorId }, client = null) {
  const runner = client ? client.query.bind(client) : query;
  try {
    await runner(
      `INSERT INTO activity_log (entity_type, entity_id, action, description, actor_id)
       VALUES (?,?,?,?,?)`,
      [entityType, entityId ?? null, action, description ?? null, actorId ?? null],
    );
  } catch (err) {
    // Logging aktivitas tidak boleh menggagalkan operasi utama.
    console.error('[activity] gagal mencatat aktivitas:', err.message);
  }
}
