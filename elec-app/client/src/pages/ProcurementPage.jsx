import { useConfirmUnsaved, useUnsavedChange } from '../context/UnsavedChangesContext';
import { PROCUREMENT_FILTERS, procurementProgress, matchesProcurementFilter } from '../utils/procurementProgress';
import ItemNoteEditor from '../components/ItemNoteEditor';
import { useEffect,useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProcurementPage() {
  const [searchParams] = useSearchParams();
  const { isRole } = useAuth();
  const confirmUnsaved = useConfirmUnsaved();
  const [statusFilter,setStatusFilter] = useState('all');
  const [crEdits, setCrEdits] = useState({});
  const [savingCr, setSavingCr] = useState(null);
  const canEditCr = isRole('owner','head_engineer');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const selectedProject = searchParams.get('project');
  const [projects,setProjects]=useState([]),[loading,setLoading]=useState(true),[notes,setNotes]=useState({}),[saving,setSaving]=useState(null),[receiving,setReceiving]=useState(null),[receiveQty,setReceiveQty]=useState({});
  const load=async()=>{setRefreshing(true);try{const r=await api.get('/procurement/projects');setProjects(r.data);}catch(e){toast.error(e.message);}finally{setLoading(false);setRefreshing(false);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{if (/^\d+$/.test(selectedProject || '')) setExpanded(v=>({...v,[selectedProject]:true}));},[selectedProject]);
  const query = search.trim().toLocaleLowerCase();
  const searchedProjects = projects.filter(project => [project.project_name, project.quote_number].some(value => (value || '').toLocaleLowerCase().includes(query)));
  const filteredProjects = searchedProjects.filter(project => matchesProcurementFilter(project,statusFilter));
  useEffect(() => {
    if (!loading && /^\d+$/.test(selectedProject || '')) document.getElementById(`procurement-project-${selectedProject}`)?.scrollIntoView({ block:'start' });
  }, [loading, selectedProject]);
  const review=async(project,action)=>{setSaving(project.id);try{await api.patch(`/procurement/projects/${project.id}/review`,{action,note:notes[project.id]||null});toast.success(`Procurement ${action==='approve'?'approved':'rejected'}`);setNotes(v=>({...v,[project.id]:''}));await load();}catch(e){toast.error(e.response?.data?.error||e.message);}finally{setSaving(null);}};
  const receive=async(project,item)=>{const key=`${project.id}-${item.product_id ? 'product-' + item.product_id : 'manual-' + item.manual_item_id}`,quantity=Number(receiveQty[key]);if(!Number.isSafeInteger(quantity)||quantity<1){toast.error('Enter a positive whole quantity for this project');return;}setReceiving(key);try{await api.patch(item.product_id ? `/procurement/projects/${project.id}/products/${item.product_id}/receive` : `/procurement/projects/${project.id}/manual-items/${item.manual_item_id}/receive`,{quantity});toast.success(item.product_id ? `Allocated ${quantity} of ${item.item_name} to this project (stock unchanged)` : `Recorded ${quantity} of ${item.item_name} as arrived`);setReceiveQty(q=>({...q,[key]:''}));await load();}catch(e){toast.error(e.response?.data?.error||e.message);}finally{setReceiving(null);}};
  const saveNote = async(project,occurrence,notes)=>{
    try {
      await api.patch(`/procurement/projects/${project.id}/items/${occurrence.id}/note`,{notes});
      toast.success('Item note saved');
      await load();
      return true;
    } catch(e) { toast.error(e.response?.data?.error || e.message); return false; }
  };
  const saveCr = async (project, item, key) => {
    const text = crEdits[key];
    if (text == null || !text.trim()) return true;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) { toast.error('Enter a valid nonnegative C.R. amount'); return false; }
    setSavingCr(key);
    try {
      await api.post(`/projects/${project.id}/items/bulk-update`, { item_ids: item.crm_item_ids, changes: { cr_amount: value } });
      setCrEdits(v=>({...v,[key]:''}));
      toast.success(`C.R. saved for ${item.crm_item_ids.length} matching item(s) across this project`);
      await load();
      return true;
    } catch(e) { toast.error(e.response?.data?.error || e.message); return false; }
    finally { setSavingCr(null); }
  };
  useUnsavedChange({ dirty: Object.values(crEdits).some(value=>value.trim()), label: 'Procurement C.R. edits', busy: savingCr !== null,
    save: async()=>{
      for(const project of projects) for(const item of project.items) {
        const key=`${project.id}-${item.product_id ? 'product-'+item.product_id : 'manual-'+item.manual_item_id}`;
        if(crEdits[key]?.trim() && await saveCr(project,item,key) === false) return false;
      }
      return true;
    }, discard:()=>setCrEdits({}) });
  useUnsavedChange({ dirty: Object.values(notes).some(value=>value.trim()) || Object.values(receiveQty).some(value=>String(value).trim()), label:'Unsubmitted procurement review notes or allocation/arrival quantities', busy:saving !== null || receiving !== null, discard:()=>{setNotes({});setReceiveQty({});} });
  return <div className="page procurement-page">
    <div className="page-header"><div><div className="page-title">📦 Procurement Queue</div><div className="page-subtitle">Stock Manager, Owner, or Head Engineer approval is required before Assembly</div></div><button className="btn btn-secondary" disabled={refreshing} onClick={()=>load()}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button></div>
    <input className="form-input" style={{marginBottom:16}} aria-label="Search procurement by project name or EQ number" placeholder="Search by project name or EQ number…" value={search} onChange={e=>{const value=e.target.value;confirmUnsaved(()=>setSearch(value));}} />
    <div className="procurement-filters" role="group" aria-label="Filter procurement projects">
      {PROCUREMENT_FILTERS.map(([value,label])=><button key={value} className={`btn btn-sm ${statusFilter===value?'btn-primary':'btn-secondary'}`} aria-pressed={statusFilter===value} onClick={()=>{if(value!==statusFilter) confirmUnsaved(()=>setStatusFilter(value));}}>{label} ({searchedProjects.filter(project=>matchesProcurementFilter(project,value)).length})</button>)}
    </div>
    {loading?<div style={{textAlign:'center',padding:40}}><span className="spinner"/></div>:!projects.length?<div className="empty"><div className="empty-icon">✅</div><p>No projects waiting in Procurement.</p></div>:
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>{!filteredProjects.length && <p>No projects match this search and filter.</p>}{filteredProjects.map(project=><section className="card" id={`procurement-project-${project.id}`} key={project.id} style={{minWidth:0,overflow:'hidden',scrollMarginTop:90,outline:String(project.id)===selectedProject?'2px solid var(--accent2)':undefined}}>
        <div className="card-body"><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}><div style={{minWidth:0,flex:'1 1 220px'}}><h3 style={{margin:0,overflowWrap:'anywhere'}}><button type="button" aria-expanded={!!expanded[project.id]} aria-controls={`procurement-details-${project.id}`} onClick={()=>setExpanded(v=>({...v,[project.id]:!v[project.id]}))} style={{background:'none',border:0,color:'inherit',font:'inherit',padding:0,textAlign:'left',cursor:'pointer'}}>{expanded[project.id] ? '▾' : '▸'} {project.project_name}</button></h3><small style={{color:'var(--muted)'}}>{project.quote_number||`Project #${project.id}`} · Engineer: {project.engineer_name||'Unassigned'}</small></div><span className={`badge ${project.procurement_status==='approved'?'badge-green':project.procurement_status==='rejected'?'badge-red':'badge-yellow'}`}>{project.procurement_status}</span></div>
        <ProcurementProgress project={project}/>
        <div id={`procurement-details-${project.id}`} hidden={!expanded[project.id]}>
        {isRole('owner','head_engineer') && <Link className="btn btn-secondary btn-sm" style={{marginBottom:12}} to={`/projects/${project.id}/crm?edit=1`}>Edit project →</Link>}
        <div className="table-wrap"><table><thead><tr><th>Item</th><th>Description</th><th>Required</th><th>Stock</th><th>Reserved</th><th>Allocated / Received</th><th>Available for Project</th><th>Add Allocation / Arrival</th><th>Notes</th><th>Shortage</th>{canEditCr && <th title="Saves to matching items across all panels and divisions in this project">C.R. (optional)</th>}</tr></thead><tbody>
          {project.items.map((item,index)=>{const key=`${project.id}-${item.product_id ? 'product-' + item.product_id : 'manual-' + item.manual_item_id}`;return <tr key={`${item.product_id||'manual'}-${index}`}><td className="mono">{item.item_name}</td><td>{item.description||'—'}</td><td className="mono">{item.required_qty}</td><td className="mono">{item.stock_qty}</td><td className="mono">{item.reserved_qty}</td><td className="mono" style={{color:item.allocated_qty?'var(--accent2)':'var(--muted)'}}>{item.allocated_qty}</td><td className="mono" style={{fontWeight:700}}>{item.available_for_project}</td><td><div style={{display:'flex',gap:5,minWidth:150}}><input type="number" min="1" step="1" aria-label={`${item.product_id ? 'Allocation' : 'Arrival'} quantity for ${item.item_name}`} className="form-input" style={{width:72,padding:'4px 6px'}} placeholder={item.shortage_qty?String(item.shortage_qty):'Qty'} value={receiveQty[key]||''} onChange={e=>setReceiveQty(q=>({...q,[key]:e.target.value}))}/><button className="btn btn-sm btn-secondary" disabled={receiving===key} onClick={()=>receive(project,item)}>{receiving===key?'...':item.product_id?'+ Add':'+ Arrived'}</button></div></td><td>{(item.note_occurrences || []).map(occurrence=><div key={occurrence.id} style={{marginBottom:8}}>
            <small style={{display:'block',whiteSpace:'normal'}}>Panel {occurrence.panel_number}{occurrence.panel_name ? ' · '+occurrence.panel_name : ''} · {occurrence.division_type} · Item #{occurrence.id}</small>
            <ItemNoteEditor value={occurrence.notes} label={`Note for ${item.item_name}, panel ${occurrence.panel_number}, item ${occurrence.id}`} onSave={notes=>saveNote(project,occurrence,notes)} />
          </div>)}</td><td className="mono" style={{color:item.shortage_qty?'var(--danger)':'var(--success)',fontWeight:700}}>{item.shortage_qty||'✓'}</td>{canEditCr && <td><div style={{display:'flex',gap:5,minWidth:180}}><input type="number" min="0" step="0.01" className="form-input" style={{width:100}} aria-label={`C.R. for ${item.item_name}`} placeholder={item.cr_amount == null ? 'Mixed' : String(item.cr_amount)} value={crEdits[key] ?? ''} onChange={e=>setCrEdits(v=>({...v,[key]:e.target.value}))}/><button className="btn btn-sm btn-secondary" disabled={savingCr===key || !crEdits[key]?.trim() || !item.crm_item_ids?.length} onClick={()=>saveCr(project,item,key)}>{savingCr===key ? 'Saving…' : 'Save C.R.'}</button></div></td>}</tr>})}
          {!project.items.length&&<tr><td colSpan={canEditCr ? 11 : 10}>No CRM items in this project.</td></tr>}
        </tbody></table></div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:12}}><input className="form-input" style={{flex:'1 1 260px'}} placeholder="Review note (required when rejecting)" value={notes[project.id]||''} onChange={e=>setNotes(n=>({...n,[project.id]:e.target.value}))}/><button className="btn btn-danger" disabled={saving===project.id||!notes[project.id]?.trim()} onClick={()=>review(project,'reject')}>Reject</button><button className="btn btn-primary" disabled={saving===project.id||project.shortage_count>0||!project.items.length} onClick={()=>review(project,'approve')}>{project.shortage_count?`${project.shortage_count} shortage(s)`:'Approve Stock →'}</button></div>
        </div></div></section>)}</div>}
  </div>;
}

function ProcurementProgress({project}) {
  const progress=procurementProgress(project);
  return <div className="procurement-progress">
    <div><strong>{progress.ready}/{progress.total} item lines ready · {progress.percent}%</strong><span>{!progress.total ? 'No items' : progress.shortages ? progress.shortages+' item line(s) with shortages' : 'All materials covered'}</span></div>
    <progress max="100" value={progress.percent} aria-label={`Material readiness for ${project.project_name}`}/>
  </div>;
}
