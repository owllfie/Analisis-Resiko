import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../config/db.js';
import { config } from '../config/env.js';
import { runMigrations } from './migrate.js';

// PENTING: data berikut hanya untuk pengembangan/demo.
// Password default hanya untuk demo lokal, jangan dipakai di produksi.
const DEMO_USERS = [
  { name: 'Rina Pratama', email: 'superadmin@gmail.com', password: 'Super123!', role: 'superadmin' },
  { name: 'Budi Santoso', email: 'admin@gmail.com', password: 'Admin123!', role: 'admin' },
  { name: 'Sari Wulandari', email: 'manager@gmail.com', password: 'Manager123!', role: 'manager' },
  { name: 'Andi Wijaya', email: 'member@gmail.com', password: 'Member123!', role: 'member' },
];

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  await runMigrations();

  const [existingProjects] = await pool.query('SELECT COUNT(*) AS c FROM projects');
  if (Number(existingProjects[0].c) > 0) {
    console.log('[seed] proyek sudah ada, seed dilewati');
    return;
  }

  await withTransaction(async (client) => {
    const userIds = {};
    for (const u of DEMO_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      const { insertId } = await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), name = VALUES(name), role = VALUES(role)`,
        [u.name, u.email, hash, u.role],
      );
      userIds[u.role] = insertId;
    }

    const { insertId: projectId } = await client.query(
      `INSERT INTO projects (name, description, start_date, due_date, status, manager_id)
       VALUES (?,?,?,?,?,?)`,
      [
        'Implementasi Sistem Pembayaran Digital',
        'Pengembangan sistem pembayaran digital untuk mempercepat rekonsiliasi transaksi dan meningkatkan pengalaman pelanggan.',
        daysFromNow(-20),
        daysFromNow(25),
        'active',
        userIds.manager,
      ],
    );

    const taskDefs = [
      { title: 'Validasi kebutuhan merchant', status: 'completed', progress: 100, importance: 'high', est: 5, actual: 6, start: -20, due: -14 },
      { title: 'Perancangan arsitektur transaksi', status: 'completed', progress: 100, importance: 'high', est: 7, actual: 7, start: -14, due: -7 },
      { title: 'Pengembangan API pembayaran', status: 'in_progress', progress: 55, importance: 'high', est: 14, actual: null, start: -7, due: 8 },
      { title: 'Integrasi payment gateway', status: 'blocked', progress: 25, importance: 'high', est: 10, actual: null, start: -3, due: 7 },
      { title: 'Pengujian transaksi dan refund', status: 'todo', progress: 0, importance: 'medium', est: 8, actual: null, start: 6, due: 18 },
      { title: 'Dokumentasi operasional', status: 'todo', progress: 0, importance: 'medium', est: 4, actual: null, start: 15, due: 24 },
    ];

    const taskIds = [];
    for (const t of taskDefs) {
      const { insertId: taskId } = await client.query(
        `INSERT INTO tasks
           (project_id, title, description, assignee_id, status, progress, estimated_duration, actual_duration, start_date, due_date, importance)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          projectId, t.title, `Dokumen kerja untuk ${t.title}.`, userIds.member, t.status, t.progress,
          t.est, t.actual, daysFromNow(t.start), daysFromNow(t.due), t.importance,
        ],
      );
      taskIds.push(taskId);
      await client.query(
        `INSERT INTO task_progress_history (task_id, progress, status, note, updated_by)
         VALUES (?,?,?,?,?)`,
        [taskId, t.progress, t.status, 'Status awal proyek', userIds.member],
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
      VALUES ('project', ?, 'seed', 'Data awal proyek dibuat', ?)`,
      [projectId, userIds.manager],
    );
  });

  console.log('[seed] data demo berhasil dibuat');
  console.log('[seed] akun awal: admin@gmail.com / manager@gmail.com / member@gmail.com');
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
