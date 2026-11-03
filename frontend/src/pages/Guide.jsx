import { useApiGet } from '../api/useApi.js';
import {
  Card, Badge, Notice, ProgressBar,
  IconBook, IconRisk, IconPriority, IconSpark, IconCpu, IconArrowUp, IconArrowDown,
} from '../lib/ui.jsx';

/* ------------------------------------------------------------------ */
/* Data statis — harus akurat terhadap implementasi backend & ML       */
/* ------------------------------------------------------------------ */

const TOC = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'cara-menggunakan', label: 'Cara Menggunakan' },
  { id: 'risiko-ai', label: 'AI: Perhitungan Risiko' },
  { id: 'prioritas-ai', label: 'AI: Perhitungan Prioritas' },
  { id: 'faq', label: 'FAQ & Tips' },
];

// 12 fitur model (ml/FEATURES.py) + label Indonesia + sinyal "buruk".
const FEATURES = [
  ['duration_days', 'Durasi rencana tugas', 'Durasi panjang meningkatkan ketidakpastian penyelesaian.'],
  ['progress', 'Progres tugas', 'Progres rendah meski waktu terus berjalan.'],
  ['days_remaining', 'Sisa hari menuju tenggat', 'Negatif (tenggat terlewat) atau mendekati nol.'],
  ['importance', 'Tingkat kepentingan', 'Nilai 2 = tinggi, 1 = sedang, 0 = rendah.'],
  ['dependency_count', 'Jumlah tugas prasyarat', 'Banyak prasyarat membuat urutan kerja rumit.'],
  ['unfinished_dependency_count', 'Prasyarat belum selesai', 'Lebih dari 0 — tugas belum dapat dikerjakan penuh.'],
  ['assignee_workload', 'Beban kerja penanggung jawab', 'Banyak tugas aktif menumpuk pada satu orang.'],
  ['team_size', 'Ukuran tim', 'Tim kecil relatif terhadap beban kerja proyek.'],
  ['project_complexity', 'Kompleksitas proyek', 'Jumlah tugas proyek yang banyak.'],
  ['manager_experience', 'Pengalaman manajer', 'Manajer belum banyak menangani proyek sebelumnya.'],
  ['historical_risk_score', 'Riwayat skor risiko', 'Rata-rata skor risiko terakhir tugas proyek tinggi.'],
  ['budget_per_task', 'Anggaran per tugas', 'Anggaran proyek ketat bila dibagi per tugas.'],
];

// Poin aturan fallback (backend/src/services/risk.js).
const RULES = [
  ['Tenggat sudah terlewat', '+45'],
  ['Tenggat tersisa ≤ 2 hari', '+30'],
  ['Tenggat tersisa ≤ 5 hari', '+18'],
  ['Tenggat tersisa ≤ 10 hari', '+8'],
  ['Progres tertinggal ≥ 40% dari rencana', '+30'],
  ['Progres tertinggal ≥ 25% dari rencana', '+22'],
  ['Progres tertinggal ≥ 15% dari rencana', '+12'],
  ['Progres tertinggal ≥ 5% dari rencana', '+5'],
  ['Tugas berstatus terhambat (blocked)', '+25'],
  ['Ada prasyarat yang belum selesai', '+12'],
  ['Kepentingan tinggi / sedang', '+10 / +4'],
];

// Pita skor urgensi (backend/src/services/priority.js).
const URGENCY_BANDS = [
  ['Tenggat sudah terlewat', '100'],
  ['Sisa ≤ 2 hari', '85'],
  ['Sisa ≤ 5 hari', '65'],
  ['Sisa ≤ 10 hari', '45'],
  ['Sisa ≤ 20 hari', '25'],
  ['Sisa > 20 hari', '10'],
  ['Tanpa tenggat', '20'],
];

const CAPACITY_BANDS = [
  ['≤ 1 tugas aktif', '100'],
  ['2 tugas aktif', '80'],
  ['3 tugas aktif', '55'],
  ['4 tugas aktif', '35'],
  ['≥ 5 tugas aktif', '20'],
];

