import { useConfirmUnsaved } from '../context/UnsavedChangesContext';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AccountMenu() {
  const { worker, logout, clearSession, refreshWorker } = useAuth();
  const navigate = useNavigate();
  const confirmUnsaved = useConfirmUnsaved();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState(null);
  const [changingPassword, setChangingPassword] = useState(false);
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
  const changePassword = async event => {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) return toast.error('New passwords do not match');
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', { current_password: passwordForm.current_password, new_password: passwordForm.new_password });
      setPasswordForm(null);
      clearSession();
      navigate('/login');
      toast.success('Password changed. Please log in again.');
    } catch (error) { toast.error(error.message); }
    finally { setChangingPassword(false); }
  };
  return <>
    <div className="account-menu" ref={root}>
      <button ref={trigger} className="topbar-avatar" aria-label="Account menu" aria-expanded={open} aria-controls="account-options" onClick={() => setOpen(value => !value)}>{worker.name?.slice(0, 1).toUpperCase()}</button>
      {open && <div className="account-options" id="account-options">
        <strong>{worker.name}</strong>
        <button onClick={edit}>Edit Profile</button>
        <button onClick={()=>confirmUnsaved(()=>{setOpen(false);setPasswordForm({current_password:'',new_password:'',confirm_password:''});})}>Change Password</button>
        <button onClick={()=>confirmUnsaved(signOut)} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign Out'}</button>
      </div>}
    </div>
    {passwordForm && createPortal(<div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Change password"><form className="modal" onSubmit={changePassword}>
      <div className="modal-header"><strong>Change Password</strong><button type="button" className="btn-icon" aria-label="Close password editor" disabled={changingPassword} onClick={()=>setPasswordForm(null)}>✕</button></div>
      <div className="modal-body">{[['current_password','Current password'],['new_password','New password'],['confirm_password','Confirm new password']].map(([key,label])=><div className="form-group" key={key}>
        <label className="form-label" htmlFor={key}>{label}</label><input id={key} className="form-input" type="password" autoComplete={key==='current_password'?'current-password':'new-password'} required minLength={key==='current_password'?1:6} value={passwordForm[key]} disabled={changingPassword} onChange={e=>setPasswordForm(f=>({...f,[key]:e.target.value}))}/>
      </div>)}<small>You will need to log in again after changing your password.</small></div>
      <div className="modal-footer"><button type="submit" className="btn btn-primary" disabled={changingPassword}>{changingPassword?'Changing…':'Change Password'}</button></div>
    </form></div>,document.querySelector('.layout') || document.body)}
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
