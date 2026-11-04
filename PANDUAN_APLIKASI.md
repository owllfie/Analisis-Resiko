# Panduan Aplikasi SIMProyek

Dokumen ini menjelaskan **cara menggunakan website** dan **cara kerja AI/ML** di dalamnya.
Sistem Informasi Manajemen Proyek (SIMProyek) adalah aplikasi web untuk mengelola proyek,
tugas, progres, serta menganalisis risiko dan menentukan prioritas pekerjaan.

---

## 1. Gambaran Singkat

Aplikasi terdiri dari tiga layanan yang dijalankan dengan Docker Compose:

| Layanan | Teknologi | Alamat default | Keterangan |
|---------|-----------|----------------|------------|
| **frontend** | React + Vite + Tailwind + Recharts (Nginx) | http://localhost:8090 | Antarmuka web + model ML client-side |
| **backend** | Bun + Express | http://localhost:3000/api | REST API, autentikasi, otorisasi |
| **db** | MySQL 8 | localhost:3307 | Basis data |

Model Machine Learning **tidak** dijalankan sebagai layanan terpisah. Model diunduh
sebagai aset statis dan dieksekusi di browser (Web Worker), sehingga VPS tidak perlu
Python/scikit-learn.

Port bisa diubah lewat `.env` (`FRONTEND_PORT`, `DB_PORT`).

---

## 2. Menjalankan & Masuk

### 2.1 Menjalankan aplikasi

```bash
# (opsional) siapkan konfigurasi
cp .env.example .env

# bangun & jalankan semua layanan
docker compose up --build
```

Buka **http://localhost:8090**.

- Health backend: http://localhost:3000/api/health

Untuk menghentikan: `docker compose down` (tambah `-v` bila ingin menghapus database juga).

### 2.2 Akun pertama (bootstrap)

Saat database masih kosong, backend otomatis membuat satu akun **superadmin**:

| Field | Nilai bawaan |
|-------|--------------|
| Email | `admin@gmail.com` |
| Password | `Admin123!` |

> Ganti `ADMIN_PASSWORD` di `.env` sebelum dipakai sungguhan.
> Pengguna lain bisa **mendaftar sendiri** lewat halaman **Register** (selalu berperan
> `member`), atau dibuat oleh admin di halaman **Manajemen Pengguna**.

### 2.3 Data contoh (opsional, pengembangan)

Jalankan generator data contoh:

```bash
docker exec -w /app simproyek_backend bun src/db/dummy.js
```

Menghasilkan belasan akun anggota dengan **nama asli** (mis. `budi.santoso@gmail.com`)
beserta proyek & tugas yang realistis. Password akun contoh: `Member123!`.
Generator bersifat idempoten (aman dijalankan berulang) dan melewati data yang sudah ada.

---

## 3. Peran & Hak Akses

Otorisasi divalidasi di **backend** (bukan hanya menyembunyikan menu di UI).

| Peran | Ringkasan hak akses |
|-------|---------------------|
| **superadmin** | Akses penuh. Otomatis lolos semua pemeriksaan otorisasi. |
| **admin** | Kelola pengguna & peran, kelola semua proyek/tugas, memicu analisis risiko. |
| **manager** | Kelola proyek & tugas **miliknya**, memicu analisis, melihat prioritas, melihat daftar pengguna. |
| **member** | Hanya melihat proyek yang memuat tugasnya, serta memperbarui status/progres/durasi aktual/catatan pada **tugasnya sendiri**. |

Menu **Administrasi** disaring sesuai peran:

| Halaman | superadmin | admin | manager | member |
|---------|:---:|:---:|:---:|:---:|
| Manajemen Pengguna | ✅ | ✅ | — | — |
| Sampah (Trash) | ✅ | ✅ | — | — |
| Histori Update | ✅ | ✅ | ✅ | — |
| Riwayat Aktivitas | ✅ | ✅ | ✅ | ✅ |

---

## 4. Cara Menggunakan Website

Navigasi dikelompokkan menjadi **Utama**, **Manajemen**, dan **Administrasi** pada sidebar.

### 4.1 Login / Register
- Masukkan email & password di halaman **Login**.
- Belum punya akun? Buat lewat **Register** (otomatis masuk sebagai `member`).
- Sesi disimpan pada cookie httpOnly (aman dari akses JavaScript).

### 4.2 Dashboard (`/`)
Ringkasan kondisi seluruh proyek:

- **Kartu statistik**: Proyek Aktif, Total Tugas, jumlah tugas selesai, dsb.
- **Grafik**: distribusi status tugas (To Do / Dikerjakan / Terhambat / Selesai) dan
  distribusi tingkat risiko.
