# Sistem Informasi Manajemen Proyek Berbasis AI

Aplikasi web untuk mengelola proyek, tugas, progres, serta menganalisis risiko dan
menentukan prioritas pekerjaan. Frontend dan backend dipisah, database MySQL 8,
dan seluruh layanan dijalankan lewat Docker Compose.

## Arsitektur

```
frontend (React + Vite + Nginx, host port 8090)
        │  /api  (di-proxy Nginx)
        ▼
backend (Bun + Express, host port 3000)
        │                         │
        ▼                         ▼
db (MySQL 8,               ml (FastAPI + scikit-learn,
    host 3307 -> 3306)         host 8001 -> 8000)
```

> Port host dapat diubah lewat `.env` (`FRONTEND_PORT`, `DB_PORT`, `ML_PORT`). Nilai
> default 8090, 3307, dan 8001 dipilih agar tidak bentrok dengan layanan umum.

- **frontend/** — React + Vite + Tailwind CSS v4 + Recharts, dibundel dengan Bun, REST melalui `/api`.
  Antarmuka diberi tema (font Inter, aksen indigo, kartu lembut) dengan sidebar, navbar (jam langsung),
  pencarian global, dan modal. Komponen UI bersama ada di `frontend/src/lib/ui.jsx`.
  Halaman **Panduan & AI** (`/panduan`) menjelaskan cara pakai aplikasi serta cara AI
  menghitung risiko dan prioritas.
  **Realtime**: halaman memperbarui data otomatis (polling) dengan indikator `Live` di navbar
  yang dapat dimatikan; interval bawaan 15 detik.
- **backend/** — Express dijalankan dengan Bun, autentikasi JWT (cookie httpOnly), validasi, otorisasi per peran.
  Driver MySQL memakai `mysql2` (kolom DATE dikembalikan sebagai `YYYY-MM-DD`, DECIMAL sebagai angka).
- **ml/** — layanan Machine Learning: FastAPI + scikit-learn. Model dilatih
  saat build image (`python train_model.py`) dan disajikan lewat HTTP. Kandidat model
  dibandingkan lewat validasi silang (5-fold) dan yang terbaik dipilih otomatis.
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
   - ML health: http://localhost:8001/health

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

Jalankan database (dan opsional layanan ML):
```bash
docker compose up db ml
```
Lalu di `backend/`: `bun install && bun run dev` (butuh MySQL di `localhost:3306`
atau atur variabel `DB_*`; arahkan `ML_SERVICE_URL` ke layanan ML). Di `frontend/`:
`bun install && bun run dev` (proxy `/api` ke `http://localhost:3000`).

Layanan ML dapat dijalankan tanpa Docker (butuh Python 3.12):
```bash
cd ml && pip install -r requirements.txt && python train_model.py
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Perintah penting

| Perintah | Lokasi | Fungsi |
|----------|--------|--------|
| `bun start` | backend | Jalankan server |
| `bun run migrate` | backend | Terapkan migrasi (aman diulang) |
| `bun run seed` | backend | Buat data demo |
| `bun test` | backend | Unit test aturan risiko & prioritas |
| `bun run build` | frontend | Build produksi |
| `python train_model.py` | ml | Latih ulang model risiko (menghasilkan `risk_model.pkl`) |
| `uvicorn app:app --port 8000` | ml | Jalankan layanan prediksi risiko |

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

GET    /api/risk-model            (info model AI/ML yang aktif; fallback bila ML mati)

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
POST   /api/projects/:id/analyze-risk
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

## AI: analisis risiko berbasis Machine Learning (v3)

Analisis risiko tugas kini dihitung oleh **model Machine Learning** yang dilatih dengan
**scikit-learn**, disajikan sebagai layanan terpisah (`ml/`).
`model_version = ml-ens-v3`.

Mesin yang dipakai dipilih otomatis lewat validasi silang (5-fold StratifiedKFold, dipilih
berdasarkan macro-F1). Pada dataset simulasi bawaan, model terbaik adalah **soft-voting
ensemble** dari `HistGradientBoostingClassifier` + `ExtraTreesClassifier`, dengan
**akurasi uji ≈ 0.909** dan **macro-F1 ≈ 0.905**.

### Alur

1. Backend membangun vektor fitur untuk tiap tugas dari database dan konteks proyek.
2. Backend memanggil `POST /predict/batch` di layanan ML (`ML_SERVICE_URL`).
3. Hasil (kelas risiko, skor, keyakinan, probabilitas, faktor kontribusi) disimpan ke
   `risk_assessments` lalu dipakai untuk prioritas dan tampilan.

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

### Pelatihan & artefak

`ml/train_model.py` menghasilkan dataset simulasi (dapat diganti data historis nyata), lalu
membandingkan beberapa kandidat model dengan validasi silang dan memilih yang terbaik
berdasarkan macro-F1. Hasilnya ditulis ke `risk_model.pkl` + `model_meta.json` (daftar
fitur, feature importance, statistik ablasi, akurasi). Model dilatih otomatis saat build
image ML. Pada dataset simulasi (30.000 baris) akurasi uji ≈ 0.909.

Ingin memakai data nyata? Letakkan `ml/historical_tasks.csv` (12 kolom fitur + kolom
`risk_level`) sebelum build; skrip akan otomatis memakainya dan melaporkannya di metadata.

> **Catatan kejujuran:** dataset pelatihan saat ini **simulasi** untuk demonstrasi.
> Untuk produksi, ganti dengan data historis nyata (mis. apakah tugas terlambat, selisih
> durasi aktual vs estimasi) dan gunakan pemisahan data kronologis.

### Fallback ke aturan (rules-v1)

Bila layanan ML tidak tersedia (mis. container mati), backend otomatis memakai
**indikator berbasis aturan** (`model_version = rules-v1`) yang transparan: kedekatan
tenggat, keterlambatan progres, status `blocked`, prasyarat belum selesai, dan
kepentingan tugas. Hasil tetap tersimpan dan akan memakai model AI lagi saat layanan
pulih. `GET /api/risk-model` menandai engine aktif (`ml` atau `rules`).

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
- **Analisis risiko berbasis Machine Learning** dengan keyakinan, probabilitas,
  faktor kontribusi, dan rekomendasi; **fallback otomatis** ke aturan bila layanan ML mati.
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
