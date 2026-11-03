import { Card, CardHeader, Badge, Avatar, IconShield, IconCheck, IconClose, IconInfo } from '../lib/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABEL, ROLE_BADGE } from '../lib/format.js';
import { useApiGet } from '../api/useApi.js';
import { api } from '../api/client.js';
import { useEffect, useMemo, useState } from 'react';

const ROLES_LIST = ['superadmin', 'admin', 'manager', 'member'];

const ROLE_DESC = {
  superadmin: 'Akses penuh tanpa batas, termasuk seluruh halaman dan tindakan administratif.',
  admin: 'Mengelola pengguna, sampah, aktivitas, dan seluruh proyek.',
  manager: 'Mengelola proyek & tugas serta melihat histori pembaruan.',
  member: 'Mengerjakan tugas yang ditugaskan dan memperbarui progresnya.',
};

const GROUP_DESC = {
  Proyek: 'Pengelolaan data proyek dan tugas di dalamnya.',
  Administrasi: 'Tindakan administratif: pengguna, sampah, histori, aktivitas, dan akses.',
  Umum: 'Halaman yang dapat diakses sesuai scope izin.',
};

function Cell({ allowed, locked, canEdit, isSelf, onToggle }) {
  if (!canEdit || locked) {
    if (allowed) {
      return (
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${
            isSelf ? 'bg-indigo-600 text-white' : 'bg-emerald-50 text-emerald-600'
          }`}
          title={locked ? 'Tidak dapat diubah' : 'Diizinkan'}
        >
          <IconCheck className="w-4 h-4" />
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-50 text-gray-300"
        title={locked ? 'Tidak dapat diubah' : 'Tidak diizinkan'}
      >
        <IconClose className="w-4 h-4" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition ${
        allowed
          ? isSelf
            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
          : 'bg-gray-50 text-gray-300 hover:bg-gray-100 hover:text-gray-400'
      }`}
      title={allowed ? 'Klik untuk menolak akses' : 'Klik untuk mengizinkan akses'}
    >
      {allowed ? <IconCheck className="w-4 h-4" /> : <IconClose className="w-4 h-4" />}
    </button>
  );
}



export default function AccessMatrix() {
  const { user } = useAuth();
  const { data, loading, reload } = useApiGet('/permissions');
  const [matrix, setMatrix] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(new Map());

  const catalog = data?.data?.catalog || [];
  const roles = data?.data?.roles || [];

  useEffect(() => {
    if (roles.length) {
      const map = new Map();
      for (const r of roles) {
        for (const p of r.permissions) {
          map.set(`${r.role}:${p.key}`, { allowed: p.allowed, scope: p.scope });
        }
      }
      setMatrix(roles);
      setBaseline(map);
      setDirty(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [baseline, setBaseline] = useState(new Map());

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const item of catalog) {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    }
    return Array.from(groups.entries());
  }, [catalog]);

  const canEdit = user?.role === 'superadmin' || user?.role === 'admin';
  const roleMap = useMemo(() => new Map(matrix.map((r) => [r.role, r])), [matrix]);

  function toggle(role, key, perm) {
    if (!canEdit || perm.locked) return;
    const next = matrix.map((r) => {
      if (r.role !== role) return r;
      return {
        ...r,
        permissions: r.permissions.map((p) => {
          if (p.key !== key) return p;
          const allowed = !p.allowed;
          return { ...p, allowed };
        }),
      };
    });
    setMatrix(next);
    const keyId = `${role}:${key}`;
    const base = baseline.get(keyId);
    const cur = next.find((r) => r.role === role).permissions.find((p) => p.key === key);
    if (base && base.allowed === cur.allowed && base.scope === cur.scope) {
      const d = new Map(dirty);
      d.delete(keyId);
      setDirty(d);
    } else {
      const d = new Map(dirty);
      d.set(keyId, { role, permissionKey: key, allowed: cur.allowed, scope: cur.scope });
      setDirty(d);
    }
  }

  async function save() {
    if (dirty.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.put('/permissions', { updates: Array.from(dirty.values()) });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card padded={false}>
        <CardHeader
          title="Matriks Hak Akses"
          subtitle={canEdit ? 'Klik ikon untuk mengubah izin per peran. Perubahan langsung memengaruhi seluruh sistem.' : 'Ringkasan izin tiap peran terhadap fitur aplikasi'}
          actions={
            <div className="flex items-center gap-2">
              {dirty.size > 0 && canEdit && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : `Simpan ${dirty.size} perubahan`}
                </button>
              )}
              <Badge tone="bg-indigo-50 text-indigo-700"><IconShield className="w-3.5 h-3.5 mr-1 inline" />Peran & Izin</Badge>
            </div>
          }
        />

        <div className="p-6 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ROLES_LIST.map((role) => (
            <div
              key={role}
              className={`rounded-xl border p-4 ${
                user?.role === role ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Avatar name={ROLE_LABEL[role]} className="w-9 h-9 text-xs" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 text-sm">{ROLE_LABEL[role]}</span>
                    {user?.role === role && <Badge tone="bg-indigo-600 text-white">Anda</Badge>}
                  </div>
                  <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${ROLE_BADGE[role]}`}>
                    {role}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-500 leading-relaxed">{ROLE_DESC[role]}</p>
            </div>
          ))}
        </div>

        {error && <div className="px-6 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>}

        <div className="table-scroll">
          <table className="w-full text-sm min-w-[860px] table-fixed">
            <colgroup>
              <col className="w-auto" />
              {ROLES_LIST.map((role) => (
                <col key={role} style={{ width: '16%' }} />
              ))}
            </colgroup>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-6 py-3 font-semibold">Fitur</th>
                {ROLES_LIST.map((role) => (
                  <th key={role} className="px-4 py-3 font-semibold text-center">
                    <span className={user?.role === role ? 'text-indigo-600' : ''}>{ROLE_LABEL[role]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {loading && (
              <tbody>
                <tr>
                  <td colSpan={ROLES_LIST.length + 1} className="px-6 py-8 text-center text-gray-400">Memuat matriks...</td>
                </tr>
              </tbody>
            )}
            {!loading &&
              grouped.map(([group, items]) => (
                <tbody key={group}>
                  <tr className="bg-gray-50/70">
                    <td colSpan={ROLES_LIST.length + 1} className="px-6 py-2.5">
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{group}</div>
                      <div className="text-[11px] text-gray-400">{GROUP_DESC[group]}</div>
                    </td>
                  </tr>
                  {items.map((item) => {
                    const permDef = roleMap.get('admin')?.permissions?.find((p) => p.key === item.key);
                    return (
                      <tr key={item.key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition">
                        <td className="px-6 py-3">
                          <div className="font-medium text-gray-800">{item.label}</div>
                          <div className="text-xs text-gray-400">{item.description}</div>
                        </td>
                        {ROLES_LIST.map((role) => {
                          const roleData = roleMap.get(role);
                          const perm = roleData?.permissions?.find((p) => p.key === item.key) || {
                            allowed: false,
                            scope: 'all',
                            locked: false,
                          };
                          return (
                            <td key={role} className="px-4 py-3 text-center">
                              <div className="flex justify-center">
                                <Cell
                                  allowed={perm.allowed}
                                  locked={perm.locked}
                                  canEdit={canEdit}
                                  isSelf={user?.role === role && perm.allowed}
                                  onToggle={() => toggle(role, item.key, perm)}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <IconInfo className="w-5 h-5" />
          </span>
          <div className="text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-800">Catatan</p>
            <ul className="mt-1.5 list-disc list-inside space-y-1 text-gray-500">
              <li>
                <span className="font-medium text-gray-700">Super Admin</span> — beberapa izin kunci dikunci agar tidak mengunci sistem.
              </li>
              <li>Peran diubah melalui halaman <span className="font-medium text-gray-700">Manajemen Pengguna</span>.</li>
              <li>Izin ini berlaku langsung ke seluruh API dan halaman sesuai aturan yang dikonfigurasi.</li>
              {canEdit && <li className="font-medium text-indigo-600">Mode edit aktif — klik ikon untuk mengubah izin.</li>}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
