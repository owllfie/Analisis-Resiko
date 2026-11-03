import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../config/db.js';
import { runMigrations } from './migrate.js';

// Data contoh realistis untuk pengembangan/demo.
// Tidak ada label "dummy"/"demo" pada nama pengguna maupun proyek.
const MEMBER_PASSWORD = 'Member123!';
const LEGACY_DOMAIN = '@dummy.local';

const MEMBERS = [
  { name: 'Budi Santoso', email: 'budi.santoso@gmail.com' },
  { name: 'Siti Nurhaliza', email: 'siti.nurhaliza@gmail.com' },
  { name: 'Agus Prasetyo', email: 'agus.prasetyo@gmail.com' },
  { name: 'Dewi Lestari', email: 'dewi.lestari@gmail.com' },
  { name: 'Rizky Ramadhan', email: 'rizky.ramadhan@gmail.com' },
  { name: 'Putri Maharani', email: 'putri.maharani@gmail.com' },
  { name: 'Andi Wijaya', email: 'andi.wijaya@gmail.com' },
  { name: 'Maya Kusuma', email: 'maya.kusuma@gmail.com' },
  { name: 'Fajar Nugroho', email: 'fajar.nugroho@gmail.com' },
  { name: 'Rina Hartati', email: 'rina.hartati@gmail.com' },
  { name: 'Dimas Setiawan', email: 'dimas.setiawan@gmail.com' },
  { name: 'Nadia Safitri', email: 'nadia.safitri@gmail.com' },
];

// Manajer proyek: setiap proyek punya penanggung jawab yang berbeda-beda (nama asli,
// bukan "Manajer 1"). Password sama seperti anggota agar mudah dipakai saat demo.
const MANAGERS = [
  { name: 'Hendra Wijaya', email: 'hendra.wijaya@gmail.com' },
  { name: 'Ratna Kusumawati', email: 'ratna.kusumawati@gmail.com' },
  { name: 'Bambang Sutrisno', email: 'bambang.sutrisno@gmail.com' },
  { name: 'Sri Wahyuni', email: 'sri.wahyuni@gmail.com' },
];

const ADMINISTRATORS = [
  { name: 'Yusuf Maulana', email: 'yusuf.maulana@gmail.com' },
];