- Daftar tenggat terdekat dan daftar tugas berisiko tinggi.
- Menampilkan **engine AI yang aktif** (ML atau fallback aturan).

### 4.3 Proyek

Halaman **Proyek** menampilkan daftar proyek (nama, manajer, progres, jumlah tugas).

- **Tambah / Ubah** proyek (admin/manager) — termasuk nama, deskripsi, tanggal mulai,
  tenggat, status (`Aktif`/`Selesai`/`Diarsipkan`), **anggaran proyek**, dan penunjukan manajer.
- **Hapus** memindahkan proyek ke **Sampah** (soft delete) — bisa dipulihkan.
- **Arsipkan** mengubah status menjadi `archived` tanpa menghapus.
- Pencarian dan filter status tersedia di atas tabel.

### 4.4 Detail Proyek

Menampilkan informasi proyek, daftar **tugas**, dan **ketergantungan antar-tugas**:

- Tambah/ubah tugas (judul, deskripsi, penanggung jawab, status, progres, durasi estimasi
  & aktual, tanggal, tingkat kepentingan).
- Atur **prasyarat** (dependency). Sistem mencegah **siklus** ketergantungan.
- Perbarui progres/status/catatan tugas (tiap perubahan tercatat di riwayat progres tugas).

### 4.5 Analisis Risiko

1. Pilih proyek pada dropdown.
2. Klik **Jalankan Analisis** (admin/manager). Browser mengambil vektor fitur dari backend lalu
   menjalankan model ML secara lokal.
3. Lihat hasilnya:
   - **Stat cards**: total tugas dianalisis, jumlah risiko tinggi/sedang, skor tertinggi.
   - **Grafik komposisi** risiko (rendah/sedang/tinggi).
   - **Tabel indikator** berisi tingkat risiko, skor (0–100), **keyakinan model**, dan
     **perkiraan keterlambatan**.
   - Klik satu baris untuk **membentangkan** detail: **faktor penyebab**, **probabilitas tiap
     tingkat** (bar), dan **rekomendasi** tindakan.
   - Banner di atas menandai mode yang dipakai: **ML client-side** (`ml-mlp-v4`) atau
     **fallback aturan** (`rules-v1`) bila model browser gagal dimuat.

### 4.6 Prioritas Pekerjaan

Menampilkan urutan tugas yang disarankan beserta **alasan** dan **komponen skor**
(Urgensi, Kepentingan, Risiko, Kapasitas). Tugas yang prasyaratnya belum selesai otomatis
diturunkan prioritasnya dengan penjelasan eksplisit.

### 4.7 Riwayat Aktivitas

Catatan perubahan data & analisis (create/update/delete/archive/restore) dengan filter
jenis (proyek/tugas/pengguna).

### 4.8 Manajemen Pengguna (admin/superadmin)

- Daftar pengguna + filter peran.
- **Tambah/Ubah/Hapus** pengguna, termasuk menetapkan peran (`superadmin`, `admin`,
  `manager`, `member`).
- Menghapus pengguna memindahkannya ke **Sampah** (tidak dapat menghapus akun sendiri).

### 4.9 Sampah / Trash (admin/superadmin)

Daftar item yang telah dihapus (soft delete) dari proyek, tugas, dan pengguna.
Tombol **Pulihkan** mengembalikan item ke keadaan aktif.

### 4.10 Histori Update

Daftar perubahan yang terekam pada `update_history`. Baris dengan aksi `update` dapat
di-**Revert** oleh admin/superadmin.

> Lihat bagian **Catatan & Batasan** mengenai status pengisian histori ini.

### 4.11 Profil Saya

Klik nama pengguna di kiri bawah sidebar → **Profil Saya**. Di sini pengguna dapat
memperbarui **nama** dan **password sendiri** (mengubah password wajib mengisi password saat ini).

### 4.12 Realtime (Live)

Halaman memperbarui data otomatis (polling bawaan **15 detik**). Indikator **Live/Off** di
navbar dapat dinyalakan/dimatikan, beserta waktu pembaruan terakhir.

---

## 5. Cara Kerja AI/ML

Analisis risiko tugas dihitung oleh **model Machine Learning yang berjalan di browser**
(Web Worker). Versi model: **`ml-mlp-v4`** — MLP kecil
(`StandardScaler → Dense(ReLU) → Dense(ReLU) → Softmax`) yang dilatih offline dengan
scikit-learn lalu diekspor ke JSON. Pada dataset simulasi 30.000 baris, akurasi uji
≈ **0,912** dan macro-F1 ≈ **0,909**. Probabilitas dikalibrasi dengan *temperature scaling*
agar penjelasan faktor kontribusi tetap informatif. Detail akurasi dapat dilihat lewat
`GET /api/risk-model` dan panel **Model AI** di halaman **Panduan & AI**.