const FAQS = [
  {
    q: 'Kenapa tugas yang berisiko tinggi justru tampil dengan prioritas rendah?',
    a: 'Kemungkinan besar tugas tersebut masih menunggu prasyarat yang belum selesai. Sistem melipatgandakan skor prioritasnya dengan 0,4 dan menambahkan alasan "Belum dapat dimulai sepenuhnya" pada daftar prioritas, agar tim fokus pada tugas yang benar-benar bisa dikerjakan sekarang. Begitu prasyaratnya selesai, prioritasnya naik otomatis pada analisis berikutnya.',
  },
  {
    q: 'Apa arti "keyakinan" (confidence) pada hasil analisis?',
    a: 'Keyakinan adalah probabilitas kelas terpilih — misalnya 0,65 berarti model 65% yakin tugas berada pada tingkat risiko tersebut. Keyakinan rendah berarti ciri-ciri tugas berada di wilayah abu-abu antar kelas; perlakukan hasilnya sebagai sinyal untuk ditinjau manusia, bukan keputusan mutlak.',
  },
  {
    q: 'Apakah model sudah dilatih dengan data proyek sungguhan?',
    a: 'Belum. Saat ini model dilatih dengan dataset simulasi untuk demonstrasi (dapat dilihat pada panel info model di atas — sumber data "Simulasi"). Akurasi uji ±81% dihasilkan pada data simulasi tersebut dan bukan jaminan performa pada data nyata. Untuk penggunaan produksi, model harus dilatih ulang dengan data historis nyata (misalnya apakah tugas benar-benar terlambat).',
  },
  {
    q: 'Kenapa versi model pada hasil analisis bisa berbeda-beda (ml-rf-v2 vs rules-v1)?',
    a: 'Ketika layanan Machine Learning aktif, hasil memakai model ml-rf-v2. Bila layanan ML sedang tidak tersedia, backend otomatis memakai fallback aturan rules-v1 — hasil tetap tersimpan dan analisis berikutnya akan kembali memakai model ML begitu layanan pulih. Anda dapat melihat engine yang aktif melalui endpoint GET /api/risk-model atau panel info model pada halaman Analisis Risiko dan Dashboard.',
  },
  {
    q: 'Apakah "perkiraan keterlambatan" (predicted_delay_days) keluaran model AI?',
    a: 'Bukan. Angka itu dihitung dengan aritmetika sederhana: sisa pekerjaan ((100 − progres) × durasi estimasi) dikurangi waktu yang tersisa sampai tenggat. Jika hasilnya positif, tugas diperkirakan terlambat sejumlah hari itu. Nilai ini muncul di kedua engine (ML maupun aturan).',
  },
  {
    q: 'Siapa yang dapat menjalankan Analisis Risiko?',
    a: 'Admin dan manager. Member tetap dapat melihat hasil analisis serta urutan prioritas sebagai panduan kerja. Setiap kali analisis dijalankan, hasilnya tersimpan sehingga Anda dapat memantau perubahan risiko antar waktu.',
  },
  {
    q: 'Seberapa sering data di halaman diperbarui?',
    a: 'Saat indikator Live aktif di navbar, halaman menyegarkan data secara otomatis setiap 15 detik. Klik tombol Live/Off untuk mematikan atau mengaktifkannya kembali, dan gunakan tombol muat ulang untuk menyegarkan sekali.',
  },
];

/* ------------------------------------------------------------------ */
/* Komponen bantu tampilan                                             */
/* ------------------------------------------------------------------ */

