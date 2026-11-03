import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useApiGet } from '../api/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, CardHeader, Spinner, ErrorBanner, EmptyState, Avatar, Pagination, ConfirmDialog, Checkbox, btnSecondary, btnDanger, IconTrash } from '../lib/ui.jsx';
import { formatDateTime } from '../lib/format.js';

const TYPES = [
  { key: '', label: 'Semua' },
  { key: 'insert', label: 'Insert' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' },
];

// Warna & label ringkas untuk kolom aksi pada tiap baris.
const ACTION_BADGE = {
  create: 'bg-emerald-50 text-emerald-700',
  register: 'bg-emerald-50 text-emerald-700',
  update: 'bg-amber-50 text-amber-700',
  update_profile: 'bg-amber-50 text-amber-700',
  restore: 'bg-sky-50 text-sky-700',
  revert: 'bg-sky-50 text-sky-700',
  archive: 'bg-gray-100 text-gray-600',
  add_dependency: 'bg-indigo-50 text-indigo-700',
  analyze_risk: 'bg-violet-50 text-violet-700',
  delete: 'bg-red-50 text-red-700',
  purge: 'bg-red-50 text-red-700',
};

const ACTION_LABEL = {
  create: 'Insert',
  register: 'Insert',
  update: 'Update',
  update_profile: 'Update',
  restore: 'Restore',
  revert: 'Revert',
  archive: 'Arsip',
  add_dependency: 'Dependensi',
  analyze_risk: 'Analisis',
  delete: 'Delete',
  purge: 'Hapus permanen',
};

const actionBadge = (action) => ACTION_BADGE[action] || 'bg-gray-100 text-gray-600';
const actionLabel = (action) => ACTION_LABEL[action] || action;

const PAGE_SIZE = 10;

export default function Activity() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'superadmin';

  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => { setPage(1); }, [type]);

  const path = `/activity?limit=${PAGE_SIZE}&page=${page}${type ? `&action_group=${type}` : ''}`;
  const { data, loading, error, reload } = useApiGet(path, [path]);

  const rows = data?.data || [];

  useEffect(() => { setSelected([]); }, [path]);

  const allSelected = rows.length > 0 && rows.every((a) => selected.includes(a.id));
  const someSelected = selected.length > 0 && !allSelected;

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => {
    if (allSelected) setSelected((s) => s.filter((id) => !rows.some((a) => a.id === id)));
    else setSelected((s) => Array.from(new Set([...s, ...rows.map((a) => a.id)])));
  };

  const doDelete = async () => {
    try {
      await api.delete(`/activity/${confirm.id}`);
      setConfirm(null);
      setSelected((s) => s.filter((id) => id !== confirm.id));
      reload();
    } catch (err) {
      setConfirm((c) => ({ ...c, error: err.message }));
    }
  };

  const doBulkDelete = async () => {
    setBulkLoading(true);
    setBulkError('');
    try {
      await api.post('/activity/bulk-delete', { ids: selected });
      setBulk(false);
      setSelected([]);
      reload();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const colCount = 4 + (canManage ? 2 : 0);

  return (
    <div className="space-y-6">
      <div className="inline-flex flex-wrap gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-sm">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              type === t.key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <Card><EmptyState title="Belum ada aktivitas" message="Aktivitas pengguna akan tercatat di sini." /></Card>
      ) : (
        <Card padded={false}>
          <CardHeader title="Riwayat Aktivitas" subtitle="Catatan perubahan data dan analisis" />
          {canManage && selected.length > 0 && (
            <div className="px-6 py-3 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-indigo-700">{selected.length} aktivitas dipilih</span>
              <div className="flex items-center gap-2">
                <button className={`${btnSecondary} py-2`} onClick={() => setSelected([])}>Batal</button>
                <button className={`${btnDanger} py-2`} onClick={() => { setBulkError(''); setBulk(true); }}>
                  <IconTrash className="w-4 h-4" /> Hapus Terpilih
                </button>
              </div>
            </div>
          )}
          <div className="table-scroll">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  {canManage && (
                    <th className="pl-6 pr-2 py-3 w-10">
                      <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} ariaLabel="Pilih semua aktivitas" />
                    </th>
                  )}
                  <th className={`${canManage ? '' : 'px-6'} pr-4 py-3 font-semibold`}>Pengguna</th>
                  <th className="px-4 py-3 font-semibold">Aksi</th>
                  <th className="px-4 py-3 font-semibold">Detail</th>
                  <th className="px-4 py-3 font-semibold text-right">Waktu</th>
                  {canManage && <th className="px-6 py-3 w-12" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition">
                    {canManage && (
                      <td className="pl-6 pr-2 py-3">
                        <Checkbox checked={selected.includes(a.id)} onChange={() => toggle(a.id)} ariaLabel="Pilih aktivitas" />
                      </td>
                    )}
                    <td className={`${canManage ? '' : 'px-6'} pr-4 py-3 whitespace-nowrap`}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={a.actor_name || 'Sistem'} className="w-8 h-8 text-xs" />
                        <span className="font-semibold text-gray-800">{a.actor_name || 'Sistem'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${actionBadge(a.action)}`}>
                        {actionLabel(a.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.description}</td>
                    <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                    {canManage && (
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => setConfirm({ id: a.id, title: 'Hapus Aktivitas', message: 'Hapus catatan aktivitas ini?', label: 'Ya, hapus' })}
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
                {rows.length === 0 && (
                  <tr><td colSpan={colCount} className="px-6 py-10 text-center text-sm text-gray-400">Tidak ada data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination
              page={data.page}
              totalPages={Math.ceil((data.total || 0) / (data.limit || PAGE_SIZE))}
              total={data.total}
              onChange={setPage}
            />
          )}
        </Card>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.error ? `Gagal: ${confirm.error}` : confirm?.message}
        confirmLabel={confirm?.label}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={bulk}
        title="Hapus Aktivitas Terpilih"
        message={bulkError ? `Gagal: ${bulkError}` : `Hapus ${selected.length} catatan aktivitas terpilih?`}
        confirmLabel="Ya, hapus"
        loading={bulkLoading}
        onConfirm={doBulkDelete}
        onCancel={() => { setBulk(false); setBulkError(''); }}
      />
    </div>
  );
}