> Yang berjalan di VPS hanya backend/database. Tidak ada Python, scikit-learn, `.pkl`,
> atau data pelatihan yang ikut ke hosting.

### 5.1 Arsitektur AI

```
Pengguna klik "Jalankan Analisis"
        │
        ▼
backend (Bun/Express)
  ├─ baca tugas + konteks proyek dari MySQL
  ├─ bangun vektor 12 fitur untuk tiap tugas
  └─ kirim fitur ke browser (GET /risk-features)
        │
        ▼
browser
  ├─ muat models/risk-model.json (aset statis)
  ├─ jalankan MLP + ablasi di Web Worker
  └─ POST hasil prediksi ke backend
        │
        ▼
backend
  ├─ validasi hasil, simpan ke risk_assessments
  └─ kirim ke frontend untuk ditampilkan
```

Jika model client **gagal dimuat/dijalankan**, backend otomatis memakai **fallback berbasis
aturan** (`rules-v1`) sehingga aplikasi tetap berjalan.

### 5.2 Alur Prediksi (ringkas)

1. Backend menyusun **vektor fitur** tiap tugas dari database + konteks proyek.
2. Browser memuat model JSON statis dan menjalankan inferensi di Web Worker.
3. Browser mengirim kelas risiko, skor, keyakinan, probabilitas, dan faktor kontribusi.
4. Backend memvalidasi, menyimpan ke `risk_assessments`, lalu hasil dipakai untuk halaman
   Analisis Risiko & Prioritas.

### 5.3 Dua Belas Fitur Model

| Fitur | Arti | Sumber nilai |
|-------|------|--------------|
| `duration_days` | Durasi rencana tugas (hari) | `due_date − start_date`, atau `estimated_duration`, default 7 |
| `progress` | Progres tugas (%) | Kolom `progress` |
| `days_remaining` | Sisa hari menuju tenggat | `due_date − sekarang`, default 30 |
| `importance` | Tingkat kepentingan | Pemetaan `low=0, medium=1, high=2` |
| `dependency_count` | Jumlah tugas prasyarat | Tabel `task_dependencies` |
| `unfinished_dependency_count` | Prasyarat yang belum selesai | Prasyarat berstatus ≠ `completed` |
| `assignee_workload` | Beban kerja penanggung jawab | Jumlah tugas aktif orang tsb (semua proyek) |
| `team_size` | Ukuran tim proyek | Jumlah penanggung jawab unik di proyek |
| `project_complexity` | Kompleksitas proyek | Jumlah tugas dalam proyek |
| `manager_experience` | Pengalaman manajer | Jumlah proyek yang dikelola manajer tsb |
| `historical_risk_score` | Riwayat skor risiko | Rata-rata skor analisis terakhir per tugas di proyek |
| `budget_per_task` | Anggaran per tugas | `budget proyek ÷ jumlah tugas` |

### 5.4 Keluaran Model

- **`risk_level`** — kelas dengan probabilitas tertinggi (`low` / `medium` / `high`).
- **`risk_score`** (0–100) — nilai harapan keparahan dari distribusi probabilitas, dengan bobot
  keparahan `low=12`, `medium=50`, `high=90`.
- **`confidence`** — probabilitas kelas terpilih (0–1); ditampilkan sebagai persen.
- **`probabilities`** — peluang tiap tingkat risiko (ditampilkan sebagai bar).
- **`contributing_factors`** — penjelasan per tugas via **ablasi fitur**, dijelaskan di bawah.
- **`recommendation`** — saran tindakan berdasarkan faktor dominan.

> `predicted_delay_days` (perkiraan keterlambatan) **bukan** keluaran model, melainkan
> aritmetika sederhana: *sisa pekerjaan* (`(100−progress)% × estimasi`) vs *hari tersedia*.

### 5.5 Bagaimana Faktor Penyebab Dihitung (Ablasi Fitur)

Model MLP bersifat "kotak hitam", jadi penjelasannya memakai **ablasi (occlusion)**:

1. Untuk satu tugas, hitung **skor dasar** dari nilai fitur aslinya.
2. Untuk **tiap fitur**, ganti nilai fitur itu dengan **rata-rata data pelatihan**, lalu hitung
   ulang skor.
3. **Kontribusi = skor dasar − skor setelah fitur diablasi.**
   - Kontribusi **positif** → fitur **menaikkan** risiko (`direction: up`).
   - Kontribusi **negatif** → fitur **menurunkan** risiko (`direction: down`).
4. Ambil **6 fitur** dengan kontribusi absolut terbesar sebagai faktor utama, lalu
   terjemahkan menjadi rekomendasi.

### 5.6 Pelatihan & Artefak Model (offline)