const PROJECTS = [
  {
    name: 'Migrasi Sistem Core Banking',
    description:
      'Migrasi platform core banking lama ke arsitektur layanan mikro, termasuk konversi data nasabah dan integrasi antarmuka pembayaran.',
    budget: 750000000,
    start: -30,
    due: 50,
    manager: 0,
    deps: [[2, 1], [3, 2]],
    tasks: [
      { title: 'Analisis kebutuhan dan pemetaan proses bisnis', importance: 'high', status: 'completed', progress: 100, est: 5, start: -30, due: -24 },
      { title: 'Konversi skema data nasabah', importance: 'high', status: 'in_progress', progress: 35, est: 10, start: -22, due: -6 },
      { title: 'Integrasi antarmuka pembayaran', importance: 'high', status: 'blocked', progress: 20, est: 8, start: -10, due: -2 },
      { title: 'Pengujian paralel sistem', importance: 'medium', status: 'todo', progress: 0, est: 6, start: 8, due: 20 },
      { title: 'Pelatihan tim operasional', importance: 'low', status: 'todo', progress: 0, est: 3, start: 30, due: 45 },
    ],
  },
  {
    name: 'Aplikasi Mobile Nasabah',
    description:
      'Pengembangan aplikasi mobile perbankan untuk nasabah ritel dengan fitur transaksi, notifikasi, dan autentikasi biometrik.',
    budget: 480000000,
    start: -20,
    due: 60,
    manager: 1,
    deps: [[3, 2], [4, 3]],
    tasks: [
      { title: 'Perancangan UI/UX aplikasi', importance: 'high', status: 'completed', progress: 100, est: 6, start: -20, due: -13 },
      { title: 'Pengembangan modul autentikasi biometrik', importance: 'high', status: 'in_progress', progress: 45, est: 9, start: -12, due: 10 },
      { title: 'Integrasi API transaksi', importance: 'high', status: 'in_progress', progress: 30, est: 8, start: -9, due: 14 },
      { title: 'Pengujian perangkat Android dan iOS', importance: 'medium', status: 'todo', progress: 0, est: 7, start: 16, due: 38 },
      { title: 'Publikasi ke Play Store dan App Store', importance: 'medium', status: 'todo', progress: 0, est: 3, start: 40, due: 52 },
    ],
  },
  {
    name: 'Implementasi ERP Modul Keuangan',
    description:
      'Pemasangan dan konfigurasi modul keuangan ERP mencakup akuntansi, pengadaan, dan pelaporan manajemen.',
    budget: 320000000,
    start: -35,
    due: 30,
    manager: 2,
    deps: [[3, 2], [4, 3]],
    tasks: [
      { title: 'Pemetaan bagan akun dan kebijakan akuntansi', importance: 'high', status: 'completed', progress: 100, est: 7, start: -35, due: -27 },
      { title: 'Konfigurasi modul pengadaan', importance: 'high', status: 'in_progress', progress: 55, est: 8, start: -24, due: -1 },
      { title: 'Migrasi data transaksi keuangan', importance: 'high', status: 'blocked', progress: 20, est: 8, start: -14, due: 9 },
      { title: 'Penyusunan laporan manajemen otomatis', importance: 'medium', status: 'todo', progress: 0, est: 6, start: 12, due: 24 },
      { title: 'Uji terima pengguna (UAT)', importance: 'medium', status: 'todo', progress: 0, est: 4, start: 25, due: 29 },
    ],
  },
  {
    name: 'Revamp Portal Web Perusahaan',
    description:
      'Perancangan ulang portal web perusahaan dengan optimalisasi performa, aksesibilitas, dan pengelolaan konten terpusat.',
    budget: 185000000,
    start: -18,
    due: 42,
    manager: 3,
    deps: [[3, 2], [4, 3]],
    tasks: [
      { title: 'Audit konten dan arsitektur informasi', importance: 'medium', status: 'completed', progress: 100, est: 4, start: -18, due: -13 },
      { title: 'Desain antarmuka dan sistem komponen', importance: 'high', status: 'in_progress', progress: 50, est: 8, start: -12, due: 6 },
      { title: 'Pengembangan frontend portal', importance: 'high', status: 'todo', progress: 0, est: 10, start: 2, due: 26 },
      { title: 'Migrasi konten dan pengujian aksesibilitas', importance: 'medium', status: 'todo', progress: 0, est: 5, start: 27, due: 38 },
    ],
  },
  {
    name: 'Rollout Jaringan Kantor Cabang',
    description:
      'Penyiapan infrastruktur jaringan dan perangkat untuk pembukaan kantor cabang baru di lima lokasi.',
    budget: 610000000,
    start: -15,
    due: 70,
    manager: 0,
    deps: [[3, 2], [4, 3], [5, 4]],
    tasks: [
      { title: 'Survei lokasi dan perencanaan jaringan', importance: 'high', status: 'completed', progress: 100, est: 6, start: -15, due: -9 },
      { title: 'Pengadaan router dan switch', importance: 'high', status: 'in_progress', progress: 50, est: 8, start: -12, due: 6 },
      { title: 'Instalasi jaringan cabang wilayah barat', importance: 'high', status: 'blocked', progress: 30, est: 6, start: -5, due: 12 },
      { title: 'Instalasi jaringan cabang wilayah timur', importance: 'medium', status: 'todo', progress: 0, est: 6, start: 15, due: 35 },
      { title: 'Uji konektivitas dan failover', importance: 'medium', status: 'todo', progress: 0, est: 4, start: 40, due: 55 },
      { title: 'Serah terima ke tim IT cabang', importance: 'low', status: 'todo', progress: 0, est: 2, start: 58, due: 65 },
    ],
  },
  {
    name: 'Integrasi Payment Gateway',
    description:
      'Integrasi penyedia payment gateway untuk pembayaran daring, mencakup kanal kartu, virtual account, dan dompet digital.',
    budget: 275000000,
    start: -12,
    due: 40,
    manager: 1,
    deps: [[3, 2], [4, 3]],
    tasks: [
      { title: 'Studi kelayakan penyedia payment gateway', importance: 'high', status: 'completed', progress: 100, est: 4, start: -12, due: -8 },
      { title: 'Integrasi SDK dan API pembayaran', importance: 'high', status: 'in_progress', progress: 40, est: 9, start: -7, due: 10 },
      { title: 'Konfigurasi keamanan dan kepatuhan PCI-DSS', importance: 'high', status: 'blocked', progress: 20, est: 7, start: -4, due: 14 },
      { title: 'Pengujian rekonsiliasi transaksi', importance: 'medium', status: 'todo', progress: 0, est: 6, start: 16, due: 32 },
      { title: 'Peluncuran dan pemantauan awal', importance: 'low', status: 'todo', progress: 0, est: 3, start: 33, due: 38 },
    ],
  },
];

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Membuat/memperbarui satu pengguna, mengembalikan id-nya. `role` menentukan perannya.
async function upsertUser(client, person, role, legacyEmail) {
  const params = legacyEmail ? [person.email, legacyEmail] : [person.email];
  const where = legacyEmail ? 'email = ? OR email = ?' : 'email = ?';
  const { rows: existingRows } = await client.query(
    `SELECT id FROM users WHERE ${where} ORDER BY id LIMIT 1`,
    params,
  );
  if (existingRows[0]) {
    await client.query(
      'UPDATE users SET name = ?, email = ?, role = ?, deleted_at = NULL, updated_at = NOW() WHERE id = ?',
      [person.name, person.email, role, existingRows[0].id],
    );
    return existingRows[0].id;
  }
  const hash = await bcrypt.hash(MEMBER_PASSWORD, 10);
  const { insertId } = await client.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
    [person.name, person.email, hash, role],
  );
  console.log(`[dummy] pengguna dibuat: ${person.name} <${person.email}> (${role})`);
  return insertId;
}

