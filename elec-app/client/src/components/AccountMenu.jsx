import { useConfirmUnsaved } from '../context/UnsavedChangesContext';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AccountMenu() {
  const { worker, logout, refreshWorker } = useAuth();
  const navigate = useNavigate();
  const confirmUnsaved = useConfirmUnsaved();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const edit = async () => {
    setOpen(false);
    try {
      const current = await refreshWorker();
      setForm({ name: current.name || '', email: current.email || '', phone: current.phone || '' });
    } catch (error) { toast.error(error.message); }
  };
  const save = async event => {
    event.preventDefault(); setSaving(true);
    try { await api.patch('/auth/me', worker.role === 'owner' ? form : { name: form.name, phone: form.phone }); await refreshWorker(); setForm(null); toast.success('Profile updated'); }
    catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };
  const signOut = async () => {
    setSigningOut(true);
    try { await logout(); navigate('/login'); toast.success('Logged out'); }
    catch (error) { toast.error(error.message); }
    finally { setSigningOut(false); }
  };
  return <>
    <div className="account-menu" ref={root}>
      <button ref={trigger} className="topbar-avatar" aria-label="Account menu" aria-expanded={open} aria-controls="account-options" onClick={() => setOpen(value => !value)}>{worker.name?.slice(0, 1).toUpperCase()}</button>
      {open && <div className="account-options" id="account-options">
        <strong>{worker.name}</strong>
        <button onClick={edit}>Edit Profile</button>
        <button onClick={()=>confirmUnsaved(signOut)} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign Out'}</button>
      </div>}
    </div>
    {form && createPortal(<div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit Profile"><form className="modal" onSubmit={save}>
      <div className="modal-header"><span className="modal-title">Edit Profile</span><button type="button" className="btn-icon" disabled={saving} aria-label="Close profile editor" onClick={() => setForm(null)}>✕</button></div>
      <div className="modal-body">{['name', 'email', 'phone'].map(key => <div className="form-group" key={key}>
        <label className="form-label" htmlFor={`profile-${key}`}>{key[0].toUpperCase() + key.slice(1)}</label>
        <input id={`profile-${key}`} className="form-input" readOnly={key === 'email' && worker.role !== 'owner'} required={key === 'name' || (key === 'email' && worker.role === 'owner')} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} maxLength={key === 'phone' ? 50 : key === 'email' ? 150 : 200} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} />
        {key === 'email' && worker.role !== 'owner' && <small style={{ color: 'var(--muted)' }}>Only the owner can change your email.</small>}
      </div>)}</div>
      <div className="modal-footer"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</button></div>
    </form></div>, document.querySelector('.layout') || document.body)}
  </>;
}
