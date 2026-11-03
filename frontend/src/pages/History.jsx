import { useState } from 'react';
import { api } from '../api/client.js';
import { useApiGet } from '../api/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Card, CardHeader, Spinner, ErrorBanner, EmptyState, Badge,
  Pagination, ConfirmDialog, IconTrash,
} from '../lib/ui.jsx';
import { formatDate, formatDateTime, formatCurrency } from '../lib/format.js';

const PAGE_SIZE = 10;

const ENTITY_LABEL = { project: 'Proyek', task: 'Tugas', user: 'Pengguna' };

const ACTION_BADGE = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  archive: 'bg-amber-100 text-amber-700',
  restore: 'bg-emerald-100 text-emerald-700',
  revert: 'bg-violet-100 text-violet-700',
};
const ACTION_LABEL = {
  create: 'Dibuat',
  update: 'Diperbarui',
  delete: 'Dihapus',
  archive: 'Diarsipkan',
  restore: 'Dipulihkan',
  revert: 'Dikembalikan',
};

const FIELD_LABEL = {
  name: 'Nama', title: 'Judul', description: 'Deskripsi', start_date: 'Tanggal Mulai', due_date: 'Tenggat',
  status: 'Status', manager_id: 'Manajer (ID)', budget: 'Anggaran', assignee_id: 'Penanggung Jawab (ID)',
  progress: 'Progres', estimated_duration: 'Estimasi Durasi', actual_duration: 'Durasi Aktual',
  importance: 'Kepentingan', role: 'Peran',
};

const VALUE_LABEL = {
  active: 'Aktif', completed: 'Selesai', archived: 'Diarsipkan',
  todo: 'Belum dikerjakan', in_progress: 'Sedang dikerjakan', blocked: 'Terhambat',
  low: 'Rendah', medium: 'Sedang', high: 'Tinggi',
  superadmin: 'Super Admin', admin: 'Admin', manager: 'Manajer', member: 'Anggota',
};

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'budget') return formatCurrency(value);
  if (key.endsWith('_date')) return formatDate(value);
  if (key === 'progress') return `${value}%`;
  if (key.endsWith('_duration')) return `${value} hari`;
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  const s = String(value);
  return VALUE_LABEL[s] || s;
}

function entityTitle(h) {
  const snap = h.snapshot || {};
  const diff = h.diff || {};
  const candidate =
    snap.name ?? diff.name?.to ?? diff.name?.from ??
    snap.title ?? diff.title?.to ?? diff.title?.from;
  return candidate || `#${h.entity_id}`;
}

export default function History() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);
  const [msg, setMsg] = useState('');
  const canManage = user.role === 'admin' || user.role === 'superadmin';

  const path = `/history?limit=${PAGE_SIZE}&page=${page}`;
  const { data, loading, error, reload } = useApiGet(path, [path]);
  const items = data?.data || [];

  const doConfirm = async () => {
    setMsg('');
    try {
      if (confirm.mode === 'revert') {
        await api.post('/history/revert', { historyId: confirm.id });
        setMsg('Perubahan berhasil dikembalikan ke kondisi sebelumnya');
      } else {
        await api.delete(`/history/${confirm.id}`);
        setMsg('Riwayat dihapus');
      }
      setConfirm(null);
      reload();
    } catch (err) {
      setConfirm((c) => ({ ...c, error: err.message }));
    }
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <Card><EmptyState title="Belum ada histori" message="Perubahan data pengguna, proyek, dan tugas akan terekam di sini." /></Card>
      ) : (
        <Card padded={false}>
          <CardHeader title="Histori Update" subtitle="Nilai lama dan nilai baru setiap perubahan, bisa dikembalikan (revert) atau dihapus" />
          {msg && <div className="px-6 py-2 text-sm text-emerald-600">{msg}</div>}
          <div className="table-scroll">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold">Entitas</th>
                  <th className="px-4 py-3 font-semibold">Aksi</th>
                  <th className="px-4 py-3 font-semibold">Kolom</th>
                  <th className="px-4 py-3 font-semibold">Nilai Lama</th>
                  <th className="px-4 py-3 font-semibold">Nilai Baru</th>
                  <th className="px-4 py-3 font-semibold">Diubah Oleh</th>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  {canManage && <th className="px-6 py-3 font-semibold text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((h) => {
                  const changes = Object.entries(h.diff || {}).map(([key, v]) => ({
                    key,
                    from: v?.from ?? null,
                    to: v?.to ?? null,
                  }));
                  const canRevert = h.action === 'update' && !h.reverted_at;
                  return (
                    <tr key={h.id} className="hover:bg-gray-50/60 transition align-top">
                      <td className="px-6 py-3">
                        <div className="font-semibold text-gray-800">{entityTitle(h)}</div>
                        <div className="text-xs text-gray-400">
                          {ENTITY_LABEL[h.entity_type] || h.entity_type} #{h.entity_id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={ACTION_BADGE[h.action] || 'bg-gray-100 text-gray-600'}>
                            {ACTION_LABEL[h.action] || h.action}
                          </Badge>
                          {h.reverted_at && <Badge tone="bg-gray-100 text-gray-500">sudah di-revert</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {changes.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="space-y-1">
                            {changes.map((c) => (
                              <div key={c.key} className="text-gray-600">{FIELD_LABEL[c.key] || c.key}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {changes.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="space-y-1">
                            {changes.map((c) => (
                              <div key={c.key} className="text-gray-500">{formatValue(c.key, c.from)}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {changes.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="space-y-1">
                            {changes.map((c) => (
                              <div key={c.key} className="font-medium text-gray-800">{formatValue(c.key, c.to)}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{h.actor_name || 'Sistem'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(h.created_at)}</td>
                      {canManage && (
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {canRevert && (
                              <button
                                onClick={() => setConfirm({ mode: 'revert', id: h.id, title: 'Kembalikan Perubahan', message: `Kembalikan "${entityTitle(h)}" ke kondisi sebelum perubahan ini?`, label: 'Ya, kembalikan' })}
                                className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition"
                              >
                                Revert
                              </button>
                            )}
                            <button
                              onClick={() => setConfirm({ mode: 'delete', id: h.id, title: 'Hapus Riwayat', message: 'Hapus catatan riwayat ini?', label: 'Ya, hapus' })}
                              title="Hapus"
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                            >
                              <IconTrash className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
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
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