// Mengisi seluruh pengguna contoh (anggota, manajer, administrator) dan mengembalikan peta id.
async function upsertPeople(client) {
  const memberIds = [];
  for (let i = 0; i < MEMBERS.length; i += 1) {
    const legacyEmail = `member${i + 1}${LEGACY_DOMAIN}`;
    memberIds.push(await upsertUser(client, MEMBERS[i], 'member', legacyEmail));
  }
  const managerIds = [];
  for (const m of MANAGERS) {
    managerIds.push(await upsertUser(client, m, 'manager', null));
  }
  const adminIds = [];
  for (const a of ADMINISTRATORS) {
    adminIds.push(await upsertUser(client, a, 'admin', null));
  }
  return { memberIds, managerIds, adminIds };
}

async function seedDummy() {
  await runMigrations();
  const result = await withTransaction(async (client) => {
    // Bersihkan sisa data contoh lama yang masih berlabel "[DUMMY]".
    await client.query("DELETE FROM projects WHERE name LIKE '[DUMMY]%'");

    // Ganti pengguna contoh lama (anggota1..12@dummy.local) dengan nama asli, lalu
    // pastikan pengguna contoh lengkap (anggota, manajer, administrator).
    const { memberIds, managerIds, adminIds } = await upsertPeople(client);

    let createdProjects = 0;
    let createdTasks = 0;
    let createdDeps = 0;
    let createdHistory = 0;

    for (const p of PROJECTS) {
      const { rows: existsRows } = await client.query('SELECT id FROM projects WHERE name = ?', [p.name]);
      if (existsRows[0]) continue;

      const managerId = managerIds[p.manager % managerIds.length] ?? adminIds[0] ?? null;
      const { insertId: projectId } = await client.query(
        `INSERT INTO projects (name, description, start_date, due_date, status, manager_id, budget)
         VALUES (?,?,?,?,?,?,?)`,
        [p.name, p.description, daysFromNow(p.start), daysFromNow(p.due), 'active', managerId, p.budget],
      );
      createdProjects += 1;

      // Setiap tugas ditugaskan ke anggota yang berbeda (rotasi) agar beban kerja terlihat.
      // Sebagian tugas sengaja ditumpuk pada beberapa orang saja agar ada anggota yang
      // beban kerjanya tinggi. Beban kerja penanggung jawab adalah fitur terkuat pada
      // model AI, sehingga penumpukan inilah yang memunculkan risiko "sedang"/"tinggi".
      const OVERLOADED_MEMBERS = [0, 1, 2];
      const taskIds = [];
      p.tasks.forEach((t, index) => {
        const openTask = t.status !== 'completed';
        // Tugas terbuka pada tiap proyek mayoritas jatuh ke anggota yang sama (rotasi
        // lambat), sehingga beban mereka menumpuk lintas proyek.
        const useOverloaded = openTask && (index + projectId) % 3 !== 0;
        const pool = useOverloaded ? OVERLOADED_MEMBERS : memberIds.map((_, i) => i);
        const memberIndex = useOverloaded
          ? pool[(projectId + index) % pool.length]
          : pool[(projectId * 3 + index) % pool.length];
        taskIds.push({ index, id: null, task: t, assigneeId: memberIds[memberIndex] });
      });

      for (const entry of taskIds) {
        const { insertId: taskId } = await client.query(
          `INSERT INTO tasks
             (project_id, title, description, assignee_id, status, progress, estimated_duration, actual_duration, start_date, due_date, importance)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            projectId, entry.task.title, entry.task.description || `${entry.task.title} untuk proyek ${p.name}.`,
            entry.assigneeId, entry.task.status, entry.task.progress, entry.task.est,
            entry.task.status === 'completed' ? entry.task.est : null,
            daysFromNow(entry.task.start), daysFromNow(entry.task.due), entry.task.importance,
          ],
        );
        entry.id = taskId;
        createdTasks += 1;

        // Riwayat progres: status awal + pembaruan terakhir agar grafik/riwayat terisi.
        await client.query(
          `INSERT INTO task_progress_history (task_id, progress, status, note, updated_by, recorded_at)
           VALUES (?,?,?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [taskId, 0, 'todo', 'Tugas dibuat', memberIds[0], Math.max(1, entry.task.est)],
        );
        if (entry.task.progress > 0) {
          await client.query(
            `INSERT INTO task_progress_history (task_id, progress, status, note, updated_by, recorded_at)
             VALUES (?,?,?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
            [
              taskId, entry.task.progress, entry.task.status,
              entry.task.status === 'blocked' ? 'Terhambat, menunggu tindak lanjut' : 'Progres diperbarui',
              entry.assigneeId, 1,
            ],
          );
          createdHistory += 1;
        }
      }

      // Ketergantungan (prasyarat) antar tugas dalam proyek yang sama.
      for (const [fromIdx, toIdx] of p.deps || []) {
        const from = taskIds.find((t) => t.index === fromIdx);
        const to = taskIds.find((t) => t.index === toIdx);
        if (!from?.id || !to?.id) continue;
        await client.query(
          'INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?,?)',
          [from.id, to.id],
        );
        createdDeps += 1;
      }
    }
    return { createdProjects, createdTasks, createdDeps, createdHistory };
  });

  console.log(
    `[dummy] selesai: ${result.createdProjects} proyek, ${result.createdTasks} tugas, ` +
      `${result.createdDeps} ketergantungan, ${result.createdHistory} riwayat progres.`,
  );
  console.log(`[dummy] akun anggota:    budi.santoso@gmail.com / ${MEMBER_PASSWORD}`);
  console.log(`[dummy] akun manajer:    hendra.wijaya@gmail.com / ${MEMBER_PASSWORD}`);
  console.log(`[dummy] akun admin:      yusuf.maulana@gmail.com / ${MEMBER_PASSWORD}`);
}

seedDummy().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
