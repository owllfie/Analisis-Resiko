import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useApiGet } from '../api/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Card, CardHeader, Spinner, ErrorBanner, EmptyState, Badge, Modal, Field, inputCls, btnPrimary, btnSecondary, btnDanger,
  Pagination, ConfirmDialog, Avatar, Checkbox, IconPlus, IconEdit, IconTrash,
} from '../lib/ui.jsx';
import { formatDate, ROLE_BADGE, ROLE_LABEL } from '../lib/format.js';

const ROLES = ['superadmin', 'admin', 'manager', 'member'];
const FILTERS = [{ key: '', label: 'Semua' }, ...ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] }))];
const PAGE_SIZE = 10;

const emptyForm = { name: '', email: '', password: '', role: 'member' };

function UserFormModal({ open, onClose, initial, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { name: initial.name || '', email: initial.email || '', password: '', role: initial.role || 'member' } : emptyForm);
      setError('');
    }
  }, [open, initial]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (initial) {
        const body = { name: form.name, role: form.role };
        if (form.password) body.password = form.password;
        await api.patch(`/users/${initial.id}`, body);
      } else {
        await api.post('/users', form);
      }
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
    <Modal title={initial ? 'Ubah Pengguna' : 'Pengguna Baru'} onClose={onClose}>
      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama">
          <input value={form.name} onChange={set('name')} required maxLength={120} className={inputCls} placeholder="Nama lengkap" />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={set('email')} required disabled={!!initial} className={`${inputCls} ${initial ? 'bg-gray-50 text-gray-400' : ''}`} placeholder="nama@gmail.com" />
        </Field>
        <Field label={initial ? 'Password Baru' : 'Password'} hint={initial ? 'kosongkan jika tidak diubah' : 'min 6 karakter'}>
          <input type="password" value={form.password} onChange={set('password')} required={!initial} className={inputCls} placeholder="••••••••" />
        </Field>
        <Field label="Peran">
          <select value={form.role} onChange={set('role')} className={inputCls}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={btnSecondary}>Batal</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => { setPage(1); }, [role]);
  useEffect(() => { setSelected([]); }, [page, role]);

  const path = `/users?limit=${PAGE_SIZE}&page=${page}${role ? `&role=${role}` : ''}`;
  const { data, loading, error, reload } = useApiGet(path, [path]);

  const users = data?.data || [];
  const selectable = users.filter((u) => u.id !== me?.id);
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.includes(u.id));
  const someSelected = selected.length > 0 && !allSelected;

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => {
    if (allSelected) setSelected((s) => s.filter((id) => !selectable.some((u) => u.id === id)));
    else setSelected((s) => Array.from(new Set([...s, ...selectable.map((u) => u.id)])));
  };

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p) => { setEditing(p); setFormOpen(true); };

  const doConfirm = async () => {
    try {
      await api.delete(`/users/${confirm.user.id}`);
      setConfirm(null);
      setSelected((s) => s.filter((id) => id !== confirm.user.id));
      reload();
    } catch (err) {
      setConfirm((c) => ({ ...c, error: err.message }));
    }
  };

  const doBulkDelete = async () => {
    setBulkLoading(true);
    setBulkError('');
    try {
      await api.post('/users/bulk-delete', { ids: selected });
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
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setRole(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                role === f.key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className={btnPrimary}>
          <IconPlus className="w-4 h-4" /> Pengguna Baru
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBanner error={error} onRetry={reload} />
      ) : users.length === 0 ? (
        <Card><EmptyState title="Belum ada pengguna" message="Tambahkan pengguna untuk berkolaborasi." /></Card>
      ) : (
        <Card padded={false}>
          <CardHeader title="Daftar Pengguna" subtitle={`${data.total} pengguna terdaftar`} />
          {selected.length > 0 && (
            <div className="px-6 py-3 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-indigo-700">{selected.length} pengguna dipilih</span>
              <div className="flex items-center gap-2">
                <button className={`${btnSecondary} py-2`} onClick={() => setSelected([])}>Batal</button>
                <button className={`${btnDanger} py-2`} onClick={() => { setBulkError(''); setBulk(true); }}>
                  <IconTrash className="w-4 h-4" /> Hapus Terpilih
                </button>
              </div>
            </div>
          )}
          <div className="table-scroll">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="pl-6 pr-2 py-3 w-10">
                    <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} ariaLabel="Pilih semua pengguna" />
                  </th>
                  <th className="pr-4 py-3 font-semibold">Nama</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Peran</th>
                  <th className="px-4 py-3 font-semibold">Terdaftar</th>
                  <th className="px-6 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition">
                    <td className="pl-6 pr-2 py-3.5">
                      <Checkbox
                        checked={selected.includes(u.id)}
                        onChange={() => toggle(u.id)}
                        ariaLabel={`Pilih ${u.name}`}
                        className={u.id === me?.id ? 'opacity-30 cursor-not-allowed' : ''}
                      />
                    </td>
                    <td className="pr-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} className="w-8 h-8 text-xs" />
                        <span className="font-semibold text-gray-800">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3.5"><Badge tone={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} title="Ubah" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
                          <IconEdit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirm({ user: u, title: 'Hapus Pengguna', message: `Hapus pengguna "${u.name}" (${u.email})?`, label: 'Ya, hapus' })}
                          title="Hapus"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={Math.ceil((data.total || 0) / PAGE_SIZE)} total={data.total} onChange={setPage} />
        </Card>
      )}

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
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
        title="Hapus Pengguna Terpilih"
        message={bulkError ? `Gagal: ${bulkError}` : `Hapus ${selected.length} pengguna terpilih? Mereka akan dipindahkan ke sampah dan bisa dipulihkan.`}
        confirmLabel="Ya, hapus"
        loading={bulkLoading}
        onConfirm={doBulkDelete}
        onCancel={() => { setBulk(false); setBulkError(''); }}
      />
    </div>
  );
}
