import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../config/db.js';
import { config } from '../config/env.js';
import { runMigrations } from './migrate.js';

// PENTING: data berikut hanya untuk pengembangan/demo.
// Password default hanya untuk demo lokal, jangan dipakai di produksi.
const DEMO_USERS = [
  { name: 'Super Admin Demo', email: 'superadmin@gmail.com', password: 'Super123!', role: 'superadmin' },
  { name: 'Admin Demo', email: 'admin@gmail.com', password: 'Admin123!', role: 'admin' },
  { name: 'Manajer Demo', email: 'manager@gmail.com', password: 'Manager123!', role: 'manager' },
  { name: 'Anggota Demo', email: 'member@gmail.com', password: 'Member123!', role: 'member' },
];

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  await runMigrations();

  const [existing] = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (Number(existing[0].c) > 0) {
    console.log('[seed] data sudah ada, seed dilewati');
    return;
  }

  await withTransaction(async (client) => {
    const userIds = {};
    for (const u of DEMO_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      const { insertId } = await client.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
        [u.name, u.email, hash, u.role],
      );
      userIds[u.role] = insertId;
    }

    const { insertId: projectId } = await client.query(
      `INSERT INTO projects (name, description, start_date, due_date, status, manager_id)
       VALUES (?,?,?,?,?,?)`,
      [
        '[DEMO] Migrasi Sistem Pembayaran',
        'Contoh proyek demo untuk memperlihatkan alur kerja. Bukan data nyata.',
        daysFromNow(-20),
        daysFromNow(25),
        'active',
        userIds.manager,
      ],
    );

    const taskDefs = [
      { title: 'Analisis kebutuhan', status: 'completed', progress: 100, importance: 'high', est: 5, actual: 6, start: -20, due: -14 },
      { title: 'Desain skema database', status: 'completed', progress: 100, importance: 'high', est: 4, actual: 4, start: -14, due: -10 },
      { title: 'Implementasi API pembayaran', status: 'in_progress', progress: 40, importance: 'high', est: 10, actual: null, start: -9, due: 3 },
      { title: 'Integrasi gateway pihak ketiga', status: 'blocked', progress: 20, importance: 'high', est: 8, actual: null, start: -5, due: 1 },
      { title: 'Pengujian end-to-end', status: 'todo', progress: 0, importance: 'medium', est: 6, actual: null, start: 2, due: 12 },
      { title: 'Dokumentasi teknis', status: 'todo', progress: 0, importance: 'low', est: 3, actual: null, start: 10, due: 20 },
    ];

    const taskIds = [];
    for (const t of taskDefs) {
      const { insertId: taskId } = await client.query(
        `INSERT INTO tasks
           (project_id, title, description, assignee_id, status, progress, estimated_duration, actual_duration, start_date, due_date, importance)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          projectId, t.title, `[DEMO] ${t.title}`, userIds.member, t.status, t.progress,
          t.est, t.actual, daysFromNow(t.start), daysFromNow(t.due), t.importance,
        ],
      );
      taskIds.push(taskId);
      await client.query(
        `INSERT INTO task_progress_history (task_id, progress, status, note, updated_by)
         VALUES (?,?,?,?,?)`,
        [taskId, t.progress, t.status, '[DEMO] status awal', userIds.member],
      );
    }

    // Dependensi: integrasi bergantung pada API, pengujian bergantung pada integrasi
    const deps = [
      [taskIds[2], taskIds[1]],
      [taskIds[3], taskIds[2]],
      [taskIds[4], taskIds[3]],
    ];
    for (const [taskId, dependsOn] of deps) {
      await client.query(
        'INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?,?)',
        [taskId, dependsOn],
      );
    }

    await client.query(
      `INSERT INTO activity_log (entity_type, entity_id, action, description, actor_id)
       VALUES ('project', ?, 'seed', '[DEMO] data contoh dibuat', ?)`,
      [projectId, userIds.manager],
    );
  });

  console.log('[seed] data demo berhasil dibuat');
  console.log('[seed] akun demo: admin@gmail.com / manager@gmail.com / member@gmail.com');
}

// Membuat akun admin pertama bila belum ada pengguna sama sekali.
// Dipanggil agar aplikasi dapat dipakai dengan data nyata tanpa data demo.
export async function bootstrapAdmin() {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL');
  if (Number(rows[0].c) > 0) return false;

  const hash = await bcrypt.hash(config.admin.password, 10);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
    [config.admin.name, config.admin.email, hash, 'superadmin'],
  );
  console.log(`[bootstrap] akun superadmin dibuat: ${config.admin.email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('[bootstrap] PERINGATAN: password admin masih bawaan. Ubah ADMIN_PASSWORD lewat environment.');
  }
  return true;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  seed()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] error:', err.message);
      process.exit(1);
    });
}

export { seed };
