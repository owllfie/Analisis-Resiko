import { useState } from 'react';
import { api } from '../api/client.js';
import { useApiGet } from '../api/useApi.js';
import { Card, CardHeader, Spinner, ErrorBanner, EmptyState, btnPrimary, btnSecondary, Pagination, ConfirmDialog, IconTrash } from '../lib/ui.jsx';

const ENTITIES = [
  { key: '', label: 'Semua' },
  { key: 'projects', label: 'Proyek' },
  { key: 'tasks', label: 'Tugas' },
  { key: 'users', label: 'Pengguna' },
];

export default function Trash() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(null);

  const path = `/trash?limit=10&page=${page}${entity ? `&entity=${entity}` : ''}`;
  const { data, loading, error, reload } = useApiGet(path, [path]);

  const items = data?.data || [];

  const restore = async (e, id) => {
    setMsg('');
    try {
      await api.post(`/trash/${e}/${id}/restore`);
      setMsg('Berhasil dipulihkan');
      reload();
    } catch (err) {
      setMsg('Gagal: ' + err.message);
    }
  };

  const purge = async () => {
    setMsg('');
    try {
      await api.delete(`/trash/${confirm.entity}/${confirm.id}`);
      setConfirm(null);
      setMsg('Item dihapus permanen');
      reload();
    } catch (err) {
      setConfirm((c) => ({ ...c, error: err.message }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex flex-wrap gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-sm">
          {ENTITIES.map((f) => (
            <button key={f.key} onClick={() => { setEntity(f.key); setPage(1); }} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${entity===f.key?'bg-indigo-600 text-white':'text-gray-500 hover:bg-gray-100'}`}>{f.label}</button>
          ))}
        </div>
      </div>
      <Card padded={false}>
        <CardHeader title="Sampah (Soft Delete)" subtitle="Item yang dihapus dapat dipulihkan atau dihapus permanen oleh admin/superadmin" />
        {msg && <div className="px-6 pb-2 text-sm text-gray-600">{msg}</div>}
        {loading ? <Spinner /> : error ? <div className="px-6 py-4"><ErrorBanner error={error} onRetry={reload} /></div> : items.length===0 ? <EmptyState title="Kosong" message="Tidak ada item di sampah" /> : (
          <div className="divide-y divide-gray-50">
            {items.map((it, idx) => (
              <div key={idx} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {it.name}{it.email ? ` (${it.email})` : ''}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {it.entity} • dihapus {new Date(it.deleted_at).toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 text-[11px] font-medium hover:bg-gray-50 transition" onClick={() => restore(it.entity, it.id)}>Pulihkan</button>
                  <button
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-600 text-[11px] font-semibold hover:bg-red-100 transition"
                    onClick={() => setConfirm({ entity: it.entity, id: it.id, name: it.name })}
                  >
                    <IconTrash className="w-3 h-3" /> Hapus permanen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && !error && data && items.length > 0 && <Pagination page={data.page} totalPages={Math.ceil((data.total||0)/(data.limit||10))} total={data.total} onChange={setPage} />}
      </Card>

      <ConfirmDialog
        open={!!confirm}
        title="Hapus Permanen"
        message={confirm?.error ? `Gagal: ${confirm.error}` : `Hapus permanen "${confirm?.name}"? Data ini tidak dapat dipulihkan lagi.`}
        confirmLabel="Ya, hapus permanen"
        onConfirm={purge}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
