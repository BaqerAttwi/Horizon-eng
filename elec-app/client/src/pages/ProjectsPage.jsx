import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';

const STATUS_BADGE = { draft:'badge-gray', active:'badge-blue', completed:'badge-green', cancelled:'badge-red' };
const APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };
const ADMIN_APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };
const PROJECT_STAGES = ['design','quotation','approval','procurement','assembly','testing','delivered'];

function ProjectStageBar({ project, onChanged, canManage }) {
  const current = PROJECT_STAGES.indexOf(project.project_stage || 'design');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const change = async stage => {
    setSaving(true);
    try { const r = await api.patch(`/projects/${project.id}/stage`, { stage, note: note.trim() || null }); onChanged(r.data); setNote(''); toast.success(`Project moved to ${stage}`); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };
  const nextStage = PROJECT_STAGES[current + 1];
  const engineerCanAdvance = current < PROJECT_STAGES.indexOf('quotation');
  const awaitingStock = project.project_stage === 'procurement' && project.procurement_status !== 'approved';
  const canAdvance = nextStage && (canManage || engineerCanAdvance) && !awaitingStock;
  return <section className="workflow-card" aria-label="Project workflow">
    <div className="workflow-heading">
      <div><span className="workflow-eyebrow">Project workflow</span><strong>{PROJECT_STAGES[current]}</strong></div>
      <span className="badge badge-blue">Step {current + 1} of {PROJECT_STAGES.length}</span>
    </div>
    <div className="workflow-track">
      {PROJECT_STAGES.map((stage,index)=><div key={stage} className={`workflow-step ${index<current?'complete':''} ${index===current?'current':''}`}>
        <span className="workflow-dot">{index < current ? '✓' : index + 1}</span><span>{stage}</span>
      </div>)}
    </div>
    {nextStage ? <div className="workflow-action">
      <input className="form-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional progress note…" aria-label="Stage progress note" />
      <button className="btn btn-primary" disabled={!canAdvance || saving} onClick={()=>change(nextStage)}>
        {saving ? <><span className="spinner"/> Saving</> : `Move to ${nextStage} →`}
      </button>
      {!canAdvance && !awaitingStock && <span className="workflow-lock">Management approval is required for the next stage.</span>}
      {awaitingStock && <span className="workflow-lock">📦 Waiting for Stock Manager approval{project.procurement_status==='rejected'&&project.procurement_note?`: ${project.procurement_note}`:''}.</span>}
      {canManage && current > 0 && <select className="form-select workflow-back" defaultValue="" disabled={saving} onChange={e=>{ if(e.target.value) change(e.target.value); e.target.value=''; }} aria-label="Move project to an earlier stage">
        <option value="">Move back…</option>{PROJECT_STAGES.slice(0,current).map(stage=><option key={stage} value={stage}>{stage}</option>)}
      </select>}
    </div> : <div className="workflow-complete">✓ Workflow complete — project delivered</div>}
  </section>;
}

// ── Notification Bell ────────────────────────────────────────
function DraftNotification() {
  const { isRole } = useAuth();
  const [notify, setNotify] = useState(null);

  useEffect(() => {
    if (isRole('engineer', 'head_engineer', 'owner')) {
      api.get('/projects/draft-notifications')
        .then(r => { if (r.data.count > 0) setNotify(r.data); })
        .catch(() => {});
    }
  }, []);

  if (!notify || notify.count === 0) return null;

  return (
    <Link to="/projects" style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 200,
      background: notify.urgent > 0 ? 'var(--danger)' : 'var(--accent2)',
      color: '#fff', padding: '12px 18px', borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', textDecoration: 'none', maxWidth: 320,
    }}>
      🔔 You have <strong>{notify.count} draft</strong>{notify.count > 1 ? ' projects' : ' project'} to work on
      {notify.urgent > 0 && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9 }}>⚠ {notify.urgent} urgent!</div>}
    </Link>
  );
}

