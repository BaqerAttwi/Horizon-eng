import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLES = ['owner','head_engineer','stock_manager','accounting','engineer','secretary','technician'];

export default function UpdatesPage() {
  const { isRole } = useAuth();
  const [data, setData] = useState({ updates: [], unread_count: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ version:'', title:'', summary:'', features:'', target_roles:['all'] });

  const load = async () => { try { setData((await api.get('/updates')).data); } catch(e) { toast.error(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const markRead = async update => {
    if (update.is_read) return;
    await api.patch(`/updates/${update.id}/read`);
    setData(previous => ({ ...previous, unread_count: Math.max(0,previous.unread_count-1), updates: previous.updates.map(item=>item.id===update.id?{...item,is_read:1}:item) }));
    window.dispatchEvent(new Event('updates-read'));
  };
  const markAll = async () => { await api.patch('/updates/read-all'); await load(); window.dispatchEvent(new Event('updates-read')); toast.success('All updates marked as read'); };
  const toggleRole = role => setForm(previous => ({ ...previous, target_roles: role==='all' ? ['all'] : [...new Set(previous.target_roles.filter(r=>r!=='all').includes(role)?previous.target_roles.filter(r=>r!==role):[...previous.target_roles.filter(r=>r!=='all'),role])] }));
  const publish = async () => {
    try {
      await api.post('/updates', { ...form, features: form.features.split('\n').map(v=>v.trim()).filter(Boolean), target_roles: form.target_roles.includes('all')?'all':form.target_roles });
      toast.success('Update published'); setShowCreate(false); setForm({version:'',title:'',summary:'',features:'',target_roles:['all']}); await load();
    } catch(e) { toast.error(e.response?.data?.error||e.message); }
  };

  return <div className="page updates-page">
    <div className="page-header"><div><h1 className="page-title">✨ What’s New</h1><p className="page-subtitle">Features and improvements relevant to your role, from version 0 onward</p></div><div style={{display:'flex',gap:8}}>
      {data.unread_count>0&&<button className="btn btn-secondary" onClick={markAll}>✓ Mark all read</button>}
      {isRole('owner')&&<button className="btn btn-primary" onClick={()=>setShowCreate(v=>!v)}>+ Publish Update</button>}
    </div></div>
    {showCreate&&<div className="card update-compose"><div className="card-body"><h3>Publish a role-specific update</h3><div className="form-row"><div className="form-group"><label className="form-label">Version</label><input className="form-input" placeholder="e.g. 2.3" value={form.version} onChange={e=>setForm(p=>({...p,version:e.target.value}))}/></div><div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}/></div></div><div className="form-group"><label className="form-label">Summary</label><textarea className="form-textarea" value={form.summary} onChange={e=>setForm(p=>({...p,summary:e.target.value}))}/></div><div className="form-group"><label className="form-label">Features — one per line</label><textarea className="form-textarea" rows={5} value={form.features} onChange={e=>setForm(p=>({...p,features:e.target.value}))}/></div><div className="form-group"><label className="form-label">Audience</label><div className="update-role-picker"><button className={`badge ${form.target_roles.includes('all')?'badge-blue':'badge-gray'}`} onClick={()=>toggleRole('all')}>All users</button>{ROLES.map(role=><button key={role} className={`badge ${form.target_roles.includes(role)?'badge-purple':'badge-gray'}`} onClick={()=>toggleRole(role)}>{role.replace('_',' ')}</button>)}</div></div><button className="btn btn-primary" onClick={publish}>Publish and notify audience</button></div></div>}
    {loading?<div className="empty"><span className="spinner"/></div>:<div className="updates-timeline">{data.updates.map(update=><article key={update.id} className={`update-card ${update.is_read?'':'unread'}`} onClick={()=>markRead(update)}><div className="update-version">v{update.version}</div><div className="update-content"><div className="update-title-row"><h2>{update.title}</h2>{!update.is_read&&<span className="badge badge-blue">NEW</span>}</div><p>{update.summary}</p><ul>{update.features.map((feature,index)=><li key={index}>✓ {feature}</li>)}</ul><div className="update-footer"><span>{update.target_roles==='all'?'All users':update.target_roles.split(',').map(r=>r.replace('_',' ')).join(' · ')}</span><span>{new Date(update.published_at).toLocaleDateString()}</span></div></div></article>)}</div>}
  </div>;
}
