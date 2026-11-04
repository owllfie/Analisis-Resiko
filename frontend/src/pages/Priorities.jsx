import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useApiGet } from '../api/useApi.js';
import {
  Card, CardHeader, Spinner, ErrorBanner, EmptyState, Badge, Notice, inputCls, IconTarget,
} from '../lib/ui.jsx';
import { formatDate, STATUS_BADGE, STATUS_LABEL, RISK_BADGE, RISK_LABEL, IMPORTANCE_BADGE, IMPORTANCE_LABEL } from '../lib/format.js';

const COMPONENTS = [
  { key: 'urgency', label: 'Urgensi', color: 'bg-red-400' },
  { key: 'importance', label: 'Kepentingan', color: 'bg-amber-400' },
  { key: 'risk', label: 'Risiko', color: 'bg-violet-400' },
  { key: 'capacity', label: 'Kapasitas', color: 'bg-blue-400' },
];

function scoreTone(score) {
  if (score >= 70) return 'bg-red-100 text-red-700';
  if (score >= 45) return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

export default function Priorities() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';

  const projectsRes = useApiGet('/projects?limit=100', []);
  const projects = projectsRes.data?.data || [];

  const { data, loading, error, reload } = useApiGet(
    projectId ? `/projects/${projectId}/task-priorities` : '',
    [projectId],
  );
  const projectRes = useApiGet(projectId ? `/projects/${projectId}` : '', [projectId]);

  const [expanded, setExpanded] = useState(null);

  const rows = data?.data || [];
  const weights = data?.weights || {};
  const project = projectRes.data?.data;
  const active = rows.filter((r) => r.status !== 'completed');

  const selectProject = (value) => {
    if (value) setParams({ project: value });
    else setParams({});
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-gray-800">Pilih Proyek</div>
            <p className="text-sm text-gray-400 mt-0.5">Prioritas dihitung dari urgensi, kepentingan, risiko, dan kapasitas anggota.</p>
          </div>
          <select value={projectId} onChange={(e) => selectProject(e.target.value)} className={`${inputCls} sm:w-72`}>
            <option value="" disabled>Pilih proyek...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {false && <Notice tone="info">
        <span className="font-semibold">Bobot prioritas:</span>{' '}
        Urgensi {Math.round((weights.urgency || 0) * 100)}% · Kepentingan {Math.round((weights.importance || 0) * 100)}% ·
        Risiko {Math.round((weights.risk || 0) * 100)}% · Kapasitas {Math.round((weights.capacity || 0) * 100)}%.
        Tugas yang prasyaratnya belum selesai diturunkan prioritasnya.
      </Notice>}

      {!projectId ? (
        <Card><EmptyState title="Belum ada proyek dipilih" message="Pilih salah satu proyek di atas untuk melihat prioritas." /></Card>
      ) : loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <Card><EmptyState title="Belum ada tugas" message="Tambahkan tugas pada proyek ini untuk menghitung prioritas." /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-400 font-medium">Total Tugas</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{rows.length}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-400 font-medium">Belum Selesai</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{active.length}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-400 font-medium">Skor Tertinggi</div>
              <div className="text-2xl font-bold text-indigo-600 mt-1">{active[0]?.priority_score ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-400 font-medium">Prasyarat Tertunda</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{rows.filter((r) => r.blocked_by?.length).length}</div>
            </div>
          </div>

          <Card padded={false}>
            <CardHeader
              title="Urutan Prioritas Pekerjaan"
              subtitle={project ? `Proyek: ${project.name}` : undefined}
              actions={<IconTarget className="w-5 h-5 text-indigo-500" />}
            />
            <div className="table-scroll">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold w-14">#</th>
                    <th className="px-4 py-3 font-semibold">Tugas</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Skor</th>
                    <th className="px-4 py-3 font-semibold w-52">Komponen</th>
                    <th className="px-6 py-3 font-semibold">Tenggat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => (
                    <tr key={r.task_id} className={`hover:bg-gray-50 transition align-top ${r.status === 'completed' ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-3.5">
                        <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center">
                          {r.position}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => setExpanded(expanded === r.task_id ? null : r.task_id)} className="text-left">
                          <div className="font-semibold text-gray-800">{r.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge tone={IMPORTANCE_BADGE[r.importance]}>{IMPORTANCE_LABEL[r.importance]}</Badge>
                            {r.risk_level && <Badge tone={RISK_BADGE[r.risk_level]}>Risiko {RISK_LABEL[r.risk_level]}</Badge>}
                            {r.blocked_by?.length > 0 && (
                              <Badge tone="bg-amber-100 text-amber-700">Menunggu {r.blocked_by.length} prasyarat</Badge>
                            )}
                          </div>
                          {expanded === r.task_id && (
                            <ul className="mt-2 space-y-1 animate-fade-in">
                              {r.reasons?.map((reason, i) => (
                                <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                                  <span className="mt-1 w-1 h-1 rounded-full bg-gray-300 shrink-0" /> {reason}
                                </li>
                              ))}
                            </ul>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3.5"><Badge tone={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${scoreTone(r.priority_score)}`}>
                          {r.priority_score}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          {COMPONENTS.map((c) => (
                            <div key={c.key} className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 w-16">{c.label}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                <div className={`h-full rounded-full ${c.color}`} style={{ width: `${r.components?.[c.key] ?? 0}%` }} />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-500 w-6 text-right">{r.components?.[c.key] ?? 0}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">{formatDate(r.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="text-sm text-gray-400">
            Kelola tugas pada <Link to={`/projects/${projectId}`} className="text-indigo-600 font-semibold hover:underline">detail proyek</Link>.
          </div>
        </>
      )}
    </div>
  );
}
