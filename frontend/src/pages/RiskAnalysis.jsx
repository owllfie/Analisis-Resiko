import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import { useApiGet } from '../api/useApi.js';
import { analyzeProjectRisk } from '../ml/analyzeRisk.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Card, CardHeader, StatCard, Spinner, ErrorBanner, EmptyState, Badge, Notice, inputCls, btnPrimary,
  IconRisk, IconTarget, IconArrowUp, IconChart,
} from '../lib/ui.jsx';
import { formatDateTime, RISK_BADGE, RISK_LABEL } from '../lib/format.js';

const RISK_COLORS = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
const FACTOR_LABEL = {
  overdue: 'Tenggat terlewat',
  deadline_near: 'Tenggat sangat dekat',
  deadline_soon: 'Tenggat dekat',
  deadline_upcoming: 'Tenggat mendatang',
  progress_lag: 'Progres tertinggal',
  blocked: 'Tugas terhambat',
  dependency_unfinished: 'Prasyarat belum selesai',
  importance: 'Kepentingan tinggi',
};

function ProjectSelect({ value, onChange, projects }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} sm:w-72`}>
      <option value="" disabled>Pilih proyek...</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

export default function RiskAnalysis() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';
  const canAnalyze = user.role === 'admin' || user.role === 'manager';

  const projectsRes = useApiGet('/projects?limit=100', []);
  const projects = projectsRes.data?.data || [];

  const { data, loading, error, reload } = useApiGet(
    projectId ? `/projects/${projectId}/risk-assessments` : '',
    [projectId],
  );

  const modelRes = useApiGet('/risk-model', []);
  const model = modelRes.data?.data;
  const isClientModel = model?.engine === 'client';

  const [expanded, setExpanded] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setExpanded(null); setMsg(''); }, [projectId]);

  const rows = data?.data || [];
  const dist = { low: 0, medium: 0, high: 0 };
  for (const r of rows) dist[r.risk_level] = (dist[r.risk_level] || 0) + 1;
  const chart = [
    { name: 'Rendah', value: dist.low, key: 'low' },
    { name: 'Sedang', value: dist.medium, key: 'medium' },
    { name: 'Tinggi', value: dist.high, key: 'high' },
  ];
  const hasData = rows.length > 0;
  const maxScore = rows.reduce((m, r) => Math.max(m, Number(r.risk_score) || 0), 0);

  const selectProject = (value) => {
    if (value) setParams({ project: value });
    else setParams({});
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setMsg('');
    try {
      const res = await analyzeProjectRisk(projectId);
      setMsg(res.data.length === 0
        ? 'Tidak ada tugas untuk dianalisis.'
        : `Analisis selesai untuk ${res.data.length} tugas.`);
      reload();
    } catch (err) {
      setMsg(`Gagal: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-gray-800">Pilih Proyek</div>
            <p className="text-sm text-gray-400 mt-0.5">Pilih proyek untuk melihat indikator risiko tiap tugas.</p>
          </div>
          <div className="flex items-center gap-3">
            <ProjectSelect value={projectId} onChange={selectProject} projects={projects} />
            {projectId && canAnalyze && (
              <button onClick={runAnalysis} disabled={analyzing} className={btnPrimary}>
                <IconArrowUp className="w-4 h-4" /> {analyzing ? 'Menganalisis...' : 'Jalankan Analisis'}
              </button>
            )}
          </div>
        </div>
      </Card>

      {false && <Notice tone="info">
        {isClientModel ? (
          <>
            <span className="font-semibold">Analisis berbasis AI/ML ({model.model_version}).</span>{' '}
            Model berjalan langsung di browser Anda (client-side), jadi kalkulasi tidak membebani server
            {model.metrics?.accuracy ? ` — akurasi uji ±${Math.round(model.metrics.accuracy * 100)}%` : ''}.
            Setiap tugas tetap dilengkapi penjelasan faktor kontribusi dan rekomendasi.
          </>
        ) : (
          <>
            <span className="font-semibold">Mode fallback (aturan rules-v1).</span> Model client tidak dapat
            dimuat saat ini, sehingga indikator risiko sementara dihitung dengan aturan transparan. Hasil tetap
            tersimpan dan analisis berikutnya otomatis memakai model AI lagi.
          </>
        )}
      </Notice>}

      {msg && <Notice tone={msg.startsWith('Gagal') ? 'warn' : 'success'}>{msg}</Notice>}

      {!projectId ? (
        <Card><EmptyState title="Belum ada proyek dipilih" message="Pilih salah satu proyek di atas untuk memulai." /></Card>
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : !hasData ? (
        <Card>
          <EmptyState
            title="Belum ada hasil analisis"
            message={canAnalyze ? 'Klik "Jalankan Analisis" untuk menghitung indikator risiko.' : 'Manajer belum menjalankan analisis untuk proyek ini.'}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Total Tugas Dianalisis" value={rows.length} icon={<IconTarget className="w-6 h-6" />} />
            <StatCard label="Risiko Tinggi" value={dist.high} icon={<IconRisk className="w-6 h-6" />} color="text-red-600" bg="bg-red-50" />
            <StatCard label="Risiko Sedang" value={dist.medium} icon={<IconRisk className="w-6 h-6" />} color="text-amber-600" bg="bg-amber-50" />
            <StatCard label="Skor Tertinggi" value={maxScore} icon={<IconChart className="w-6 h-6" />} color="text-indigo-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card padded={false} className="lg:col-span-1">
              <CardHeader title="Komposisi Risiko" />
              <div className="p-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={chart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {chart.map((c) => <Cell key={c.key} fill={RISK_COLORS[c.key]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-3">
                  {chart.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: RISK_COLORS[c.key] }} />
                      <span className="text-xs text-gray-500">{c.name} ({c.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card padded={false} className="lg:col-span-2">
              <CardHeader title="Daftar Indikator Risiko" subtitle="Diurutkan dari skor tertinggi" />
              <div className="table-scroll">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold">Tugas</th>
                      <th className="px-4 py-3 font-semibold">Tingkat</th>
                      <th className="px-4 py-3 font-semibold">Skor</th>
                      <th className="px-4 py-3 font-semibold">Keyakinan</th>
                      <th className="px-4 py-3 font-semibold">Perkiraan Keterlambatan</th>
                      <th className="px-6 py-3 font-semibold">Dianalisis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition align-top">
                        <td className="px-6 py-3.5">
                          <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-left">
                            <div className="font-semibold text-gray-800">{r.task_title || `Tugas #${r.task_id}`}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {expanded === r.id ? 'Sembunyikan detail' : 'Lihat detail'}
                            </div>
                          </button>
                          {expanded === r.id && (
                            <div className="mt-3 space-y-3 animate-fade-in">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Faktor Penyebab</div>
                                  {Array.isArray(r.contributing_factors) && r.contributing_factors.length > 0 ? (
                                  <ul className="flex flex-wrap gap-x-4 gap-y-2">
                                    {r.contributing_factors.map((f, i) => (
                                      <li key={i} className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${RISK_BADGE[f.impact] || 'bg-gray-100 text-gray-600'}`}>
                                          {f.label || FACTOR_LABEL[f.factor] || f.feature}
                                        </span>
                                        <span className="text-xs text-gray-500">{f.detail}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-xs text-gray-400">Tidak ada faktor signifikan.</span>
                                )}
                              </div>
                              {r.probabilities && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Probabilitas Tiap Tingkat</div>
                                  <div className="space-y-1.5">
                                    {['low', 'medium', 'high'].map((k) => {
                                      const pct = Math.round((Number(r.probabilities[k]) || 0) * 100);
                                      return (
                                        <div key={k} className="flex items-center gap-2">
                                          <span className="w-14 text-xs text-gray-500">{RISK_LABEL[k]}</span>
                                          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: RISK_COLORS[k] }} />
                                          </div>
                                          <span className="w-10 text-right text-xs text-gray-500">{pct}%</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rekomendasi</div>
                                <p className="text-xs text-gray-600">{r.recommendation}</p>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5"><Badge tone={RISK_BADGE[r.risk_level]}>{RISK_LABEL[r.risk_level]}</Badge></td>
                        <td className="px-4 py-3.5 font-bold text-gray-700">{Number(r.risk_score)}</td>
                        <td className="px-4 py-3.5 text-gray-600">
                          {r.confidence != null ? `${Math.round(Number(r.confidence) * 100)}%` : '-'}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600">
                          {r.predicted_delay_days != null ? `${Number(r.predicted_delay_days)} hari` : '-'}
                        </td>
                        <td className="px-6 py-3.5 text-gray-500 text-xs">{formatDateTime(r.analyzed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="text-sm text-gray-400">
            Ingin mengubah tugas? Buka <Link to={`/projects/${projectId}`} className="text-indigo-600 font-semibold hover:underline">detail proyek</Link>.
          </div>
        </>
      )}
    </div>
  );
}
