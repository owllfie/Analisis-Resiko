import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApiGet } from '../api/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSearch } from '../context/SearchContext.jsx';
import {
  Card, Spinner, ErrorBanner, EmptyState, Badge, ProgressBar, Modal, Field, inputCls, btnPrimary, btnSecondary, btnDanger,
  Pagination, ConfirmDialog, Avatar, Checkbox, IconPlus, IconEdit, IconTrash,
} from '../lib/ui.jsx';
import { formatDate, formatCurrency, formatThousands, toDigits, PROJECT_STATUS_BADGE, PROJECT_STATUS_LABEL } from '../lib/format.js';

const STATUS_TABS = [
  { key: '', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'completed', label: 'Selesai' },
  { key: 'archived', label: 'Diarsipkan' },
];

const emptyForm = { name: '', description: '', start_date: '', due_date: '', status: 'active', manager_id: '', budget: '' };

function ProjectFormModal({ open, onClose, initial, managers, isAdmin, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name || '',
              description: initial.description || '',
              start_date: initial.start_date ? initial.start_date.slice(0, 10) : '',
              due_date: initial.due_date ? initial.due_date.slice(0, 10) : '',
              status: initial.status || 'active',
              manager_id: initial.manager_id || '',
              budget: toDigits(initial.budget),
            }
          : emptyForm,
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
        name: form.name,
        description: form.description || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        status: form.status,
        budget: form.budget === '' ? null : Number(form.budget),
      };
      if (isAdmin && form.manager_id) body.manager_id = Number(form.manager_id);
      if (initial) await api.patch(`/projects/${initial.id}`, body);
      else await api.post('/projects', body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Modal title={initial ? 'Ubah Proyek' : 'Proyek Baru'} onClose={onClose} size="max-w-xl">
      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama Proyek">
          <input value={form.name} onChange={set('name')} required maxLength={200} className={inputCls} placeholder="Mis. Migrasi Sistem Pembayaran" />
        </Field>
        <Field label="Deskripsi" hint="opsional">
          <textarea value={form.description} onChange={set('description')} rows={3} maxLength={5000} className={inputCls} placeholder="Ringkasan tujuan dan ruang lingkup proyek" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tanggal Mulai">
            <input type="date" value={form.start_date} onChange={set('start_date')} className={inputCls} />
          </Field>
          <Field label="Tenggat">
            <input type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} />
          </Field>
        </div>
        <Field label="Anggaran Proyek" hint="opsional, dipakai sebagai fitur analisis AI">
          <input
            type="text"
            inputMode="numeric"
            value={formatThousands(form.budget)}
            onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value.replace(/\D/g, '') }))}
            className={inputCls}
            placeholder="Mis. 150.000.000"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Status">
            <select value={form.status} onChange={set('status')} className={inputCls}>
              <option value="active">Aktif</option>
              <option value="completed">Selesai</option>
              <option value="archived">Diarsipkan</option>
            </select>
          </Field>
          {isAdmin && (
            <Field label="Manajer Proyek">
              <select value={form.manager_id} onChange={set('manager_id')} className={inputCls}>
                <option value="">Saya sendiri</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Batal</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Projects() {
  const { user } = useAuth();
  const { search } = useSearch();
  const canManage = user.role === 'superadmin' || user.role === 'admin' || user.role === 'manager';

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [status, q]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ limit: '10', page: String(page) });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    return `/projects?${params.toString()}`;
  }, [status, q, page]);

  useEffect(() => { setSelected([]); }, [path]);

  const { data, loading, error, reload } = useApiGet(path, [path]);
  const managers = useApiGet(user.role === 'admin' ? '/users?role=manager&limit=100' : '', []);

  const projects = data?.data || [];
  const allSelected = projects.length > 0 && projects.every((p) => selected.includes(p.id));
  const someSelected = selected.length > 0 && !allSelected;

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => {
    if (allSelected) setSelected((s) => s.filter((id) => !projects.some((p) => p.id === id)));
    else setSelected((s) => Array.from(new Set([...s, ...projects.map((p) => p.id)])));
  };

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p) => { setEditing(p); setFormOpen(true); };

  const doConfirm = async () => {
    try {
      if (confirm.mode === 'archive') await api.delete(`/projects/${confirm.project.id}?archive=true`);
      else await api.delete(`/projects/${confirm.project.id}`);
      setConfirm(null);
      if (confirm.mode !== 'archive') setSelected((s) => s.filter((id) => id !== confirm.project.id));
      reload();
    } catch (err) {
      setConfirm((c) => ({ ...c, error: err.message }));
    }
  };

  const doBulkDelete = async () => {
    setBulkLoading(true);
    setBulkError('');
    try {
      await api.post('/projects/bulk-delete', { ids: selected });
      setBulk(false);
      setSelected([]);
      reload();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex flex-wrap gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-sm">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                status === t.key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {canManage && (
          <button onClick={openCreate} className={btnPrimary}>
            <IconPlus className="w-4 h-4" /> Proyek Baru
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : projects.length === 0 ? (
        <Card><EmptyState title="Belum ada proyek" message={q ? 'Tidak ada proyek yang cocok dengan pencarian.' : 'Buat proyek pertama Anda untuk memulai.'} /></Card>
      ) : (
        <Card padded={false}>
          {canManage && selected.length > 0 && (
            <div className="px-6 py-3 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-indigo-700">{selected.length} proyek dipilih</span>
              <div className="flex items-center gap-2">
                <button className={`${btnSecondary} py-2`} onClick={() => setSelected([])}>Batal</button>
                <button className={`${btnDanger} py-2`} onClick={() => { setBulkError(''); setBulk(true); }}>
                  <IconTrash className="w-4 h-4" /> Hapus Terpilih
                </button>
              </div>
            </div>
          )}
          <div className="table-scroll">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  {canManage && (
                    <th className="pl-6 pr-2 py-3 w-10">
                      <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} ariaLabel="Pilih semua proyek" />
                    </th>
                  )}
                  <th className={`${canManage ? '' : 'px-6'} pr-4 py-3 font-semibold`}>Proyek</th>
                  <th className="px-4 py-3 font-semibold">Manajer</th>
                  <th className="px-4 py-3 font-semibold">Progres</th>
                  <th className="px-4 py-3 font-semibold">Tugas</th>
                  <th className="px-4 py-3 font-semibold">Tenggat</th>
                  <th className="px-4 py-3 font-semibold">Anggaran</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canManage && <th className="px-6 py-3 font-semibold text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition">
                    {canManage && (
                      <td className="pl-6 pr-2 py-3">
                        <Checkbox checked={selected.includes(p.id)} onChange={() => toggle(p.id)} ariaLabel={`Pilih ${p.name}`} />
                      </td>
                    )}
                    <td className={`${canManage ? '' : 'px-6'} pr-4 py-3 max-w-[320px]`}>
                      <Link to={`/projects/${p.id}`} className="font-semibold text-gray-800 hover:text-indigo-600 transition line-clamp-1">{p.name}</Link>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description || 'Tanpa deskripsi'}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Avatar name={p.manager_name} className="w-7 h-7 text-xs" />
                        <span className="text-gray-600">{p.manager_name || 'Tanpa manajer'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[130px]">
                        <ProgressBar value={p.progress} className="flex-1" />
                        <span className="text-xs font-semibold text-gray-600 w-9 text-right">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{p.completed_task_count}/{p.task_count}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{p.due_date ? formatDate(p.due_date) : '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{p.budget != null ? formatCurrency(p.budget) : '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><Badge tone={PROJECT_STATUS_BADGE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge></td>
                    {canManage && (
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(p)} title="Ubah" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
                            <IconEdit className="w-4 h-4" />
                          </button>
                          {p.status !== 'archived' && (
                            <button
                              onClick={() => setConfirm({ project: p, mode: 'archive', title: 'Arsipkan Proyek', message: `Arsipkan proyek "${p.name}"? Proyek tetap tersimpan namun ditandai tidak aktif.`, label: 'Ya, arsipkan' })}
                              className="px-2 py-1 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 transition"
                            >
                              Arsip
                            </button>
                          )}
                          <button
                            onClick={() => setConfirm({ project: p, mode: 'delete', title: 'Hapus Proyek', message: `Hapus proyek "${p.name}" beserta seluruh tugas dan datanya? Tindakan ini tidak dapat dibatalkan.`, label: 'Ya, hapus' })}
                            title="Hapus"
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination page={data.page} totalPages={Math.ceil((data.total || 0) / (data.limit || 10))} total={data.total} onChange={setPage} />
          )}
        </Card>
      )}

      <ProjectFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        managers={managers.data?.data || []}
        isAdmin={user.role === 'admin'}
        onSaved={reload}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.error ? `${confirm.message}\n\nGagal: ${confirm.error}` : confirm?.message}
        confirmLabel={confirm?.label}
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={bulk}
        title="Hapus Proyek Terpilih"
        message={bulkError ? `Gagal: ${bulkError}` : `Hapus ${selected.length} proyek terpilih beserta tugasnya? Proyek akan dipindahkan ke sampah dan bisa dipulihkan.`}
        confirmLabel="Ya, hapus"
        loading={bulkLoading}
        onConfirm={doBulkDelete}
        onCancel={() => { setBulk(false); setBulkError(''); }}
      />
    </div>
  );
}