// ── Create/Edit Project Modal ─────────────────────────────────
function ProjectModal({ project, onClose, onSaved }) {
  const { worker, isRole } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_name: '', quote_number: '', engineer_id: '', client_id: '',
    exchange_rate_eur_usd: 1.18, deadline: '', notes: '', total_panels: 0, vat_pct: 0,
      project_discount_pct: 0, margin_warning_pct: 10, payment_terms: '70% at order, 30% after inspection', client_pdf_note: '',
    ...(project ? {
      project_name: project.project_name,
      quote_number: project.quote_number || '',
      engineer_id: project.engineer_id || '',
      client_id: project.client_id || '',
      exchange_rate_eur_usd: project.exchange_rate_eur_usd || 1.18,
      deadline: project.deadline?.split('T')[0] || '',
      notes: project.notes || '',
      client_pdf_note: project.client_pdf_note || '',
      total_panels: project.total_panels || 0,
      vat_pct: parseFloat(project.vat_pct) || 0,
      project_discount_pct: parseFloat(project.project_discount_pct) || 0,
      margin_warning_pct: parseFloat(project.margin_warning_pct) || 10,
      payment_terms: project.payment_terms || '70% at order, 30% after inspection',
    } : {}),
  });

  const isEngineer = isRole('engineer');

  useEffect(() => {
    api.get('/workers', { params: { role: 'engineer' } }).then(r => setWorkers(r.data));
    api.get('/clients').then(r => setClients(r.data));
  }, []);

  // Auto-fill engineer from logged-in user (engineers can't change it)
  useEffect(() => {
    if (isEngineer && !project && worker) {
      setForm(f => ({ ...f, engineer_id: worker.id }));
    }
  }, [worker, isEngineer, project]);

  const save = async () => {
    if (!form.project_name.trim()) { toast.error('Project name is required'); return; }
    setSaving(true);
    try {
      const payload = isEngineer
        ? Object.fromEntries(Object.entries(form).filter(([key]) => !['engineer_id','margin_warning_pct'].includes(key)))
        : form;
      const r = project?.id
        ? await api.patch(`/projects/${project.id}`, payload)
        : await api.post('/projects', payload);
      toast.success(`✅ Project "${form.project_name}" ${project?.id ? 'updated' : 'created'}`);
      onSaved(r.data, !!project?.id);
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const f = k => ({ value: form[k] || '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{project?.id ? 'Edit Project' : '+ New Project CRM'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Project Name *</label>
            <input className="form-input" placeholder="e.g. Hospital Electrical Upgrade 2025..." {...f('project_name')} />
          </div>
          <div className="form-group">
            <label className="form-label">Quotation Number</label>
            <input className="form-input" placeholder="Leave blank to generate automatically" {...f('quote_number')} />
            <small style={{ color: 'var(--muted)' }}>Must be unique across all projects.</small>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Engineer</label>
              <select className="form-select" {...f('engineer_id')} disabled={isEngineer}
                style={isEngineer ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
                {isEngineer && worker ? <option value={worker.id}>⚙️ {worker.name} (you)</option> :
                  <><option value="">— Select Engineer —</option>
                  {workers.map(w => <option key={w.id} value={w.id}>⚙️ {w.name}</option>)}</>}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Client</label>
              <select className="form-select" {...f('client_id')}>
                <option value="">— Select Client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.type === 'company' ? '🏢' : '👤'} {c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Deadline</label>
              <input className="form-input" type="date" {...f('deadline')} />
            </div>
            <div className="form-group">
              <label className="form-label">Total Panels Planned</label>
              <input type="number" className="form-input" min={0} value={form.total_panels}
                onChange={e => setForm(p => ({ ...p, total_panels: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">EUR→USD Rate</label>
              <input type="number" step="0.0001" className="form-input" value={form.exchange_rate_eur_usd}
                onChange={e => setForm(p => ({ ...p, exchange_rate_eur_usd: parseFloat(e.target.value) || 1.18 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">VAT (%)</label>
              <input type="number" step="0.01" min="0" max="100" className="form-input" value={form.vat_pct}
                onChange={e => setForm(p => ({ ...p, vat_pct: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Project Discount (%)</label>
              <input type="number" step="0.01" min="0" max="100" className="form-input" value={form.project_discount_pct}
                onChange={e => setForm(p => ({ ...p, project_discount_pct: parseFloat(e.target.value) || 0 }))} />
            </div>
            {isRole('owner','head_engineer') && <div className="form-group"><label className="form-label">Low Margin Warning (%)</label><input type="number" min="0" max="100" step="0.1" className="form-input" value={form.margin_warning_pct} onChange={e=>setForm(p=>({...p,margin_warning_pct:parseFloat(e.target.value)||0}))}/></div>}
          </div>
          <div className="form-group">
            <label className="form-label">Payment Terms</label>
            <textarea className="form-textarea" rows={2} value={form.payment_terms}
              onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Client PDF Note</label>
            <textarea className="form-textarea" rows={3} value={form.client_pdf_note}
              onChange={e => setForm(p => ({ ...p, client_pdf_note: e.target.value }))}
              placeholder="Note displayed under pricing on Client PDF..." />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" placeholder="Project notes..." {...f('notes')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" />Saving...</> : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project Detail Modal ──────────────────────────────────────
function ProjectDetailModal({ projectId, onClose, onUpdated }) {
  const { isRole } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfType, setPdfType] = useState(null);
  const [showClientExport, setShowClientExport] = useState(false);
  const [clientExport, setClientExport] = useState({
    format: 'quotation', quoteNumber: '', quoteDate: new Date().toISOString().slice(0, 10), expiryDate: '',
    projectName: '', buyerName: '', buyerAddress: '', buyerPhone: '', buyerContact: '', buyerEmail: '', buyerVat: '',
    paymentTerms: '', validity: '2 weeks', deliveryTime: 'TBD', currency: '$', incoterm: 'Ex-work workshop in Beirut',
    additionalInfo: '', signatoryName: '', documentCode: 'HPS-COM-PR02-L02', edition: '1',
  });
  const [clientRejectNote, setClientRejectNote] = useState('');
  const [collaborators, setCollaborators] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [inviteEngId, setInviteEngId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [expandedRevision, setExpandedRevision] = useState(null);
  const [restoringRevision, setRestoringRevision] = useState(null);
  const [revisionSnapshots, setRevisionSnapshots] = useState({});
  const [loadingSnapshot, setLoadingSnapshot] = useState(null);

  useEffect(() => {
    if (!project) return;
    api.get(`/projects/${projectId}/engineers`).then(r => setCollaborators(r.data)).catch(() => {});
    if (isRole('owner','head_engineer','engineer')) {
      api.get('/workers').then(r => setWorkers(r.data.filter(w => w.role === 'engineer'))).catch(() => {});
    }
  }, [project?.id]);

  const handleInvite = async () => {
    if (!inviteEngId) { toast.error('Select an engineer'); return; }
    setInviting(true);
    try {
      await api.post('/engineer-requests', { project_id: projectId, target_engineer_id: parseInt(inviteEngId) });
      toast.success('Invitation sent');
      setInviteEngId('');
    } catch (e) { toast.error(e.message); }
    finally { setInviting(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/projects/${projectId}`);
      setProject(r.data);
      api.get(`/projects/${projectId}/quotation-revisions`).then(x=>setRevisions(x.data)).catch(()=>{});
    } catch (e) { toast.error(e.message); onClose(); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!project) return;
    const expiry = new Date(); expiry.setDate(expiry.getDate() + 14);
    setClientExport(previous => ({ ...previous,
      projectName: previous.projectName || project.project_name || '',
      quoteNumber: previous.quoteNumber || project.quote_number || '',
      buyerName: previous.buyerName || project.client_name || '',
      paymentTerms: previous.paymentTerms || project.payment_terms || '',
      expiryDate: previous.expiryDate || expiry.toISOString().slice(0, 10),
    }));
  }, [project?.id]);

  const changeClientApproval = async (client_approval) => {
    setUpdating(true);
    try {
      const payload = { client_approval };
      if (client_approval === 'rejected') {
        payload.client_rejection_note = clientRejectNote;
      }
      const r = await api.patch(`/projects/${projectId}`, payload);
      setProject(p => ({ ...p, ...r.data }));
      if (client_approval !== 'rejected') setClientRejectNote('');
      onUpdated && onUpdated(r.data);
      toast.success(`✅ Client ${client_approval === 'approved' ? 'Approved' : client_approval === 'rejected' ? 'Rejected' : 'Pending'}`);
    } catch (e) { toast.error(e.message); }
    finally { setUpdating(false); }
  };

  const changeAdminApproval = async (admin_approval) => {
    setUpdating(true);
    try {
      const r = await api.patch(`/projects/${projectId}/admin-approval`, { admin_approval });
      setProject(p => ({ ...p, ...r.data }));
      onUpdated && onUpdated(r.data);
      toast.success(`✅ Admin Approval → ${admin_approval}`);
    } catch (e) { toast.error(e.message); }
    finally { setUpdating(false); }
  };

  const handleExportPdf = async (type, fields = {}) => {
    setPdfExporting(true);
    setPdfType(type);
    try {
      const { exportProjectPdf } = await import('../utils/pdfExport');
      await exportProjectPdf(projectId, type, fields);
      toast.success('✅ PDF exported');
    } catch (e) { toast.error('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); setPdfType(null); }
  };

  const createRevision = async () => {
    const notes = window.prompt('Revision notes (optional):') ?? null;
    if (notes === null) return;
    try { const r=await api.post(`/projects/${projectId}/quotation-revisions`,{notes}); setRevisions(v=>[r.data,...v]); toast.success(`Created ${project.quote_number}-R${r.data.revision_number}`); }
    catch(e){ toast.error(e.response?.data?.error||e.message); }
  };

  const restoreRevision = async revision => {
    if (!window.confirm(`Restore ${revision.quote_number}-R${revision.revision_number}? The current quotation will be backed up automatically first.`)) return;
    setRestoringRevision(revision.id);
    try {
      const r = await api.post(`/projects/${projectId}/quotation-revisions/${revision.id}/restore`);
      toast.success(r.data.message);
      await load();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setRestoringRevision(null); }
  };

  const toggleRevision = async revision => {
    if (expandedRevision === revision.id) { setExpandedRevision(null); return; }
    setExpandedRevision(revision.id);
    if (!revision.has_snapshot || revisionSnapshots[revision.id]) return;
    setLoadingSnapshot(revision.id);
    try {
      const r = await api.get(`/projects/${projectId}/quotation-revisions/${revision.id}/snapshot`);
      setRevisionSnapshots(previous => ({ ...previous, [revision.id]: r.data }));
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setLoadingSnapshot(null); }
  };

  if (loading) return <div className="modal-overlay"><div className="modal"><div className="modal-body" style={{ textAlign: 'center', padding: 40 }}><span className="spinner" />&nbsp; Loading...</div></div></div>;
  if (!project) return null;

  const progressPct = project.total_panels > 0 ? Math.round((project.completed_panels / project.total_panels) * 100) : 0;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <div className="modal-title">🔧 {project.project_name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                ID: {project.id} • Engineer: {project.engineer_name || '—'} • Client: {project.client_name || '—'}
              </div>
            </div>
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">

            <div style={{fontSize:11,color:'var(--muted)'}}>Quotation: <strong>{project.quote_number}</strong>{revisions[0] ? ` • Latest revision R${revisions[0].revision_number}` : ''}</div>
            <ProjectStageBar project={project} canManage={isRole('owner','head_engineer')} onChanged={p=>{setProject(v=>({...v,...p}));onUpdated?.(p);}} />
            {isRole('owner','head_engineer') && revisions.length > 0 && <section className="revision-history">
              <div className="revision-history-head">
                <div><span className="workflow-eyebrow">Quotation records</span><strong>Revision History</strong></div>
                <span className="badge badge-purple">{revisions.length} saved</span>
              </div>
              <div className="revision-list">
                {revisions.map(revision => {
                  const snapshot = revisionSnapshots[revision.id] || null;
                  const panelCount = snapshot?.panels?.length || 0;
                  const itemCount = snapshot?.panels?.reduce((sum,p)=>sum+(p.divisions||[]).reduce((s,d)=>s+(d.items||[]).length,0),0) || 0;
                  const open = expandedRevision === revision.id;
                  return <div className="revision-record" key={revision.id || revision.revision_number}>
                    <div className="revision-item">
                      <span className="revision-code">{revision.revision_number === 0 ? 'Original' : `R${revision.revision_number}`}</span>
                      <div className="revision-info"><strong>{revision.quote_number}{revision.revision_number > 0 ? `-R${revision.revision_number}` : ''}</strong><span>{revision.notes || 'No revision note'}</span></div>
                      <div className="revision-meta"><strong>${Number(revision.total_with_vat ?? revision.total_price ?? 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>{revision.created_by_name || 'Management'} · {revision.created_at ? new Date(revision.created_at).toLocaleDateString() : 'Just now'}</span></div>
                      <button className="btn btn-sm btn-secondary" onClick={()=>toggleRevision(revision)}>{open?'Hide':'View items'}</button>
                    </div>
                    {open && <div className="revision-detail">
                      {loadingSnapshot === revision.id ? <div className="tint-box"><span className="spinner"/> Loading saved items…</div> : !revision.has_snapshot ? <div className="tint-box">This older revision saved totals only. Full item history starts with newly created revisions.</div> : !snapshot ? null : <>
                        <div className="revision-summary"><span>{panelCount} panels</span><span>{itemCount} item lines</span><span>VAT {Number(snapshot.project?.vat_pct||0)}%</span><span>Discount {Number(snapshot.project?.project_discount_pct||0)}%</span></div>
                        {(snapshot.panels||[]).map(panel=><div className="revision-panel" key={panel.id}>
                          <strong>{panel.panel_name || `Panel ${panel.panel_number}`} × {panel.quantity || 1}</strong>
                          {(panel.divisions||[]).map(div=><div key={div.id} className="revision-division"><span>{div.division_type}</span><ul>{(div.items||[]).slice(0,100).map(item=><li key={item.id}><span>{item.reference || item.custom_name || item.product_description || 'Manual item'}</span><b>× {item.qty}</b><em>${Number(item.totalfinalProduct||0).toFixed(2)}</em></li>)}</ul>{(div.items||[]).length>100&&<small>+ {(div.items||[]).length-100} more item lines</small>}</div>)}
                        </div>)}
                        {isRole('owner') && <button className="btn btn-danger btn-sm" disabled={restoringRevision===revision.id} onClick={()=>restoreRevision(revision)}>{restoringRevision===revision.id?'Restoring…':'Restore this version'}</button>}
                      </>}
                    </div>}
                  </div>;
                })}
              </div>
            </section>}
            {isRole('owner','head_engineer') && Number(project.total_price)>0 && (()=>{const margin=((Number(project.total_price)-Number(project.total_cost||0))/Number(project.total_price))*100;return margin<Number(project.margin_warning_pct||10)?<div style={{padding:10,border:'1px solid var(--danger)',borderRadius:7,color:'var(--danger)',marginBottom:8}}>⚠ Margin {margin.toFixed(1)}% is below the {Number(project.margin_warning_pct||10)}% warning threshold.</div>:null;})()}

            {/* Stats summary */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Admin Approval</div>
                <div className="stat-value" style={{ fontSize: 16, color: project.admin_approval === 'approved' ? 'var(--success)' : project.admin_approval === 'rejected' ? 'var(--danger)' : 'var(--accent2)' }}>
                  {project.admin_approval || 'pending'}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Client Approval</div>
                <div className="stat-value" style={{ fontSize: 16, color: project.client_approval === 'approved' ? 'var(--success)' : project.client_approval === 'rejected' ? 'var(--danger)' : 'var(--accent2)' }}>
                  {project.client_approval}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Status</div>
                <div className="stat-value" style={{ fontSize: 16 }}>{project.status}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Price</div>
                <div className="stat-value" style={{ fontSize: 16, color: 'var(--success)' }}>${parseFloat(project.total_price || 0).toFixed(0)}</div>
              </div>
              {parseFloat(project.project_discount_pct) > 0 && (
                <div className="stat-card">
                  <div className="stat-label">Discount ({parseFloat(project.project_discount_pct)}%)</div>
                  <div className="stat-value" style={{ fontSize: 16, color: 'var(--danger)' }}>-${parseFloat(project.project_discount_amount || 0).toFixed(0)}</div>
                </div>
              )}
              {parseFloat(project.vat_pct) > 0 && (
                <div className="stat-card">
                  <div className="stat-label">VAT ({parseFloat(project.vat_pct)}%)</div>
                  <div className="stat-value" style={{ fontSize: 16, color: 'var(--accent2)' }}>${parseFloat(project.total_vat || 0).toFixed(0)}</div>
                </div>
              )}
            </div>

            {/* Badges row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`badge ${ADMIN_APPROVAL_BADGE[project.admin_approval] || 'badge-gray'}`}>
                👑 Admin: {project.admin_approval || 'pending'}
              </span>
              <span className={`badge ${APPROVAL_BADGE[project.client_approval] || 'badge-gray'}`}>
                🏢 Client: {project.client_approval}
              </span>
              <span className={`badge ${STATUS_BADGE[project.status] || 'badge-gray'}`}>{project.status}</span>
              {project.deadline && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                📅 Deadline: {project.deadline?.split('T')[0] || project.deadline}
              </span>}
            </div>

            {/* Progress bar */}
            {project.total_panels > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Progress: {progressPct}% ({project.completed_panels}/{project.total_panels} panels)</div>
                <div style={{ height: 8, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${progressPct}%`, height: '100%', background: progressPct >= 80 ? 'var(--success)' : progressPct >= 40 ? 'var(--accent2)' : 'var(--danger)', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            {/* ── Owner: Admin Approval Section ── */}
            {isRole('owner','head_engineer') && (
              <div style={{ background: 'rgba(26,95,168,0.05)', borderRadius: 8, padding: 14, border: '1px solid rgba(26,95,168,0.2)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>👑 Owner Controls</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4 }}>Admin Approval:</span>
                  {['pending', 'approved', 'rejected'].map(a => (
                    <button key={a} className={`btn btn-sm ${project.admin_approval === a ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={project.admin_approval === a || updating}
                      onClick={() => changeAdminApproval(a)}
                      style={a === 'approved' ? { background: 'rgba(34,197,94,0.2)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' } : a === 'rejected' ? { background: 'rgba(239,68,68,0.2)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' } : {}}>
                      {a === 'approved' ? '✓' : a === 'rejected' ? '✕' : '—'} {a}
                    </button>
                  ))}
                </div>
                {project.rejection_note && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--danger)', padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                    ⚠ Rejection note: {project.rejection_note}
                  </div>
                )}
              </div>
            )}

            {/* ── Client Approval (only after admin approved) ── */}
            {project.admin_approval === 'approved' && (
              <div style={{ background: 'rgba(34,197,94,0.04)', borderRadius: 8, padding: 14, border: '1px solid rgba(34,197,94,0.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>🏢 Client Approval</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['pending', 'approved', 'rejected'].map(a => (
                    <button key={a} className={`btn btn-sm ${project.client_approval === a ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={project.client_approval === a || updating}
                      onClick={() => changeClientApproval(a)}>{a}</button>
                  ))}
                </div>
                {project.client_approval === 'rejected' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Rejection reason (visible to all):</div>
                    <textarea className="form-textarea" style={{ minHeight: 50, fontSize: 12 }}
                      placeholder="Why was it rejected?"
                      value={clientRejectNote || project.client_rejection_note || ''}
                      onChange={e => setClientRejectNote(e.target.value)} />
                  </div>
                )}
                {project.client_approval === 'rejected' && project.client_rejection_note && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)', padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                    ⚠ {project.client_rejection_note}
                  </div>
                )}
              </div>
            )}

            {/* ── Collaborators ── */}
            <div style={{ background: 'rgba(99,102,241,0.04)', borderRadius: 8, padding: 14, border: '1px solid rgba(99,102,241,0.15)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>🤝 Collaborators</div>
              {collaborators.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {collaborators.map(c => (
                    <span key={c.id} className="badge badge-purple">
                      {c.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>No collaborators yet</div>
              )}
              {isRole('owner','head_engineer','engineer') && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="form-input" style={{ flex: 1, fontSize: 12 }} value={inviteEngId} onChange={e => setInviteEngId(e.target.value)}>
                    <option value="">Select engineer...</option>
                    {workers.filter(w => w.id !== project.engineer_id && !collaborators.some(c => c.id === w.id)).map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-primary" disabled={inviting || !inviteEngId} onClick={handleInvite}>
                    {inviting ? '...' : 'Invite'}
                  </button>
                </div>
              )}
            </div>

            {/* ── Action Buttons ── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button className="btn btn-primary" onClick={() => { onClose(); window.open(`/projects/${project.id}/crm`, '_blank'); }}>
                📋 Open CRM Editor
              </button>
              {isRole('owner') || (isRole('head_engineer', 'engineer') && project.client_approval !== 'approved') ? (
                <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>
                  ✏️ Edit Project
                </button>
              ) : null}
              {isRole('owner') && (
                <button className="btn btn-secondary" onClick={() => handleExportPdf('owner')} disabled={pdfExporting}
                  style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {pdfExporting && pdfType === 'owner' ? <><span className="spinner" />Exporting...</> : '📄 Export PDF (Owner)'}
                </button>
              )}
              {isRole('owner','head_engineer') && <button className="btn btn-secondary" onClick={createRevision}>🧾 Create Quotation Revision</button>}
              <button className="btn btn-secondary" onClick={() => window.open(`/projects/${project.id}/client-export`, '_blank')} disabled={pdfExporting}
                style={{ background: 'rgba(26,95,168,0.1)', color: 'var(--accent)', border: '1px solid rgba(26,95,168,0.2)' }}>
                📄 Export for Client
              </button>
            </div>

            {false && showClientExport && (
              <div style={{ marginTop: 12, padding: 14, border: '1px solid rgba(26,95,168,0.3)', borderRadius: 8, background: 'rgba(26,95,168,0.05)' }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Client PDF Export</div>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Document Type</label><select className="form-input" value={clientExport.format} onChange={e => setClientExport(p => ({ ...p, format: e.target.value }))}><option value="quotation">Quotation</option><option value="technical">Technical Quotation</option></select></div>
                  <div className="form-group"><label className="form-label">Quotation Number *</label><input className="form-input" value={clientExport.quoteNumber} placeholder="e.g. EQ260068" onChange={e => setClientExport(p => ({ ...p, quoteNumber: e.target.value }))} /></div>
                  {clientExport.format === 'quotation' ? <>
                    {[['quoteDate','Quotation Date','date'],['expiryDate','Expiry Date','date'],['projectName','Project'],['buyerName','Buyer Name'],['buyerAddress','Buyer Address'],['buyerPhone','Buyer Phone'],['buyerContact','Contact Person'],['buyerEmail','Buyer Email','email'],['buyerVat','Buyer VAT #'],['paymentTerms','Payment Terms'],['validity','Validity'],['deliveryTime','Delivery Time'],['currency','Currency Symbol'],['incoterm','Incoterm'],['signatoryName','Signatory Name']].map(([name, label, type = 'text']) => (
                      <div className="form-group" key={name}><label className="form-label">{label}</label><input type={type} className="form-input" value={clientExport[name]} onChange={e => setClientExport(p => ({ ...p, [name]: e.target.value }))} /></div>
                    ))}
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Additional Info (one item per line)</label><textarea className="form-textarea" rows={3} value={clientExport.additionalInfo} onChange={e => setClientExport(p => ({ ...p, additionalInfo: e.target.value }))} /></div>
                  </> : <>
                    <div className="form-group"><label className="form-label">Document Code</label><input className="form-input" value={clientExport.documentCode} onChange={e => setClientExport(p => ({ ...p, documentCode: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Edition</label><input className="form-input" value={clientExport.edition} onChange={e => setClientExport(p => ({ ...p, edition: e.target.value }))} /></div>
                  </>}
                </div>
                <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={pdfExporting || !clientExport.quoteNumber.trim()} onClick={() => handleExportPdf(clientExport.format, clientExport)}>
                  {pdfExporting && pdfType === clientExport.format ? <><span className="spinner" />Exporting...</> : `Export ${clientExport.format === 'quotation' ? 'Quotation' : 'Technical Quotation'}`}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Edit modal overlay */}
      {showEdit && (
        <ProjectModal project={project} onClose={() => { setShowEdit(false); load(); }} onSaved={(p) => { setProject(p); onUpdated(p); }} />
      )}
    </>
  );
}

// ── Main Projects Page ─────────────────────────────────────────
export default function ProjectsPage() {
  const { isRole } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('progress');

  const filtered = projects.filter(p =>
    !search.trim() ||
    p.project_name?.toLowerCase().includes(search.toLowerCase()) ||
    String(p.id).includes(search) ||
    p.engineer_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.client_name?.toLowerCase().includes(search.toLowerCase())
  );

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/projects');
      setProjects(r.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const del = async (p) => {
    if (!confirm(`Permanently delete project "${p.project_name}"? All CRM data will be removed.`)) return;
    try {
      await api.delete(`/projects/${p.id}`);
      setProjects(ps => ps.filter(x => x.id !== p.id));
      toast.success('Project deleted');
    } catch (e) { toast.error(e.message); }
  };

  const onSaved = (p, isUpdate) => {
    if (isUpdate) setProjects(ps => ps.map(x => x.id === p.id ? { ...x, ...p } : x));
    else { setProjects(ps => [p, ...ps]); }
  };

  const onUpdated = (p) => {
    setProjects(ps => ps.map(x => x.id === p.id ? { ...x, ...p } : x));
  };

  const priorityLabel = (p) => {
    if (p.status !== 'draft') return null;
    if (!p.deadline) return { label: 'No deadline', color: 'var(--muted)' };
    const days = Math.ceil((new Date(p.deadline) - new Date()) / 86400000);
    if (days <= 7) return { label: `🔴 ${days}d left`, color: 'var(--danger)' };
    if (days <= 30) return { label: `🟡 ${days}d left`, color: 'var(--accent2)' };
    return { label: `🟢 ${days}d left`, color: 'var(--success)' };
  };

  return (
    <div className="page">
      <DraftNotification />
      <div className="page-header">
        <div>
          <div className="page-title">🔧 Projects CRM</div>
          <div className="page-subtitle">{projects.length} projects{search ? ` (${filtered.length} matching)` : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({})}>+ New Project</button>
        <button className="btn btn-secondary" onClick={() => setImportModal(true)}>📄 Import PDF</button>
        <button className="btn btn-secondary" onClick={() => setViewMode(v => v === 'progress' ? 'table' : 'progress')}>
          {viewMode === 'progress' ? '☷ Table View' : '🧭 Progress Board'}
        </button>
        {isRole('owner','head_engineer','accounting') && <a href="/api/export/projects" className="btn btn-secondary" style={{ textDecoration: 'none' }}>📥 CSV</a>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input className="form-input" placeholder="🔍 Search by name, ID, engineer, or client..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {viewMode === 'progress' && <div className="project-progress-board">
        {PROJECT_STAGES.map(stage => {
          const stageProjects = filtered.filter(project => (project.project_stage || 'design') === stage);
          return <section className="project-stage-column" key={stage}>
            <header><span>{stage}</span><b>{stageProjects.length}</b></header>
            <div className="project-stage-list">
              {stageProjects.map(project => {
                const progress = project.total_panels > 0 ? Math.round((project.completed_panels / project.total_panels) * 100) : 0;
                return <button className="project-progress-card" key={project.id} onClick={() => setDetail(project.id)}>
                  <strong>{project.project_name}</strong>
                  <span>{project.engineer_name || 'Unassigned'} · {project.client_name || 'No client'}</span>
                  <div className="project-mini-progress"><i style={{ width: `${progress}%` }} /></div>
                  <small>{progress}% · {project.completed_panels || 0}/{project.total_panels || 0} panels</small>
                  {project.deadline && <em>Due {project.deadline.split('T')[0]}</em>}
                </button>;
              })}
              {!stageProjects.length && <div className="project-stage-empty">No projects</div>}
            </div>
          </section>;
        })}
      </div>}

      {viewMode === 'table' && <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Project Name</th><th>Engineer</th><th>Client</th>
                <th>Admin</th><th>Client</th><th>Stage</th><th>Deadline</th>
                <th>Priority</th><th>Progress</th><th>Panels</th><th>Total $</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!projects.length && !loading && (
                <tr><td colSpan={13}><div className="empty"><div className="empty-icon">{search ? '🔍' : '🔧'}</div><p>{search ? 'No projects match your search.' : 'No projects yet.'}</p></div></td></tr>
              )}
              {filtered.map(p => {
                const pri = priorityLabel(p);
                const prog = p.total_panels > 0 ? Math.round((p.completed_panels / p.total_panels) * 100) : 0;
                return (
                  <tr key={p.id}>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{p.id}</td>
                    <td style={{ fontWeight: 600, color: 'var(--white)', cursor: 'pointer' }} onClick={() => setDetail(p.id)}>
                      {p.project_name}<div style={{fontSize:10,color:'var(--muted)'}}>{p.quote_number}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{p.engineer_name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{p.client_name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td><span className={`badge ${ADMIN_APPROVAL_BADGE[p.admin_approval] || 'badge-gray'}`}>{p.admin_approval || 'pending'}</span></td>
                    <td><span className={`badge ${APPROVAL_BADGE[p.client_approval] || 'badge-gray'}`}>{p.client_approval}</span></td>
                    <td><span className="badge badge-blue">{p.project_stage || 'design'}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{p.deadline?.split('T')[0] || '—'}</td>
                    <td>{pri && <span style={{ fontSize: 11, color: pri.color, fontFamily: 'var(--font-mono)' }}>{pri.label}</span>}</td>
                    <td>
                      {p.total_panels > 0 && (
                        <div>
                          <div style={{ height: 6, background: 'var(--panel2)', borderRadius: 3, overflow: 'hidden', width: 60 }}>
                            <div style={{ width: `${prog}%`, height: '100%', background: prog >= 80 ? 'var(--success)' : prog >= 40 ? 'var(--accent2)' : 'var(--danger)', borderRadius: 3 }} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{prog}%</div>
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>{p.crm_panels || 0}/{p.total_panels || '—'}</td>
                    <td className="mono" style={{ color: 'var(--success)', fontSize: 12 }}>{p.total_price ? Number(p.total_price).toFixed(0) : '—'}</td>
                    <td className="project-actions-cell"><div>
                      <button className="btn btn-sm btn-secondary" onClick={() => window.open(`/projects/${p.id}/crm`, '_blank')} style={{ fontSize: 11, padding: '2px 8px' }}>CRM</button>
                      <button className="btn-icon" title="View" onClick={() => setDetail(p.id)}>👁</button>
                      {isRole('owner') && <button className="btn-icon" title="Delete" onClick={() => del(p)} style={{ color: 'var(--danger)' }}>🗑</button>}
                    </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {modal !== null && (
        <ProjectModal project={modal.id ? modal : undefined} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {detail !== null && (
        <ProjectDetailModal projectId={detail} onClose={() => setDetail(null)} onUpdated={onUpdated} />
      )}
      {importModal && (
        <ImportPdfModal onClose={() => setImportModal(false)} onCreated={(pid) => { setImportModal(false); setDetail(pid); load(); }} />
      )}
    </div>
  );
}

// ── Import PDF Modal ────────────────────────────────────────────
function ImportPdfModal({ onClose, onCreated }) {
  const [step, setStep] = useState('form');
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ project_name: '', quote_number:'', client_id: '', engineer_id: '', deadline: '', exchange_rate: 1.18, panel_count: '', vat_pct:0, project_discount_pct:0, margin_warning_pct:10, payment_terms:'70% at order, 30% after inspection', client_pdf_note:'' });
  const [clients, setClients] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [unmatchedAction, setUnmatchedAction] = useState({});

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
    api.get('/workers').then(r => setEngineers(r.data.filter(w => w.role === 'engineer' || w.role === 'owner'))).catch(() => {});
  }, []);

  const handleFileAndPreview = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast.error('Please select a PDF file'); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/projects/import-pdf/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(r.data);
      setForm(previous=>({...previous,project_name:previous.project_name||r.data.metadata?.project_name||'',quote_number:previous.quote_number||r.data.metadata?.quote_number||'',payment_terms:r.data.metadata?.payment_terms||previous.payment_terms}));
      setStep('preview');
      toast.success(`Found ${r.data.total_items} items (${r.data.matched.length} matched, ${r.data.unmatched.length} unmatched)`);
    } catch (err) { toast.error(err.response?.data?.error || err.message); }
    finally { setUploading(false); }
  };

  const handleCreate = async () => {
    if (!form.project_name.trim()) { toast.error('Project name required'); return; }
    setCreating(true);
    try {
      const panelsWithItems = preview.panels.map(p => {
        const divs = {};
        // Rebuild only this panel's divisions. Import preview preserves these
        // fields so items no longer collapse into one INCOMING division.
        const panelItems = [...preview.matched, ...(preview.unmatched.filter(u => !unmatchedAction[u.name]?.skip))]
          .filter(item => Number(item.panel_number) === Number(p.panel_number));
        for (const item of panelItems) {
          const divType = item.division_type || 'INCOMING';
          if (!divs[divType]) divs[divType] = { division_type: divType, items: [] };
          divs[divType].items.push({
            ...item,
            product_id: item.product_id || null,
            base_price_usd: item.base_price_usd || 0,
            base_price_euro: item.base_price_euro || 0,
            discount: item.discount || 0,
          });
        }
        return { ...p, quantity:Math.max(1,parseInt(p.quantity)||1), divisions: Object.values(divs) };
      });

      // Include unmatched items that aren't skipped
      const finalUnmatched = preview.unmatched.filter(u => !unmatchedAction[u.name]?.skip).map(u => ({
        ...u,
        product_id: null,
        base_price_usd: 0,
        base_price_euro: 0,
      }));

      const res = await api.post('/projects/import-pdf/create', {
        project_name: form.project_name,
        quote_number: form.quote_number.trim() || null,
        engineer_id: parseInt(form.engineer_id) || null,
        client_id: parseInt(form.client_id) || null,
        exchange_rate_eur_usd: parseFloat(form.exchange_rate) || 1.18,
        deadline: form.deadline || null,
        total_panels: parseInt(form.panel_count) || preview.panels.length,
        vat_pct:parseFloat(form.vat_pct)||0,
        project_discount_pct:parseFloat(form.project_discount_pct)||0,
        margin_warning_pct:parseFloat(form.margin_warning_pct)||10,
        payment_terms:form.payment_terms||null,
        client_pdf_note:form.client_pdf_note||null,
        panels: panelsWithItems,
        matched_items: preview.matched,
        unmatched_items: finalUnmatched,
      });
      const newProjectId = res.data?.project_id;
      toast.success('Project created from PDF!');
      onCreated(newProjectId);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error(`Create failed: ${msg}`);
    }
    finally { setCreating(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">📄 Import Project from PDF</div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {step === 'form' && (
            <>
              <div className="form-row">
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Quotation Number</label>
                  <input className="form-input" value={form.quote_number} onChange={e => setForm(f => ({ ...f, quote_number: e.target.value }))} placeholder="Automatic if empty" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Project Name *</label>
                  <input className="form-input" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="e.g. New Office Building" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Client</label>
                  <select className="form-input" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Engineer</label>
                  <select className="form-input" value={form.engineer_id} onChange={e => setForm(f => ({ ...f, engineer_id: e.target.value }))}>
                    <option value="">Select engineer...</option>
                    {engineers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Deadline</label>
                  <input className="form-input" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Exchange Rate (EUR→USD)</label>
                  <input className="form-input" type="number" step="0.01" value={form.exchange_rate} onChange={e => setForm(f => ({ ...f, exchange_rate: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Panel Count</label>
                  <input className="form-input" type="number" min={1} value={form.panel_count} onChange={e => setForm(f => ({ ...f, panel_count: e.target.value }))} placeholder="Auto from PDF" />
                </div>
                <div><label className="form-label">VAT %</label><input className="form-input" type="number" min="0" value={form.vat_pct} onChange={e=>setForm(f=>({...f,vat_pct:e.target.value}))}/></div>
                <div><label className="form-label">Project Discount %</label><input className="form-input" type="number" min="0" value={form.project_discount_pct} onChange={e=>setForm(f=>({...f,project_discount_pct:e.target.value}))}/></div>
                <div><label className="form-label">Margin Warning %</label><input className="form-input" type="number" min="0" value={form.margin_warning_pct} onChange={e=>setForm(f=>({...f,margin_warning_pct:e.target.value}))}/></div>
              </div>
              <div className="form-row" style={{marginTop:12}}><div className="form-group"><label className="form-label">Payment Terms</label><textarea className="form-textarea" rows={2} value={form.payment_terms} onChange={e=>setForm(f=>({...f,payment_terms:e.target.value}))}/></div><div className="form-group"><label className="form-label">Client PDF Note</label><textarea className="form-textarea" rows={2} value={form.client_pdf_note} onChange={e=>setForm(f=>({...f,client_pdf_note:e.target.value}))}/></div></div>
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>PDF File *</label>
                <input className="form-input" type="file" accept="application/pdf" onChange={handleFileAndPreview} disabled={uploading} />
                {uploading && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>⏳ Parsing PDF...</div>}
              </div>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>Preview: {preview.panels.length} panels, {preview.total_items} items</div>
                <div className="tint-box" style={{marginTop:8}}>Quotation <strong>{form.quote_number||'will be generated automatically'}</strong> · VAT {form.vat_pct||0}% · Discount {form.project_discount_pct||0}% · Starts at Design stage</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  <span style={{ color: 'var(--success)' }}>{preview.matched.length} matched</span>
                  {preview.unmatched.length > 0 && <span style={{ color: 'var(--accent2)', marginLeft: 8 }}>{preview.unmatched.length} unmatched</span>}
                </div>
              </div>

              <div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,color:'var(--primary-light)',marginBottom:6}}>⚡ Imported Panels and Multipliers</div><div className="form-row">
                {preview.panels.map((panel,index)=><div className="tint-box" key={panel.panel_number} style={{display:'grid',gridTemplateColumns:'1fr 90px',alignItems:'center',gap:8}}><div><strong style={{color:'var(--white)'}}>Panel #{panel.panel_number}</strong><div style={{fontSize:10,color:'var(--muted)'}}>{panel.panel_name||'Unnamed panel'}</div></div><div className="form-group"><label className="form-label">Quantity</label><input className="form-input" type="number" min="1" value={panel.quantity||1} onChange={e=>setPreview(previous=>({...previous,panels:previous.panels.map((p,i)=>i===index?{...p,quantity:Math.max(1,parseInt(e.target.value)||1)}:p)}))}/></div></div>)}
              </div></div>

              {preview.matched.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>✅ Matched Items</div>
                  <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {preview.matched.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                        <span style={{ color: 'var(--white)', minWidth: 200 }}>{item.name}</span>
                        <span>x{item.qty}</span>
                        {item.discount > 0 && <span style={{ color: 'var(--danger)' }}>{item.discount}% off</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.unmatched.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', marginBottom: 4 }}>⚠️ Unmatched Items (not found in DB)</div>
                  <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {preview.unmatched.map((item, i) => {
                      const action = unmatchedAction[item.name] || 'create';
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                          <span style={{ color: 'var(--white)', minWidth: 200 }}>{item.name}</span>
                          <span>x{item.qty}</span>
                          <select className="form-input" style={{ width: 130, fontSize: 10 }} value={action} onChange={e => setUnmatchedAction(u => ({ ...u, [item.name]: e.target.value }))}>
                            <option value="create">Create as manual</option>
                            <option value="skip">Skip item</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setStep('form')}>Back</button>
                <button className="btn btn-sm btn-primary" onClick={handleCreate} disabled={creating}>
                  {creating ? '⏳ Creating...' : '✅ Create Project'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
