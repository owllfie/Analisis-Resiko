# Sistem Informasi Manajemen Proyek Berbasis AI

Aplikasi web untuk mengelola proyek, tugas, progres, serta menganalisis risiko dan
menentukan prioritas pekerjaan. Frontend dan backend dipisah, database MySQL 8,
dan seluruh layanan dijalankan lewat Docker Compose.

## Arsitektur

```
Browser
  ├─ memuat model statis /models/risk-model.json
  ├─ menjalankan inferensi ML di Web Worker (client-side)
  └─ /api  ──►  backend (Bun + Express, host port 3000)  ──►  db (MySQL 8, host 3307)
                    │
                    └─ feature engineering ringan + simpan hasil + fallback aturan
```

> Tidak ada container/layanan ML terpisah. Model Machine Learning diunduh sebagai
> aset statis dan dijalankan di browser, sehingga VPS tidak menanggung beban
> inferensi maupun runtime Python.
>
> Port host dapat diubah lewat `.env` (`FRONTEND_PORT`, `DB_PORT`). Nilai default
> 8090 dan 3307 dipilih agar tidak bentrok dengan layanan umum.

- **frontend/** — React + Vite + Tailwind CSS v4 + Recharts, dibundel dengan Bun, REST melalui `/api`.
  Antarmuka diberi tema (font Inter, aksen indigo, kartu lembut) dengan sidebar, navbar (jam langsung),
  pencarian global, dan modal. Komponen UI bersama ada di `frontend/src/lib/ui.jsx`.
  Halaman **Panduan & AI** (`/panduan`) menjelaskan cara pakai aplikasi serta cara AI
  menghitung risiko dan prioritas.
  **Realtime**: halaman memperbarui data otomatis (polling) dengan indikator `Live` di navbar
  yang dapat dimatikan; interval bawaan 15 detik.
- **backend/** — Express dijalankan dengan Bun, autentikasi JWT (cookie httpOnly), validasi, otorisasi per peran.
  Driver MySQL memakai `mysql2` (kolom DATE dikembalikan sebagai `YYYY-MM-DD`, DECIMAL sebagai angka).
- **ml/** — **hanya untuk training offline**, tidak di-deploy. Model ringan (MLP)
  dilatih/diekspor ke `frontend/public/models/risk-model.json` dan metadata ke
  `backend/src/services/modelInfo.json`. Lihat `ml/README.md`.
- **db** — MySQL 8 (InnoDB, utf8mb4, kolasi case-insensitive). Skema dibuat otomatis via
  migrasi saat backend start; data disimpan pada volume Docker `mysqldata`.

## Menjalankan dengan Docker

1. (Opsional) salin konfigurasi environment:
   ```bash
   cp .env.example .env
   ```
2. Bangun dan jalankan semua layanan:
   ```bash
   docker compose up --build
   ```
3. Buka aplikasi:
   - Frontend: http://localhost:8090
   - API health: http://localhost:3000/api/health

Untuk menghentikan: `docker compose down`.
Untuk menghapus data database juga: `docker compose down -v`.

### Akun admin pertama (bootstrap)

Aplikasi dipakai dengan **data nyata** (tanpa data demo). Saat database masih kosong,
backend otomatis membuat satu akun admin dari environment variable:

| Variabel         | Bawaan                |
|------------------|-----------------------|
| `ADMIN_NAME`     | `Administrator`       |
| `ADMIN_EMAIL`    | `admin@gmail.com`     |
| `ADMIN_PASSWORD` | `Admin123!`           |

> Ganti `ADMIN_PASSWORD` (dan sebaiknya email) sebelum dipakai sungguhan. Pengguna
> lain dapat **mendaftar sendiri** lewat halaman Register (selalu berperan `member`),
> atau dibuat oleh admin melalui halaman **Manajemen Pengguna**.

Data contoh untuk pengembangan masih tersedia bila `SEED_DEMO=true` (menambahkan
akun dan proyek berlabel `[DEMO]` hanya saat database kosong). Data tersebut **tidak**
dibuat secara bawaan.

## Pengembangan lokal (tanpa Docker untuk app)

Proyek ini memakai **Bun** sebagai runtime dan package manager (backend & frontend).

Jalankan database:
```bash
docker compose up db
```
Lalu di `backend/`: `bun install && bun run dev` (butuh MySQL di `localhost:3306`
atau atur variabel `DB_*`). Di `frontend/`: `bun install && bun run dev`
(proxy `/api` ke `http://localhost:3000`).

Model ML tidak perlu dijalankan sebagai server. Untuk memperbarui artefak model
(butuh Python 3.12 di mesin pengembang, **bukan di VPS**):
```bash
cd ml && pip install -r requirements.txt && python export_client_model.py
cd ../frontend && bun run test:model
```

## Perintah penting

| Perintah | Lokasi | Fungsi |
|----------|--------|--------|
| `bun start` | backend | Jalankan server |
| `bun run migrate` | backend | Terapkan migrasi (aman diulang) |
| `bun run seed` | backend | Buat data demo |
| `bun test` | backend | Unit test aturan risiko & prioritas |
| `bun run build` | frontend | Build produksi |
| `python export_client_model.py` | ml | Latih & ekspor model client-side (offline) |
| `bun run test:model` | frontend | Uji parity inferensi JS vs Python |

> Unit test backend membutuhkan dependensi (mis. `pg`). Jalankan di dalam image:
> `docker run --rm -v "$PWD/backend/tests:/app/tests" analisisresiko-backend bun test`.

## Peran & hak akses

Otorisasi divalidasi di backend.

- **admin** — kelola pengguna & peran, akses penuh.
- **manager** — kelola proyek & tugas miliknya, memicu analisis, melihat prioritas.
- **member** — melihat proyek yang berisi tugasnya, memperbarui status/progres/durasi aktual/catatan pada tugasnya saja.

## Endpoint API utama

```
POST   /api/auth/login
POST   /api/auth/register         (daftar akun baru; peran 'member', langsung login)
POST   /api/auth/logout
GET    /api/auth/me
PATCH  /api/auth/profile          (perbarui nama dan/atau password sendiri)

GET    /api/risk-model            (metadata model client-side + versi fallback aturan)

GET    /api/dashboard

GET    /api/users                (admin/manager)
POST   /api/users                (admin)
PATCH  /api/users/:id            (admin)
DELETE /api/users/:id            (admin)

GET    /api/projects
POST   /api/projects             (admin/manager)
GET    /api/projects/:id
PATCH  /api/projects/:id         (admin/manager)
DELETE /api/projects/:id         (admin/manager; ?archive=true untuk mengarsipkan)
GET    /api/projects/:id/tasks
POST   /api/projects/:id/tasks   (admin/manager)
GET    /api/projects/:id/risk-features      (vektor fitur untuk inferensi di browser)
POST   /api/projects/:id/analyze-risk      (menerima hasil prediksi client; tanpa body = rules-v1)
GET    /api/projects/:id/risk-assessments
GET    /api/projects/:id/task-priorities

GET    /api/tasks/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
GET    /api/tasks/:id/history
POST   /api/tasks/:id/dependencies
DELETE /api/tasks/:id/dependencies/:dependsOnId

GET    /api/activity
```

## AI: analisis risiko berbasis Machine Learning (client-side)

Analisis risiko tugas dihitung oleh **model Machine Learning yang berjalan di browser**
(Web Worker). `model_version = ml-mlp-v4`. Tidak ada layanan ML/Python terpisah di VPS;
backend hanya menyiapkan fitur dari database dan menyimpan hasilnya.

Model adalah MLP kecil (`StandardScaler → Dense(ReLU) → Dense(ReLU) → Softmax`) yang
dilatih offline dengan scikit-learn lalu diekspor ke JSON. Pada dataset simulasi 30.000
baris, akurasi uji ≈ **0,912** dan macro-F1 ≈ **0,909**. Probabilitas dikalibrasi dengan
*temperature scaling* agar penjelasan faktor kontribusi tetap informatif. Detail akurasi
selalu tersedia di `GET /api/risk-model` dan panel “Model AI” pada halaman Panduan.

### Alur

1. Backend membangun vektor fitur untuk tiap tugas dari database dan konteks proyek
   (`GET /api/projects/:id/risk-features`) — query SQL ringan, tanpa inferensi.
2. Browser memuat `frontend/public/models/risk-model.json` lalu menjalankan model di
   Web Worker.
3. Hasil (kelas risiko, skor, keyakinan, probabilitas, faktor kontribusi) dikirim kembali
   ke `POST /api/projects/:id/analyze-risk` untuk divalidasi dan disimpan ke
   `risk_assessments`, lalu dipakai untuk prioritas dan tampilan.

### Fitur model (12)

`duration_days`, `progress`, `days_remaining`, `importance`, `dependency_count`,
`unfinished_dependency_count`, `assignee_workload`, `team_size`, `project_complexity`,
`manager_experience`, `historical_risk_score`, `budget_per_task`.

### Keluaran

- `risk_level` (low/medium/high) — kelas dengan probabilitas tertinggi.
- `risk_score` (0–100) — nilai harapan keparahan dari distribusi probabilitas.
- `confidence` — probabilitas kelas terpilih (0–1).
- `probabilities` — peluang tiap tingkat risiko.
- `contributing_factors` — penjelasan tiap tugas via **ablasi fitur**: setiap fitur
  dikembalikan ke nilai rata-rata pelatihan dan diukur pengaruhnya terhadap skor risiko,
  sehingga arah (`up`/`down`) mencerminkan dampak nyata terhadap risiko.
- `recommendation` — saran tindakan berdasarkan faktor dominan.

`predicted_delay_days` tetap dihitung dengan aritmetika sederhana (sisa pekerjaan vs hari
tersisa) dan bukan keluaran model.

### Pelatihan & artefak (offline, tidak di-deploy)

`ml/export_client_model.py` memuat dataset historis bila tersedia (atau dataset simulasi),
melatih MLP, mengevaluasi, lalu menulis:

- `frontend/public/models/risk-model.json` — bobot + metadata (ukurannya kecil);
- `backend/src/services/modelInfo.json` — metadata untuk `GET /api/risk-model`;
- `ml/model-golden.json` — contoh untuk uji parity Python vs JavaScript.

Folder `ml/` **tidak ikut dibangun ke image hosting**. Artefak `.pkl`, CSV, dan file
Python dikecualikan lewat `.gitignore` + `.dockerignore`.

Ingin memakai data nyata? Letakkan `ml/historical_tasks.csv` (12 kolom fitur + kolom
`risk_level`), lalu jalankan exporter. Skrip akan otomatis memakainya dan melaporkannya
di metadata.

> **Catatan kejujuran:** dataset pelatihan bawaan masih **simulasi** untuk demonstrasi.
> Untuk produksi, ganti dengan data historis nyata (mis. apakah tugas terlambat, selisih
> durasi aktual vs estimasi) dan gunakan pemisahan data kronologis.

### Fallback ke aturan (rules-v1)

Bila model client gagal dimuat (mis. aset model tidak tersedia atau browser tidak
mendukung Web Worker), backend otomatis memakai **indikator berbasis aturan**
(`model_version = rules-v1`): kedekatan tenggat, keterlambatan progres, status `blocked`,
prasyarat belum selesai, dan kepentingan tugas. Hasil tetap tersimpan dan analisis
berikutnya kembali memakai model ML saat model berhasil dijalankan.

**Prioritas pekerjaan** tetap dihitung backend dengan rumus berbobot (lihat
`backend/src/services/priority.js`): urgensi 0.4, kepentingan 0.2, risiko 0.3, kapasitas
tim 0.1. Tugas yang prasyaratnya belum selesai diturunkan prioritasnya dengan alasan eksplisit.

## Struktur database

`users`, `projects` (termasuk `budget`), `tasks`, `task_dependencies`,
`task_progress_history`, `risk_assessments` (termasuk `confidence` dan `probabilities`),
`activity_log`, dan `update_history` (histori yang dapat di-revert). Semuanya
`ENGINE=InnoDB` dengan `utf8mb4`. Foreign key, indeks, `CHECK` constraint (peran, status,
rentang progres, anti-dependensi-diri), dan deteksi siklus dependensi diterapkan.
Migrasi MySQL: `001_init.sql`.

## Status fitur

Sudah berfungsi:
- Autentikasi (login/logout, cookie httpOnly), **registrasi mandiri**, dan otorisasi per peran.
- CRUD proyek & tugas, ketergantungan (dengan pencegahan siklus), riwayat progres.
- Dashboard aktual dari database (progres, distribusi status, tenggat dekat, risiko tinggi).
- **Analisis risiko berbasis Machine Learning client-side** (berjalan di Web Worker) dengan
  keyakinan, probabilitas, faktor kontribusi, dan rekomendasi; **fallback otomatis** ke aturan
  bila model client gagal dimuat.
- **Tanpa runtime ML/Python di VPS** — model hanya aset statis, sehingga hemat RAM/CPU dan
  build image lebih cepat.
- Field **anggaran proyek** yang dipakai sebagai fitur model.
- Urutan prioritas beserta alasan dan komponen skor.
- Riwayat aktivitas.
- Manajemen pengguna (admin).
- Halaman frontend: Login, Register, Dashboard (grafik Recharts), Proyek, Detail Proyek (kelola
  tugas & ketergantungan, perbarui progres), Analisis Risiko, Prioritas Pekerjaan, Riwayat
  Aktivitas, Manajemen Pengguna, serta modal Profil Saya.
- Pengguna dapat memperbarui nama dan password sendiri tanpa hak admin.
- Tanpa data demo; akun admin pertama dibuat otomatis (bootstrap) dari environment.
- Auto-refresh realtime (polling) dengan tombol `Live`/`Off` dan waktu pembaruan terakhir.

Belum selesai / batasan:
- Dataset pelatihan model masih **simulasi** (belum memakai data historis nyata).
- Penjelasan faktor memakai metode ablasi sederhana (bukan SHAP).
- Penyesuaian urutan prioritas manual oleh manajer belum disimpan ke server
  (masih hanya tampilan sesi).
- Belum ada fitur impor/ekspor data.
- Belum ada pengujian integrasi otomatis end-to-end (baru unit test aturan).

## Keamanan

- Password di-hash dengan bcrypt.
- Konfigurasi sensitif lewat environment variable; `.env` tidak di-commit.
- Query parameterized (pg) untuk mencegah SQL injection.
- Helmet untuk header keamanan; error tidak membocorkan stack trace ke pengguna.
- Token JWT disimpan di cookie httpOnly (`SameSite=Lax`). Set `COOKIE_SECURE=true`
  dan `NODE_ENV=production` hanya bila aplikasi diakses melalui HTTPS.
