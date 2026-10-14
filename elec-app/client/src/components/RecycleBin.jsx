import { useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function RecycleBin({ onRestored }) {
  const [open,setOpen] = useState(false);
  const [rows,setRows] = useState([]);
  const [busy,setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { setRows((await api.get('/projects/recycle-bin')).data); }
    catch(e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const restore = async row => {
    setBusy(true);
    try { await api.post('/projects/'+row.id+'/restore'); setRows(v=>v.filter(p=>p.id!==row.id)); await onRestored(); toast.success('Project restored'); }
    catch(e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return <section className="workflow-card">
    <button className="btn btn-secondary" onClick={()=>{if(!open) load();setOpen(v=>!v);}}>Recycle bin</button>
    {open && <div><p>Deleted projects can be restored for one year. Expired projects are automatically permanently deleted.</p>
      {busy && <p role="status">Loading…</p>}
      {!busy && !rows.length && <p>Recycle bin is empty.</p>}
      {rows.map(row=><div key={row.id} style={{padding:12,borderBottom:'1px solid var(--border)'}}>
        <strong>{row.project_name}</strong> · {row.quote_number}
        <p>Deleted {new Date(row.deleted_at).toLocaleDateString()} · Expires {new Date(row.expires_at).toLocaleDateString()}</p>
        <button className="btn btn-primary" disabled={busy} onClick={()=>restore(row)}>Restore project</button>
      </div>)}
    </div>}
  </section>;
}