`ml/export_client_model.py` dijalankan **di mesin pengembang/CI**, bukan di VPS:

- Membuat/memuat dataset (simulasi 30.000 baris, atau `ml/historical_tasks.csv` bila ada).
- Melatih MLP ringan dan mengevaluasi pada split 80% latih / 20% uji (stratified).
- Menghitung *permutation importance* untuk metadata.
- Menulis artefak:
  - `frontend/public/models/risk-model.json` — bobot + metadata (kecil, untuk browser);
  - `backend/src/services/modelInfo.json` — metadata untuk `GET /api/risk-model`;
  - `ml/model-golden.json` — contoh uji parity Python vs JavaScript.

Verifikasi parity dari folder `frontend/`:

```bash
bun run test:model
```

> Artefak `.pkl`, CSV, dan file Python tidak ikut di-commit/deploy. Folder `ml/` hanya
> untuk training offline.

### 5.7 Fallback ke Aturan (`rules-v1`)

Bila model browser gagal dimuat/dijalankan, backend memakai indikator aturan yang
transparan. Komponen skor:

| Kondisi | Tambahan skor |
|---------|---------------|
| Tenggat sudah lewat | +45 |
| Tenggat ≤ 2 hari | +30 |
| Tenggat ≤ 5 hari | +18 |
| Tenggat ≤ 10 hari | +8 |
| Progres tertinggal (selisih ≥ 40/25/15/5%) | +30/+22/+12/+5 |
| Status `blocked` | +25 |
| Prasyarat belum selesai | +12 |
| Kepentingan tinggi / sedang | +10 / +4 |

Tingkat risiko dari skor: `<35` = rendah, `<65` = sedang, selebihnya tinggi. Tugas `completed`
selalu dinilai **rendah**. Hasil tetap tersimpan dan analisis berikutnya otomatis memakai
model ML lagi saat model berhasil dimuat/dijalankan.

### 5.8 Prioritas Pekerjaan (bukan ML)

Prioritas dihitung backend dengan rumus berbobot (`backend/src/services/priority.js`):

```
prioritas = 100 × (0.4·urgensi + 0.2·kepentingan + 0.3·risiko + 0.1·kapasitas)
jika prasyarat belum selesai → prioritas × 0.4
tugas completed → prioritas = 0
```

Bobot dapat dikonfigurasi. **Skor prioritas ≠ skor risiko.**

### 5.9 Mengganti dengan Data Historis Nyata (produksi)

Dataset pelatihan saat ini **simulasi** untuk demonstrasi. Untuk produksi:

1. Siapkan data historis tugas (mis. apakah tugas terlambat, selisih durasi aktual vs estimasi,
   skor risiko periode sebelumnya) dalam bentuk tabel dengan kolom sesuai `FEATURE_NAMES`.
2. Ubah `generate_dataset()` di `ml/train_model.py` agar membaca data nyata tersebut
   (jangan lupa **urutan fitur** harus sama — lihat `ml/FEATURES.py`).
3. Latih ulang: `python train_model.py` lalu **rebuild** image ML (`docker compose build ml`).
4. Untuk keandalan, gunakan pemisahan data **kronologis** (bukan acak) dan pantau akurasi.

---

## 6. Catatan & Batasan

- Dataset pelatihan model masih **simulasi**; ganti dengan data nyata untuk produksi.
- Penjelasan faktor memakai **ablasi sederhana**, bukan SHAP.
- **Histori Update** (`update_history`): tabel, endpoint daftar, dan aksi *revert* sudah ada,
  tetapi operasi CRUD aplikasi belum otomatis menulis baris ke tabel ini, sehingga halaman
  bisa tampak kosong kecuali ada baris yang terisi. Aksi *revert* saat ini menandai baris
  sebagai *reverted* (bukan memulihkan snapshot penuh).
- Penyesuaian urutan prioritas manual oleh manajer belum disimpan ke server (hanya sesi tampilan).
- Belum ada fitur impor/ekspor data dan pengujian integrasi end-to-end otomatis.

## 7. Pemecahan Masalah Singkat

| Gejala | Kemungkinan penyebab & solusi |
|--------|-------------------------------|
| Banner menulis "fallback aturan" | Model client gagal dimuat. Pastikan `frontend/public/models/risk-model.json` ada dan ikut ter-build, lalu hard refresh browser. |
| Halaman kosong setelah ubah kode frontend | Rebuild: `docker compose up -d --build frontend`, lalu hard refresh browser. |
| Port bentrok | Ubah `FRONTEND_PORT` / `DB_PORT` di `.env`. |
| Tidak bisa login akun bootstrap | Pastikan database masih kosong saat pertama start, atau buat pengguna via admin. |
