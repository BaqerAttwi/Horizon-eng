import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';

function ClientModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({ type:'individual', name:'', tax_id:'', credit_limit:'', phone:'', email:'', address:'', ...client });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const r = client?.id
        ? await api.patch(`/clients/${client.id}`, form)
        : await api.post('/clients', form);
      toast.success(`✅ Client "${form.name}" ${client?.id ? 'updated' : 'created'}`);
      onSaved(r.data, !!client?.id);
      onClose();
    } catch(e) { toast.error('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  const f = k => ({ value: form[k]||'', onChange: e=>setForm(p=>({...p,[k]:e.target.value})) });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{client?.id ? 'Edit Client' : 'Add Client'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" {...f('type')}>
                <option value="individual">👤 Individual</option>
                <option value="company">🏢 Company</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" placeholder="Client name..." {...f('name')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tax ID</label>
              <input className="form-input" placeholder="RC / NIF..." {...f('tax_id')} />
            </div>
            <div className="form-group">
              <label className="form-label">Credit Limit</label>
              <input className="form-input" type="number" placeholder="0" {...f('credit_limit')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" {...f('phone')} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" {...f('email')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-textarea" {...f('address')} />
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

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal]     = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/clients');
      setClients(r.data);
      console.log('[Clients] Loaded:', r.data.length);
    } catch(e) { toast.error('❌ ' + e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const del = async (c) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try {
      await api.delete(`/clients/${c.id}`);
      setClients(cs => cs.filter(x => x.id !== c.id));
      toast.success(`🗑 "${c.name}" removed`);
    } catch(e) { toast.error('❌ ' + e.message); }
  };

  const onSaved = (c, isUpdate) => {
    if (isUpdate) setClients(cs => cs.map(x => x.id===c.id ? c : x));
    else          setClients(cs => [...cs, c]);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏢 Clients</div>
          <div className="page-subtitle">{clients.length} clients registered</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal({})}>+ Add Client</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Name</th><th>Tax ID</th><th>Phone</th><th>Email</th><th>Credit</th><th>Actions</th></tr></thead>
            <tbody>
              {!clients.length && !loading && (
                <tr><td colSpan={7}><div className="empty"><div className="empty-icon">🏢</div><p>No clients yet.</p></div></td></tr>
              )}
              {clients.map(c=>(
                <tr key={c.id}>
                  <td><span className={`badge ${c.type==='company'?'badge-blue':'badge-gray'}`}>{c.type==='company'?'🏢':'👤'} {c.type}</span></td>
                  <td style={{fontWeight:600,color:'var(--white)'}}>{c.name}</td>
                  <td className="mono">{c.tax_id||'—'}</td>
                  <td className="mono">{c.phone||'—'}</td>
                  <td style={{color:'var(--muted)'}}>{c.email||'—'}</td>
                  <td className="mono">{c.credit_limit ? `${Number(c.credit_limit).toFixed(0)} DA` : '—'}</td>
                  <td style={{display:'flex',gap:6}}>
                    <button className="btn-icon" onClick={()=>setModal(c)}>✏️</button>
                    <button className="btn-icon" onClick={()=>del(c)} style={{color:'var(--danger)'}}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && <ClientModal client={modal.id?modal:undefined} onClose={()=>setModal(null)} onSaved={onSaved} />}
    </div>
  );
}
