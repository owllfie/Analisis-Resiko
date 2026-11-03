import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApiGet } from '../api/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Card, CardHeader, Spinner, ErrorBanner, EmptyState, Badge, ProgressBar, Modal, Field, inputCls, btnPrimary,
  btnSecondary, ConfirmDialog, Avatar, Notice, Pagination, IconPlus, IconEdit, IconTrash, IconArrowUp,
  IconArrowDown, IconLink, IconClock, IconTarget,
} from '../lib/ui.jsx';
import {
  formatDate, formatDateTime, relativeDays, STATUS_BADGE, STATUS_LABEL, IMPORTANCE_BADGE, IMPORTANCE_LABEL,
  PROJECT_STATUS_BADGE, PROJECT_STATUS_LABEL,
} from '../lib/format.js';

const IMPORTANCE = ['low', 'medium', 'high'];

const emptyTask = {
  title: '', description: '', assignee_id: '', status: 'todo', progress: 0,
  estimated_duration: '', actual_duration: '', start_date: '', due_date: '', importance: 'medium',
};

function TaskFormModal({ open, onClose, initial, projectId, assignees, onSaved }) {
  const [form, setForm] = useState(emptyTask);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              title: initial.title || '',
              description: initial.description || '',
              assignee_id: initial.assignee_id || '',
              status: initial.status || 'todo',
              progress: initial.progress ?? 0,
              estimated_duration: initial.estimated_duration ?? '',
              actual_duration: initial.actual_duration ?? '',
              start_date: initial.start_date ? initial.start_date.slice(0, 10) : '',
              due_date: initial.due_date ? initial.due_date.slice(0, 10) : '',
              importance: initial.importance || 'medium',
            }
          : emptyTask,
      );
      setError('');
    }
  }, [open, initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        title: form.title,
        description: form.description || null,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        status: form.status,
        progress: Number(form.progress) || 0,
        estimated_duration: form.estimated_duration === '' ? null : Number(form.estimated_duration),
        actual_duration: form.actual_duration === '' ? null : Number(form.actual_duration),
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        importance: form.importance,
      };
      if (initial) await api.patch(`/tasks/${initial.id}`, body);
      else await api.post(`/projects/${projectId}/tasks`, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={initial ? 'Ubah Tugas' : 'Tugas Baru'} onClose={onClose} size="max-w-2xl">
      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Judul Tugas">
          <input value={form.title} onChange={set('title')} required maxLength={200} className={inputCls} placeholder="Mis. Implementasi API" />
        </Field>
        <Field label="Deskripsi" hint="opsional">
          <textarea value={form.description} onChange={set('description')} rows={3} maxLength={5000} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Penanggung Jawab">
            <select value={form.assignee_id} onChange={set('assignee_id')} className={inputCls}>
              <option value="">Belum ditugaskan</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tingkat Kepentingan">
            <select value={form.importance} onChange={set('importance')} className={inputCls}>
              <option value="low">Rendah</option>
              <option value="medium">Sedang</option>
              <option value="high">Tinggi</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Status">
            <select value={form.status} onChange={set('status')} className={inputCls}>
              <option value="todo">To Do</option>
              <option value="in_progress">Dikerjakan</option>
              <option value="blocked">Terhambat</option>
              <option value="completed">Selesai</option>
            </select>
          </Field>
          <Field label="Progres (%)">
            <input type="number" min="0" max="100" value={form.progress} onChange={set('progress')} className={inputCls} />
          </Field>
          <Field label="Durasi Aktual (hari)">
            <input type="number" min="0" step="0.5" value={form.actual_duration} onChange={set('actual_duration')} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Durasi Estimasi (hari)">
            <input type="number" min="0" step="0.5" value={form.estimated_duration} onChange={set('estimated_duration')} className={inputCls} />
          </Field>
          <Field label="Tanggal Mulai">
            <input type="date" value={form.start_date} onChange={set('start_date')} className={inputCls} />
          </Field>
          <Field label="Tenggat">
            <input type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Batal</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

function TaskDetailModal({ task, projectTasks, dependencies, canManage, canUpdate, onClose, onChanged }) {
  const [progress, setProgress] = useState(task.progress ?? 0);
  const [status, setStatus] = useState(task.status);
  const [actual, setActual] = useState(task.actual_duration ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [depToAdd, setDepToAdd] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let active = true;
    api.get(`/tasks/${task.id}`).then((res) => { if (active) setDetail(res.data); }).catch(() => {});
    return () => { active = false; };
  }, [task.id]);

  const deps = dependencies.filter((d) => d.task_id === task.id);
  const depOptions = projectTasks.filter(
    (t) => t.id !== task.id && !deps.some((d) => d.depends_on_task_id === t.id),
  );
  const history = detail?.history || [];

  const saveProgress = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await api.patch(`/tasks/${task.id}`, {
        status,
        progress: Number(progress),
        actual_duration: actual === '' ? null : Number(actual),
        note: note || undefined,
      });
      setNote('');
      setNotice('Perubahan disimpan');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addDep = async () => {
    if (!depToAdd) return;
    setError('');
    try {
      await api.post(`/tasks/${task.id}/dependencies`, { depends_on_task_id: Number(depToAdd) });
      setDepToAdd('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeDep = async (depId) => {
    setError('');
    try {
      await api.delete(`/tasks/${task.id}/dependencies/${depId}`);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const due = relativeDays(task.due_date);

  return (
    <Modal title={task.title} subtitle={task.description || undefined} onClose={onClose} size="max-w-2xl">
      {error && <div className="mb-4"><Notice tone="warn">{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="success">{notice}</Notice></div>}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Badge tone={STATUS_BADGE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
        <Badge tone={IMPORTANCE_BADGE[task.importance]}>Kepentingan: {IMPORTANCE_LABEL[task.importance]}</Badge>
        {due != null && (
          <Badge tone={due < 0 ? 'bg-red-100 text-red-700' : due <= 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}>
            {due < 0 ? `Terlewat ${Math.abs(due)} hari` : `Tenggat ${due} hari lagi`}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div>
          <div className="text-xs text-gray-400">Penanggung Jawab</div>
          <div className="text-sm font-semibold text-gray-700 mt-0.5">{task.assignee_name || '-'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Tenggat</div>
          <div className="text-sm font-semibold text-gray-700 mt-0.5">{formatDate(task.due_date)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Estimasi / Aktual</div>
          <div className="text-sm font-semibold text-gray-700 mt-0.5">
            {task.estimated_duration ?? '-'} / {task.actual_duration ?? '-'} hari
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Progres</div>
          <div className="text-sm font-semibold text-gray-700 mt-0.5">{task.progress}%</div>
        </div>
      </div>

      {canUpdate && (
        <form onSubmit={saveProgress} className="p-4 rounded-xl bg-gray-50 border border-gray-100 mb-6">
          <div className="font-semibold text-sm text-gray-700 mb-3">Perbarui Progres</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="todo">To Do</option>
                <option value="in_progress">Dikerjakan</option>
                <option value="blocked">Terhambat</option>
                <option value="completed">Selesai</option>
              </select>
            </Field>
            <Field label="Progres (%)">
              <input type="number" min="0" max="100" value={progress} onChange={(e) => setProgress(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Durasi Aktual (hari)">
              <input type="number" min="0" step="0.5" value={actual} onChange={(e) => setActual(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Catatan" hint="opsional">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Ringkas perubahan yang dilakukan" />
            </Field>
          </div>
          <div className="flex justify-end mt-3">
            <button type="submit" disabled={saving} className={`${btnPrimary} px-4 py-2 text-sm`}>
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      )}

      {canManage && (
        <div className="mb-6">
          <div className="flex items-center gap-2 font-semibold text-sm text-gray-700 mb-3">
            <IconLink className="w-4 h-4 text-gray-400" /> Tugas Prasyarat
          </div>
          {deps.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">Belum ada prasyarat. Tugas ini dapat dimulai tanpa menunggu tugas lain.</p>
          ) : (
            <ul className="space-y-2 mb-3">
              {deps.map((d) => {
                const dep = projectTasks.find((t) => t.id === d.depends_on_task_id);
                return (
                  <li key={d.depends_on_task_id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge tone={STATUS_BADGE[dep?.status]}>{STATUS_LABEL[dep?.status]}</Badge>
                      <span className="text-sm text-gray-700 truncate">{dep?.title || `Tugas #${d.depends_on_task_id}`}</span>
                    </div>
                    <button onClick={() => removeDep(d.depends_on_task_id)} className="p-1 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition" title="Hapus prasyarat">
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {depOptions.length > 0 && (
            <div className="flex gap-2">
              <select value={depToAdd} onChange={(e) => setDepToAdd(e.target.value)} className={inputCls}>
                <option value="">Pilih tugas prasyarat...</option>
                {depOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <button onClick={addDep} disabled={!depToAdd} className={btnSecondary}>Tambah</button>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 font-semibold text-sm text-gray-700 mb-3">
          <IconClock className="w-4 h-4 text-gray-400" /> Riwayat Progres
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada riwayat.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="mt-1 w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">{STATUS_LABEL[h.status] || h.status}</span> · {h.progress}%
                  </div>
                  {h.note && <div className="text-xs text-gray-500 mt-0.5">{h.note}</div>}
                  <div className="text-xs text-gray-400 mt-0.5">
                    {h.updated_by_name || 'Sistem'} · {formatDateTime(h.recorded_at)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user.role === 'admin' || user.role === 'manager';

  const { data, loading, error, reload } = useApiGet(`/projects/${id}`, [id]);
  const usersRes = useApiGet(canManage ? '/users?limit=100' : '', [canManage]);

  const [taskForm, setTaskForm] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState('');

  const project = data?.data;
  const tasks = useMemo(() => project?.tasks || [], [project]);
  const dependencies = project?.dependencies || [];

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner error={error} onRetry={reload} />;
  if (!project) return <EmptyState title="Proyek tidak ditemukan" />;

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeMsg('');
    try {
      const res = await api.post(`/projects/${id}/analyze-risk`);
      setAnalyzeMsg(`Analisis selesai untuk ${res.data.length} tugas (${res.model_version}).`);
      reload();
    } catch (err) {
      setAnalyzeMsg(`Gagal: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/tasks/${confirm.task.id}`);
      setConfirm(null);
      reload();
    } catch (err) {
      setConfirm((c) => ({ ...c, error: err.message }));
    }
  };

  const completed = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link to="/projects" className="hover:text-indigo-600 transition">Proyek</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium truncate">{project.name}</span>
      </div>

      <Card>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{project.name}</h2>
              <Badge tone={PROJECT_STATUS_BADGE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Badge>
            </div>
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">{project.description || 'Tanpa deskripsi'}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-gray-500">
              <span className="flex items-center gap-2"><Avatar name={project.manager_name} className="w-6 h-6 text-[10px]" /> {project.manager_name || 'Tanpa manajer'}</span>
              <span className="flex items-center gap-1.5"><IconClock className="w-4 h-4 text-gray-400" /> {formatDate(project.start_date)} – {formatDate(project.due_date)}</span>
              <span className="flex items-center gap-1.5"><IconTarget className="w-4 h-4 text-gray-400" /> {completed}/{tasks.length} tugas selesai</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && (
              <button onClick={runAnalysis} disabled={analyzing} className={btnSecondary}>
                <IconArrowUp className="w-4 h-4" /> {analyzing ? 'Menganalisis...' : 'Jalankan Analisis Risiko'}
              </button>
            )}
            <Link to={`/risk?project=${id}`} className={btnSecondary}>Lihat Risiko</Link>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-500 font-medium">Progres Proyek</span>
            <span className="font-bold text-gray-700">{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} />
        </div>

        {analyzeMsg && <div className="mt-4"><Notice tone={analyzeMsg.startsWith('Gagal') ? 'warn' : 'success'}>{analyzeMsg}</Notice></div>}
      </Card>

      <Card padded={false}>
        <CardHeader
          title="Daftar Tugas"
          subtitle={`${tasks.length} tugas dalam proyek ini`}
          actions={
            canManage && (
              <button onClick={() => setTaskForm({ mode: 'create' })} className={btnPrimary}>
                <IconPlus className="w-4 h-4" /> Tugas
              </button>
            )
          }
        />
        {tasks.length === 0 ? (
          <EmptyState title="Belum ada tugas" message="Tambahkan tugas untuk memulai perencanaan." />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold">Tugas</th>
                  <th className="px-4 py-3 font-semibold">Penanggung Jawab</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold w-48">Progres</th>
                  <th className="px-4 py-3 font-semibold">Kepentingan</th>
                  <th className="px-4 py-3 font-semibold">Tenggat</th>
                  <th className="px-6 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tasks.map((t) => {
                  const due = relativeDays(t.due_date);
                  const isAssignee = t.assignee_id === user.id;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-3.5">
                        <button onClick={() => setDetailTask(t)} className="text-left">
                          <div className="font-semibold text-gray-800 hover:text-indigo-600 transition">{t.title}</div>
                          {dependencies.filter((d) => d.task_id === t.id).length > 0 && (
                            <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                              <IconLink className="w-3 h-3" /> {dependencies.filter((d) => d.task_id === t.id).length} prasyarat
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">{t.assignee_name || '-'}</td>
                      <td className="px-4 py-3.5"><Badge tone={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</Badge></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={t.progress} className="flex-1" />
                          <span className="text-xs font-semibold text-gray-500 w-9 text-right">{t.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><Badge tone={IMPORTANCE_BADGE[t.importance]}>{IMPORTANCE_LABEL[t.importance]}</Badge></td>
                      <td className="px-4 py-3.5">
                        <div className="text-gray-600">{formatDate(t.due_date)}</div>
                        {due != null && t.status !== 'completed' && (
                          <div className={`text-[11px] ${due < 0 ? 'text-red-600' : due <= 3 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {due < 0 ? `Terlewat ${Math.abs(due)} hari` : `${due} hari lagi`}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setDetailTask(t)} className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition">
                            {(canManage || isAssignee) ? 'Kelola' : 'Detail'}
                          </button>
                          {canManage && (
                            <>
                              <button onClick={() => setTaskForm({ ...t, project_id: Number(id) })} title="Ubah" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
                                <IconEdit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setConfirm({ task: t, title: 'Hapus Tugas', message: `Hapus tugas "${t.title}" beserta riwayatnya?`, label: 'Ya, hapus' })}
                                title="Hapus"
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                              >
                                <IconTrash className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {taskForm && (
        <TaskFormModal
          open
          onClose={() => setTaskForm(null)}
          initial={taskForm.id ? taskForm : null}
          projectId={Number(id)}
          assignees={usersRes.data?.data || []}
          onSaved={reload}
        />
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projectTasks={tasks}
          dependencies={dependencies}
          canManage={canManage}
          canUpdate={canManage || detailTask.assignee_id === user.id}
          onClose={() => setDetailTask(null)}
          onChanged={() => { reload(); }}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.error ? `${confirm.message}\n\nGagal: ${confirm.error}` : confirm?.message}
        confirmLabel={confirm?.label}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