function Section({ id, icon: Icon, title, subtitle, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function StepList({ items }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={it.t} className="flex gap-3">
          <span className="mt-0.5 w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <div className="text-sm text-gray-600 leading-relaxed">
            <span className="font-semibold text-gray-800">{it.t}</span>
            {it.d && <> — {it.d}</>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Formula({ children }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3.5 text-center text-sm font-semibold text-indigo-900 leading-relaxed">
      {children}
    </div>
  );
}

function DataTable({ head, rows, monoFirst = false }) {
  return (
    <div className="table-scroll">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            {head.map((h) => (
              <th key={h} className="py-2.5 pr-4 font-semibold text-xs uppercase tracking-wider text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r[0] + i} className="border-b border-gray-50 last:border-0">
              <td className={`py-2.5 pr-4 text-gray-800 ${monoFirst ? 'font-semibold text-indigo-700 text-xs' : 'font-medium'}`}>{r[0]}</td>
              <td className="py-2.5 pr-4 text-gray-500">{r[1]}</td>
              {r[2] != null && <td className="py-2.5 text-gray-500">{r[2]}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }) {
  return <code className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{children}</code>;
}

/* ------------------------------------------------------------------ */
/* Panel model live (dinamis) dengan fallback statis                   */
/* ------------------------------------------------------------------ */

function LiveModelPanel() {
  const { data } = useApiGet('/risk-model', []);
  const model = data?.data;
  const isMl = Boolean(model?.available && model.engine === 'ml');

  if (!isMl) {
    return (
      <Notice tone="warn">
        <span className="font-semibold">Info model live tidak tersedia.</span>{' '}
        Saat ini sistem memakai fallback aturan <b>rules-v1</b> (lihat bagian Fallback di bawah), atau permintaan
        info model gagal. Penjelasan pada halaman ini tetap berlaku untuk kedua engine.
      </Notice>
    );
  }

  const labels = model.feature_labels || {};
  const names = model.feature_names || [];
  const importances = model.feature_importances || [];
  const ranked = names
    .map((name, i) => ({ name, label: labels[name] || name, value: Number(importances[i]) || 0 }))
    .filter((f) => f.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const total = (names.map((_, i) => Number(importances[i]) || 0).reduce((s, v) => s + v, 0)) || 1;
  const acc = model.metrics?.accuracy;
  const ds = model.dataset || {};

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <IconCpu className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-gray-900">Model AI yang sedang aktif</div>
            <div className="text-xs text-gray-400">Data langsung dari GET /api/risk-model</div>
          </div>
        </div>
        <Badge tone="bg-green-50 text-green-700">ML aktif</Badge>
      </div>

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          ['Versi model', model.model_version],
          ['Algoritma', model.algorithm],
          ['Akurasi uji', acc != null ? `${(acc * 100).toFixed(1)}%` : '—'],
          ['Sumber data', `${ds.type === 'historical' ? 'Data historis' : 'Simulasi'}${ds.n_samples ? ` · ${ds.n_samples.toLocaleString('id-ID')} sampel` : ''}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{k}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-gray-800">{v || '—'}</dd>
          </div>
        ))}
      </dl>

      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Fitur paling berpengaruh terhadap keputusan model
      </div>
      <ul className="space-y-2.5">
        {ranked.map((f) => (
          <li key={f.name} className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-52 sm:w-60 shrink-0 truncate" title={f.label}>{f.label}</span>
            <ProgressBar value={(f.value / total) * 100} className="flex-1" />
            <span className="text-xs font-semibold text-gray-500 w-14 text-right tabular-nums">
              {((f.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                              */
/* ------------------------------------------------------------------ */

export default function Guide() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 text-white p-7 sm:p-10 animate-fade-in">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.15]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)', backgroundSize: '22px 22px' }}
        />
        <div aria-hidden="true" className="absolute -top-24 -right-16 w-96 h-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative">
          <Badge tone="bg-white/15 text-white">Panduan Pengguna</Badge>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
            Panduan SIMProyek &amp; Cara Kerja AI
          </h1>
          <p className="mt-3 text-indigo-100 max-w-2xl leading-relaxed">
            Halaman ini menjelaskan cara memakai aplikasi dan, secara spesifik, bagaimana sistem
            menghitung indikator risiko serta urutan prioritas pekerjaan — lengkap dengan rumus,
            ambang nilai, dan contoh perhitungannya.
          </p>

          <div className="mt-7 grid sm:grid-cols-2 gap-3 max-w-2xl">
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3.5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <IconRisk className="w-4 h-4" /> Risiko per Tugas
              </div>
              <p className="mt-1 text-xs text-indigo-100 leading-relaxed">
                Skor 0–100, tingkat risiko (rendah/sedang/tinggi), keyakinan model, dan faktor penyebab tiap tugas.
              </p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3.5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <IconPriority className="w-4 h-4" /> Urutan Prioritas
              </div>
              <p className="mt-1 text-xs text-indigo-100 leading-relaxed">
                Peringkat tugas yang disarankan beserta komponen skor (urgensi, kepentingan, risiko, kapasitas) dan alasan.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Daftar isi */}
      <nav aria-label="Daftar isi" className="flex flex-wrap gap-2">
        {TOC.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50 transition"
          >
            {t.label}
          </a>
        ))}
      </nav>

      {/* 1. Ringkasan */}
      <Section id="ringkasan" icon={IconSpark} title="Ringkasan Singkat" subtitle="Apa yang dilakukan aplikasi ini">
        <Card>
          <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
            <p>
              <b className="text-gray-800">SIMProyek</b> adalah sistem informasi manajemen proyek berbasis AI:
              tim mengelola proyek, tugas, ketergantungan antar-tugas, dan progres pengerjaan — sementara
              sistem AI membantu menjawab dua pertanyaan penting:
            </p>
            <ol className="space-y-2.5">
              <li className="flex gap-3">
                <span className="mt-0.5 w-6 h-6 rounded-full bg-red-50 text-red-600 text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <span>
                  <b className="text-gray-800">Tugas mana yang berisiko?</b> Setiap tugas mendapat skor risiko
                  0–100, tingkat risiko (rendah / sedang / tinggi), tingkat keyakinan model, faktor penyebab,
                  dan rekomendasi tindakan.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <span>
                  <b className="text-gray-800">Apa yang harus dikerjakan lebih dulu?</b> Seluruh tugas diurutkan
                  menjadi satu daftar prioritas berdasarkan bobot urgensi (40%), kepentingan (20%), risiko (30%),
                  dan kapasitas tim (10%) — lengkap dengan alasan tiap peringkat.
                </span>
              </li>
            </ol>
            <p>
              Hasil analisis tersimpan sehingga dapat dipantau perubahannya dari waktu ke waktu, dan dapat
              dilihat semua pengguna pada halaman <b className="text-gray-800">Analisis Risiko</b> serta{' '}
              <b className="text-gray-800">Prioritas Pekerjaan</b>.
            </p>
          </div>
        </Card>
      </Section>

      {/* 2. Cara Menggunakan */}
      <Section id="cara-menggunakan" icon={IconBook} title="Cara Menggunakan" subtitle="Langkah kerja per peran">
        <Card>
          <h3 className="font-bold text-gray-900 mb-3">Dasar untuk semua pengguna</h3>
          <StepList
            items={[
              { t: 'Masuk atau daftar', d: 'akun baru yang didaftarkan mandiri selalu berperan "member". Akun administrator pertama dibuat otomatis oleh sistem saat database masih kosong.' },
              { t: 'Baca Dashboard', d: 'ringkasan progres proyek, distribusi status tugas, tenggat terdekat, dan tugas berisiko tinggi — termasuk versi model AI yang sedang aktif.' },
              { t: 'Gunakan navigasi & pencarian', d: 'sidebar untuk berpindah halaman, kotak pencarian di navbar untuk menemukan proyek/tugas, dan tombol Live untuk menyalakan/mematikan penyegaran otomatis (tiap 15 detik).' },
              { t: 'Kelola akun Anda', d: 'ubah nama dan password melalui menu "Profil Saya" di sidebar, tanpa perlu bantuan administrator.' },
            ]}
          />
        </Card>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card>
            <div className="mb-4">
              <Badge tone="bg-indigo-50 text-indigo-700">Manager</Badge>
              <h3 className="font-bold text-gray-900 mt-2">Mengelola proyek & analisis</h3>
            </div>
            <StepList
              items={[
                { t: 'Buat proyek', d: 'di halaman Proyek — isi nama, deskripsi, penanggung jawab, tenggat, dan anggaran (anggaran ikut menjadi fitur AI).' },
                { t: 'Tambahkan tugas', d: 'di Detail Proyek — tentukan judul, penanggung jawab, tingkat kepentingan, tanggal mulai/akhir, dan durasi estimasi.' },
                { t: 'Atur ketergantungan', d: 'buka detail lalu tambahkan tugas prasyarat; sistem menolak ketergantungan yang membentuk siklus.' },
                { t: 'Jalankan Analisis Risiko', d: 'pilih proyek lalu klik "Jalankan Analisis" — hasil risiko tiap tugas langsung tersimpan.' },
                { t: 'Tinjau Prioritas Pekerjaan', d: 'ikuti urutan kerja yang disarankan, beserta komponen skor dan alasannya.' },
                { t: 'Audit perubahan', d: 'pantau Riwayat Aktivitas dan Histori Update untuk melacak siapa mengubah apa.' },
              ]}
            />
          </Card>

          <Card>
            <div className="mb-4">
              <Badge tone="bg-green-50 text-green-700">Member</Badge>
              <h3 className="font-bold text-gray-900 mt-2">Mengerjakan tugas Anda</h3>
            </div>
            <StepList
              items={[
                { t: 'Buka proyek Anda', d: 'daftar proyek hanya menampilkan proyek yang memuat tugas Anda.' },
                { t: 'Kelola tugas Anda', d: 'klik "Kelola" pada tugas yang menjadi tanggung jawab Anda.' },
                { t: 'Perbarui progres', d: 'ubah status (todo / dikerjakan / selesai / terhambat), persentase progres, durasi aktual, dan catatan — hanya pada tugas Anda sendiri.' },
                { t: 'Pantau riwayat progres', d: 'setiap perubahan tersimpan dan dapat ditinjau kembali sebagai jejak histori.' },
                { t: 'Ikuti hasil analisis', d: 'lihat halaman Analisis Risiko dan Prioritas Pekerjaan sebagai panduan urutan kerja Anda.' },
              ]}
            />
          </Card>

          <Card>
            <div className="mb-4">
              <Badge tone="bg-amber-50 text-amber-700">Admin</Badge>
              <h3 className="font-bold text-gray-900 mt-2">Mengelola pengguna & sistem</h3>
            </div>
            <StepList
              items={[
                { t: 'Kelola akun & peran', d: 'di Manajemen Pengguna — buat akun baru, ubah peran (member ↔ manager), dan sesuaikan akses.' },
                { t: 'Lihat matriks hak akses', d: 'di Matriks Hak Akses — bandingkan izin tiap peran terhadap seluruh fitur aplikasi.' },
                { t: 'Seluruh kewenangan manager', d: 'admin dapat membuat proyek, tugas, dan menjalankan analisis seperti manager.' },
                { t: 'Pulihkan data terhapus', d: 'di Sampah — kembalikan data yang terhapus, atau hapus permanen bila sudah tidak diperlukan.' },
                { t: 'Awasi aktivitas', d: 'Riwayat Aktivitas dan Histori Update menampilkan seluruh jejak perubahan data.' },
              ]}
            />
          </Card>
        </div>
      </Section>

      {/* 3. Risiko AI */}
      <Section id="risiko-ai" icon={IconRisk} title="Bagaimana AI Menghitung Risiko" subtitle="Dari data tugas menjadi skor 0–100">
        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Alur pemrosesan (pipeline)</h3>
          <p className="text-sm text-gray-500 mb-4">
            Setiap kali Anda menekan &ldquo;Jalankan Analisis&rdquo;, backend menjalankan empat langkah berikut
            untuk seluruh tugas dalam proyek:
          </p>
          <StepList
            items={[
              { t: 'Membangun vektor fitur', d: 'untuk tiap tugas yang belum selesai, backend menghitung 12 fitur dari data tugas dan konteks proyek (tabel di bawah).' },
              { t: 'Klasifikasi probabilistik', d: 'vektor dikirim ke layanan Machine Learning; model RandomForest (scikit-learn) menghitung probabilitas tiga kelas: rendah, sedang, dan tinggi.' },
              { t: 'Skor keparahan 0–100', d: 'skor = 12 × P(rendah) + 50 × P(sedang) + 90 × P(tinggi) — yaitu nilai harapan keparahan dari distribusi probabilitas.' },
              { t: 'Tingkat risiko & keyakinan', d: 'tingkat = kelas dengan probabilitas tertinggi; keyakinan (confidence) = probabilitas kelas tersebut. Tugas yang sudah selesai selalu mendapat risiko 0 (rendah).' },
            ]}
          />
          <div className="mt-4">
            <Formula>
              Contoh: P(rendah) = 0,10 · P(sedang) = 0,25 · P(tinggi) = 0,65
              <br />
              Skor = (0,10 × 12) + (0,25 × 50) + (0,65 × 90) = 72,2 → <span className="text-red-600">Tinggi</span>, keyakinan 65%
            </Formula>
          </div>
        </Card>

        <LiveModelPanel />

        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Dua belas fitur model</h3>
          <p className="text-sm text-gray-500 mb-3">
            Nilai fitur diambil otomatis dari data proyek Anda. Kolom terakhir menjelaskan ciri nilai yang
            condong berisiko.
          </p>
          <DataTable
            head={['Fitur', 'Label', 'Sinyal berisiko']}
            rows={FEATURES.map(([n, l, b]) => [<Code>{n}</Code>, l, b])}
          />
        </Card>

        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Faktor kontribusi (penjelasan per tugas)</h3>
          <p className="text-sm text-gray-500 space-y-3">
            <span className="block">
              Setiap hasil analisis menyertakan maksimal enam faktor yang paling memengaruhi skor, dengan
              metode <b>ablasi (occlusion)</b>: satu per satu, setiap fitur dikembalikan ke nilai rata-rata
              data pelatihan sementara fitur lain tetap, lalu skor ulang model diukur. Selisih skor itulah
              kontribusi fitur tersebut.
            </span>
            <span className="block">
              Arahnya mudah dibaca: <b className="text-red-600">menaikkan</b> berarti nilai fitur tugas ini
              mendorong skor risiko naik dibanding rata-rata, dan <b className="text-green-600">menurunkan</b>{' '}
              berarti sebaliknya. Contoh tampilan:{' '}
              <i className="text-gray-600">&ldquo;Sisa hari menuju tenggat (nilai -2) menaikkan risiko.&rdquo;</i>
              {' '}Bersama faktor dominan, sistem juga memberikan satu rekomendasi tindakan yang dapat ditindaklanjuti.
            </span>
          </p>
        </Card>

        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Perkiraan keterlambatan (predicted_delay_days)</h3>
          <p className="text-sm text-gray-500">
            Angka ini <b>bukan keluaran model</b>, melainkan aritmetika sederhana yang transparan: sisa
            pekerjaan <Code>((100 − progres) / 100 × durasi estimasi)</Code> dikurangi waktu tersisa sampai
            tenggat. Jika hasilnya positif, tugas diperkirakan terlambat sejumlah hari tersebut; jika negatif
            atau datanya tidak cukup, kolom dikosongkan.
          </p>
        </Card>

        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Fallback aturan (rules-v1)</h3>
          <p className="text-sm text-gray-500 mb-3">
            Bila layanan ML sedang tidak tersedia (misalnya container mati), backend otomatis menghitung
            risiko dengan aturan berbasis poin yang transparan. Hasil tetap tersimpan dengan{' '}
            <Code>model_version = rules-v1</Code> dan analisis berikutnya kembali memakai model ML saat layanan
            pulih. <Code>GET /api/risk-model</Code> menunjukkan engine yang sedang aktif (<b>ml</b> atau{' '}
            <b>rules</b>) — panel &ldquo;Model AI&rdquo; di bagian ini membaca endpoint tersebut secara langsung.
          </p>
          <DataTable head={['Indikator', 'Poin']} rows={RULES} />
          <p className="text-sm text-gray-500 mt-3">
            Total poin dibatasi 0–100, lalu dipetakan ke tingkat: <b>&lt; 35 = rendah</b>,{' '}
            <b>35–64 = sedang</b>, <b>≥ 65 = tinggi</b>. Setiap poin di atas memunculkan faktor penyebab dan
            rekomendasi yang sesuai pada hasil analisis.
          </p>
        </Card>
      </Section>

      {/* 4. Prioritas AI */}
      <Section id="prioritas-ai" icon={IconPriority} title="Bagaimana AI Menghitung Prioritas" subtitle="Rumus berbobot empat komponen">
        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Rumus skor prioritas</h3>
          <p className="text-sm text-gray-500 mb-3">
            Prioritas dihitung backend (bukan oleh model ML) dengan rumus berbobot. Skor risiko terbaru dari
            hasil analisis menjadi salah satu masukannya:
          </p>
          <Formula>
            Skor prioritas = 100 × (0,4 × urgensi + 0,2 × kepentingan + 0,3 × risiko + 0,1 × kapasitas)
            <br />
            <span className="text-[11px] font-normal text-indigo-700">setiap komponen dinormalisasi ke rentang 0–1</span>
          </Formula>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5 mt-5">
            <div>
              <h4 className="text-sm font-bold text-gray-800 mb-1">Urgensi (bobot 0,4) — dari sisa waktu tenggat</h4>
              <DataTable head={['Kondisi tenggat', 'Skor']} rows={URGENCY_BANDS} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-800 mb-1">Kepentingan (bobot 0,2) — dari field tugas</h4>
              <DataTable head={['Tingkat kepentingan', 'Skor']} rows={[['Tinggi (high)', '100'], ['Sedang (medium)', '55'], ['Rendah (low)', '20']]} />
              <h4 className="text-sm font-bold text-gray-800 mt-5 mb-1">Kapasitas (bobot 0,1) — beban penanggung jawab</h4>
              <DataTable head={['Tugas aktif penanggung jawab', 'Skor']} rows={CAPACITY_BANDS} />
            </div>
            <div className="sm:col-span-2">
              <h4 className="text-sm font-bold text-gray-800 mb-1">Risiko (bobot 0,3) — dari hasil analisis terakhir</h4>
              <p className="text-sm text-gray-500">
                Komponen ini memakai skor risiko 0–100 dari analisis terakhir tugas tersebut. Bila tugas belum
                pernah dianalisis, dipakai nilai pengganti dari tingkatnya:{' '}
                <b>tinggi = 80</b>, <b>sedang = 55</b>, <b>rendah = 20</b>, dan <b>25 bila tanpa data</b>.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Contoh perhitungan nyata</h3>
          <p className="text-sm text-gray-500 mb-3">
            Sebuah tugas dengan tenggat 1 hari lagi, kepentingan tinggi, skor risiko terakhir 72, dan
            penanggung jawabnya sedang memegang 3 tugas aktif:
          </p>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {['Komponen', 'Bobot', 'Skor komponen', 'Kontribusi'].map((h) => (
                    <th key={h} className="py-2.5 pr-4 font-semibold text-xs uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr className="border-b border-gray-50"><td className="py-2.5 pr-4 font-medium">Urgensi — tenggat 1 hari lagi</td><td className="py-2.5 pr-4">0,4</td><td className="py-2.5 pr-4">85</td><td className="py-2.5 pr-4">0,4 × 0,85 = 0,340</td></tr>
                <tr className="border-b border-gray-50"><td className="py-2.5 pr-4 font-medium">Kepentingan — tinggi</td><td className="py-2.5 pr-4">0,2</td><td className="py-2.5 pr-4">100</td><td className="py-2.5 pr-4">0,2 × 1,00 = 0,200</td></tr>
                <tr className="border-b border-gray-50"><td className="py-2.5 pr-4 font-medium">Risiko — skor analisis 72</td><td className="py-2.5 pr-4">0,3</td><td className="py-2.5 pr-4">72</td><td className="py-2.5 pr-4">0,3 × 0,72 = 0,216</td></tr>
                <tr className="border-b border-gray-50"><td className="py-2.5 pr-4 font-medium">Kapasitas — 3 tugas aktif</td><td className="py-2.5 pr-4">0,1</td><td className="py-2.5 pr-4">55</td><td className="py-2.5 pr-4">0,1 × 0,55 = 0,055</td></tr>
                <tr className="font-bold text-gray-900"><td className="py-2.5 pr-4">Total</td><td className="py-2.5 pr-4">1,0</td><td className="py-2.5 pr-4">—</td><td className="py-2.5 pr-4">0,811 × 100 = <span className="text-indigo-700">81,10</span></td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-gray-900 mb-1">Aturan kesiapan dependensi & tugas selesai</h3>
          <ul className="mt-3 space-y-3 text-sm text-gray-600 leading-relaxed">
            <li className="flex gap-3">
              <span className="mt-0.5 w-6 h-6 rounded-full bg-amber-50 text-amber-600 text-xs font-bold flex items-center justify-center shrink-0">×</span>
              <span>
                <b className="text-gray-800">Prasyarat belum selesai → dikalikan 0,4.</b> Jika tugas masih
                memiliki dependensi berstatus belum selesai, skornya dilipatgandakan 0,4 dan sistem menambahkan
                alasan eksplisit: <i>&ldquo;Belum dapat dimulai sepenuhnya: menunggu prasyarat (…)&rdquo;</i>.
                Ini mencegah tugas yang belum bisa dikerjakan menduduki peringkat teratas.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 w-6 h-6 rounded-full bg-green-50 text-green-600 text-xs font-bold flex items-center justify-center shrink-0">✓</span>
              <span>
                <b className="text-gray-800">Tugas selesai → prioritas 0.</b> Tugas berstatus selesai tidak
                lagi masuk hitungan urutan kerja.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">=</span>
              <span>
                <b className="text-gray-800">Skor seri → tenggat lebih dulu.</b> Bila dua tugas memiliki skor
                identik, yang tenggatnya lebih dekat menempati peringkat lebih atas.
              </span>
            </li>
          </ul>
        </Card>
      </Section>

      {/* 5. FAQ */}
      <Section id="faq" icon={IconSpark} title="FAQ & Tips" subtitle="Pertanyaan yang sering muncul">
        <div className="space-y-3">
          {FAQS.map((f) => (
            <Card key={f.q}>
              <div className="flex gap-3">
                <span className="mt-0.5 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">?</span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{f.q}</h3>
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{f.a}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Notice tone="info">
          <span className="font-semibold">Tips pro:</span> jalankan Analisis Risiko secara berkala (misalnya
          setiap awal minggu atau setelah perubahan besar). Semakin sering data tugas diperbarui (progres,
          status, durasi aktual), semakin akurat risiko dan prioritas yang dihasilkan.
        </Notice>

        <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
          <IconArrowUp className="w-3.5 h-3.5" />
          <IconArrowDown className="w-3.5 h-3.5" />
          <span>
            Detail implementasi: <Code>backend/src/services/risk.js</Code>, <Code>backend/src/services/priority.js</Code>, dan <Code>ml/FEATURES.py</Code>.
          </span>
        </div>
      </Section>
    </div>
  );
}
