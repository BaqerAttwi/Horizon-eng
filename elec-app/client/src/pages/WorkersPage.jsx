import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLES = ['owner','accounting','engineer','secretary'];
const ROLE_BADGE = { owner:'badge-purple', accounting:'badge-blue', engineer:'badge-green', secretary:'badge-yellow' };
const ROLE_ICON  = { owner:'👑', accounting:'💼', engineer:'⚙️', secretary:'📋' };

function WorkerModal({ worker, onClose, onSaved }) {
  const [form, setForm] = useState({ name:'', email:'', phone:'', role:'engineer', ...worker });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const r = worker?.id
        ? await api.patch(`/workers/${worker.id}`, form)
        : await api.post('/workers', form);
      toast.success(`✅ Worker "${form.name}" ${worker?.id ? 'updated' : 'created'}`);
      onSaved(r.data, !!worker?.id);
      onClose();
    } catch(e) {
      toast.error('❌ ' + e.message);
      console.error('[Workers] Save error:', e.message);
    } finally { setSaving(false); }
  };

  const f = (k) => ({ value: form[k]||'', onChange: e=>setForm(p=>({...p,[k]:e.target.value})) });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{worker?.id ? 'Edit Worker' : 'Add Worker'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" placeholder="Eng. Ahmed..." {...f('name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Role *</label>
              <select className="form-select" {...f('role')}>
                {ROLES.map(r=><option key={r} value={r}>{ROLE_ICON[r]} {r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="email@company.com" {...f('email')} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" placeholder="+213..." {...f('phone')} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner"/>Saving...</> : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}


function SetPasswordModal({ worker, onClose }) {
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    if (newPass.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      await api.post('/auth/set-password', { worker_id: worker.id, new_password: newPass });
      toast.success(`✅ Password set for "${worker.name}"`);
      onClose();
    } catch(e) { toast.error('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:380}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🔑 Set Password — {worker.name}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--font-mono)',marginBottom:4}}>
            Role: {worker.role} | Email: {worker.email||'not set'}
          </div>
          <div className="form-group">
            <label className="form-label">New Password (min 6 chars)</label>
            <input className="form-input" type="password" placeholder="New password..."
              value={newPass} onChange={e=>setNewPass(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&save()} autoFocus />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner"/>Saving...</> : '💾 Set Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal]     = useState(null); // null | {} | worker obj
  const [roleFilter, setRole] = useState('');
  const [setPassFor, setSetPassFor] = useState(null);
  const { isRole } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/workers', { params: roleFilter ? { role: roleFilter } : {} });
      setWorkers(r.data);
    } catch(e) { toast.error('❌ ' + e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [roleFilter]);

  const del = async (w) => {
    if (!confirm(`Delete "${w.name}"?`)) return;
    try {
      await api.delete(`/workers/${w.id}`);
      setWorkers(ws => ws.filter(x => x.id !== w.id));
      toast.success(`🗑 "${w.name}" removed`);
    } catch(e) { toast.error('❌ ' + e.message); }
  };

  const onSaved = (w, isUpdate) => {
    if (isUpdate) setWorkers(ws => ws.map(x => x.id === w.id ? w : x));
    else          setWorkers(ws => [...ws, w]);
  };

  const counts = ROLES.reduce((acc,r)=>({ ...acc, [r]: workers.filter(w=>w.role===r).length }), {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">👷 Workers</div>
          <div className="page-subtitle">{workers.length} team members</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal({})}>+ Add Worker</button>
      </div>

      {/* Role stats */}
      <div className="stats-row">
        {ROLES.map(r=>(
          <div className="stat-card" key={r} style={{cursor:'pointer',borderColor: roleFilter===r ? 'var(--accent)' : 'var(--border)'}}
            onClick={()=>setRole(roleFilter===r ? '' : r)}>
            <div className="stat-value">{ROLE_ICON[r]} {counts[r]||0}</div>
            <div className="stat-label">{r.charAt(0).toUpperCase()+r.slice(1)}</div>
          </div>
        ))}
      </div>

      <div style={{marginBottom:12,display:'flex',gap:8,alignItems:'center'}}>
        <select className="form-select" style={{width:180}} value={roleFilter} onChange={e=>setRole(e.target.value)}>
          <option value="">All Roles</option>
          {ROLES.map(r=><option key={r} value={r}>{ROLE_ICON[r]} {r}</option>)}
        </select>
        {loading && <span className="spinner"/>}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
            <tbody>
              {!workers.length && !loading && (
                <tr><td colSpan={6}><div className="empty"><div className="empty-icon">👷</div><p>No workers yet.</p></div></td></tr>
              )}
              {workers.map(w=>(
                <tr key={w.id}>
                  <td className="mono" style={{color:'var(--muted)'}}>{w.id}</td>
                  <td style={{fontWeight:600,color:'var(--white)'}}>{ROLE_ICON[w.role]} {w.name}</td>
                  <td><span className={`badge ${ROLE_BADGE[w.role]||'badge-gray'}`}>{w.role}</span></td>
                  <td style={{color:'var(--muted)'}}>{w.email||'—'}</td>
                  <td className="mono">{w.phone||'—'}</td>
                  <td style={{display:'flex',gap:6}}>
                    <button className="btn-icon" title="Edit" onClick={()=>setModal(w)}>✏️</button>
                    {isRole('owner') && <button className="btn-icon" title="Set Password" onClick={()=>setSetPassFor(w)}>🔑</button>}
                    <button className="btn-icon" title="Delete" onClick={()=>del(w)} style={{color:'var(--danger)'}}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {setPassFor && <SetPasswordModal worker={setPassFor} onClose={()=>setSetPassFor(null)} />}
      {modal !== null && <WorkerModal worker={modal.id?modal:undefined} onClose={()=>setModal(null)} onSaved={onSaved} />}
    </div>
  );
}

// NOTE: SetPasswordModal is appended below — imported in WorkersPage via inline definition
