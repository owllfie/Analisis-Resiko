import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie,
} from 'recharts';
import { useApiGet } from '../api/useApi.js';
import {
  Card, CardHeader, StatCard, Spinner, ErrorBanner, EmptyState, Badge, ProgressBar, IconProjects,
  IconTarget, IconChart, IconRisk, IconArrowUp,
} from '../lib/ui.jsx';
import { formatDate, formatDateTime, relativeDays, RISK_BADGE, RISK_LABEL, STATUS_BADGE, STATUS_LABEL } from '../lib/format.js';

const STATUS_COLORS = { todo: '#9ca3af', in_progress: '#3b82f6', blocked: '#ef4444', completed: '#22c55e' };
const RISK_COLORS = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };

function dueHint(due) {
  const d = relativeDays(due);
  if (d == null) return { text: '-', tone: 'text-gray-400' };
  if (d < 0) return { text: `Terlewat ${Math.abs(d)} hari`, tone: 'text-red-600' };
  if (d === 0) return { text: 'Jatuh tempo hari ini', tone: 'text-red-600' };
  if (d <= 2) return { text: `${d} hari lagi`, tone: 'text-amber-600' };
  return { text: `${d} hari lagi`, tone: 'text-gray-400' };
}

export default function Dashboard() {
  const { data, loading, error, reload } = useApiGet('/dashboard', []);
  const modelRes = useApiGet('/risk-model', []);
  const model = modelRes.data?.data;

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;

  const d = data?.data || {};
  const tasks = d.tasks || { total: 0, todo: 0, in_progress: 0, blocked: 0, completed: 0 };
  const risk = d.risk_distribution || { low: 0, medium: 0, high: 0 };

  const statusChart = [
    { name: 'To Do', value: tasks.todo, key: 'todo' },
    { name: 'Dikerjakan', value: tasks.in_progress, key: 'in_progress' },
    { name: 'Terhambat', value: tasks.blocked, key: 'blocked' },
    { name: 'Selesai', value: tasks.completed, key: 'completed' },
  ];
  const riskChart = [
    { name: 'Rendah', value: risk.low || 0, key: 'low' },
    { name: 'Sedang', value: risk.medium || 0, key: 'medium' },
    { name: 'Tinggi', value: risk.high || 0, key: 'high' },
  ];
  const hasRisk = riskChart.some((r) => r.value > 0);

  const accuracy = model?.metrics?.accuracy != null ? (model.metrics.accuracy * 100).toFixed(1) : null;
  const infoItems = [
    { label: 'Tugas berisiko tinggi', value: `${risk.high || 0} tugas`, color: 'bg-red-500', tone: 'text-red-600' },
    { label: 'Mendekati tenggat (≤7 hari)', value: `${d.near_due?.length || 0} tugas`, color: 'bg-amber-500', tone: 'text-amber-600' },
    { label: 'Tugas terhambat', value: `${tasks.blocked || 0} tugas`, color: 'bg-orange-500', tone: 'text-orange-600' },
    { label: 'Tugas selesai', value: `${tasks.completed || 0}/${tasks.total || 0}`, color: 'bg-emerald-500', tone: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Proyek Aktif" value={d.active_projects ?? 0} icon={<IconProjects className="w-6 h-6" />} />
        <StatCard
          label="Total Tugas"
          value={tasks.total}
          hint={`${tasks.completed} selesai`}
          icon={<IconTarget className="w-6 h-6" />}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="Rata-rata Progres"
          value={`${d.average_progress ?? 0}%`}
          icon={<IconChart className="w-6 h-6" />}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          label="Risiko Tinggi"
          value={risk.high || 0}
          hint={`${(risk.medium || 0)} sedang`}
          icon={<IconRisk className="w-6 h-6" />}
          color="text-red-600"
          bg="bg-red-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded={false}>
          <CardHeader title="Distribusi Status Tugas" subtitle="Jumlah tugas berdasarkan status saat ini" />
          <div className="p-6">
            {tasks.total === 0 ? (
              <EmptyState title="Belum ada tugas" message="Tambahkan tugas pada proyek untuk melihat distribusinya." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={statusChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={64}>
                    {statusChart.map((s) => (
                      <Cell key={s.key} fill={STATUS_COLORS[s.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Distribusi Indikator Risiko"
            subtitle="Berdasarkan analisis terakhir tiap tugas"
            actions={<Badge tone="bg-indigo-50 text-indigo-600">{model?.model_version || 'rules-v1'}</Badge>}
          />
          <div className="p-6">
            {!hasRisk ? (
              <EmptyState title="Belum ada analisis risiko" message="Jalankan analisis risiko pada halaman detail proyek." />
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={240}>
                  <PieChart>
                    <Pie data={riskChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {riskChart.map((r) => (
                        <Cell key={r.key} fill={RISK_COLORS[r.key]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {riskChart.map((r) => (
                    <div key={r.key} className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full" style={{ background: RISK_COLORS[r.key] }} />
                      <span className="text-sm text-gray-600 w-16">{r.name}</span>
                      <span className="text-sm font-bold text-gray-900">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded={false}>
          <CardHeader title="Tenggat Dekat" subtitle="Tugas belum selesai dalam 7 hari ke depan" />
          {d.near_due?.length ? (
            <ul className="divide-y divide-gray-50">
              {d.near_due.map((t) => {
                const hint = dueHint(t.due_date);
                return (
                  <li key={t.id}>
                    <Link to={`/projects/${t.project_id}`} className="block px-6 py-3.5 hover:bg-gray-50 transition">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{t.title}</div>
                          <div className="text-xs text-gray-400 truncate">{t.project_name}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-xs font-semibold ${hint.tone}`}>{hint.text}</div>
                          <div className="text-xs text-gray-400">{formatDate(t.due_date)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge tone={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                        <div className="flex-1"><ProgressBar value={t.progress} /></div>
                        <span className="text-xs font-semibold text-gray-500 w-9 text-right">{t.progress}%</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Tidak ada tenggat dekat" message="Semua tugas dalam kondisi aman." />
          )}
        </Card>

        <Card padded={false}>
          <CardHeader title="Informasi Penting" subtitle="Ringkasan kondisi proyek saat ini" />
          <div className="p-6 space-y-5">
            <div className="space-y-3">
              {infoItems.map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${it.color}`} />
                    <span className="text-sm text-gray-600 truncate">{it.label}</span>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${it.tone}`}>{it.value}</span>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-gray-100 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500">Model risiko</span>
                <span className="text-sm font-semibold text-gray-800">{model?.model_version || 'rules-v1'}</span>
              </div>
              {accuracy && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">Akurasi model</span>
                  <span className="text-sm font-semibold text-gray-800">{accuracy}%</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500">Analisis terakhir</span>
                <span className="text-sm font-semibold text-gray-800">{d.last_analysis_at ? formatDateTime(d.last_analysis_at) : 'Belum ada'}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded={false}>
          <CardHeader title="Prioritas Teratas" subtitle="Urutan tugas lintas proyek berdasarkan skor prioritas" />
          {d.top_priorities?.length ? (
            <ul className="divide-y divide-gray-50">
              {d.top_priorities.slice(0, 5).map((p) => (
                <li key={p.task_id}>
                  <Link to={`/projects/${p.project_id}`} className="block px-6 py-3.5 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="mt-0.5 w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">
                          {p.position}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{p.title}</div>
                          <div className="text-xs text-gray-400 truncate">{p.reasons?.[0] || '-'}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-indigo-600">{p.priority_score}</div>
                        <div className="text-[11px] text-gray-400">skor</div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Belum ada prioritas" message="Tambahkan tugas untuk menghitung prioritas." />
          )}
        </Card>

        <Card padded={false}>
          <CardHeader title="Tugas Berisiko Tinggi" subtitle="Perlu perhatian segera" actions={<IconArrowUp className="w-4 h-4 text-red-500" />} />
          {d.high_risk?.length ? (
            <ul className="divide-y divide-gray-50">
              {d.high_risk.slice(0, 5).map((r) => (
                <li key={r.task_id} className="px-6 py-3.5">
                  <Link to={`/projects/${r.project_id}`} className="block">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-800 truncate">{r.title}</span>
                      <Badge tone={RISK_BADGE[r.risk_level]}>{RISK_LABEL[r.risk_level]}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{r.recommendation}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Tidak ada risiko tinggi" message="Tidak ada tugas berisiko tinggi saat ini." />
          )}
        </Card>
      </div>
    </div>
  );
}
