import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal, Field, inputCls, btnPrimary, Avatar, Notice } from '../lib/ui.jsx';
import { ROLE_BADGE, ROLE_LABEL } from '../lib/format.js';

export default function ProfileModal({ open, onClose }) {
  const { user, setUser } = useAuth();
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setName(user.name || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setNotice('');
    }
  }, [open, user]);

  if (!open || !user) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (newPassword && newPassword.length < 6) {
      setError('Password baru minimal 6 karakter');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok');
      return;
    }
    const body = { name };
    if (newPassword) {
      body.currentPassword = currentPassword;
      body.newPassword = newPassword;
    }
    setSaving(true);
    try {
      const res = await api.patch('/auth/profile', body);
      setUser(res.data);
      setNotice('Profil berhasil diperbarui');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(onClose, 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Profil Saya" onClose={onClose}>
      {error && <div className="mb-4"><Notice tone="warn">{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="success">{notice}</Notice></div>}

      <div className="flex items-center gap-4 pb-5 mb-5 border-b border-gray-100">
        <Avatar name={user.name} className="w-14 h-14 text-lg" />
        <div>
          <div className="font-semibold text-gray-800">{user.name}</div>
          <div className="text-sm text-gray-400">{user.email}</div>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${ROLE_BADGE[user.role] || 'bg-gray-100 text-gray-600'}`}>
            {ROLE_LABEL[user.role] || user.role}
          </span>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama Tampilan">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} placeholder="Nama lengkap" />
        </Field>
        <Field label="Email">
          <input value={user.email} disabled className={`${inputCls} bg-gray-50 text-gray-400`} />
        </Field>
        <Field label="Ganti Password" hint="opsional">
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} placeholder="Password baru (min 6 karakter)" />
        </Field>
        <Field label="Konfirmasi Password Baru">
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} placeholder="Ulangi password baru" />
        </Field>
        <Field label="Password Saat Ini" hint="wajib jika ganti password">
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} placeholder="Password saat ini" />
        </Field>
        <button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </form>
    </Modal>
  );
}
