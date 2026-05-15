import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import { exportProjectPdf } from '../utils/pdfExport';

const STATUS_BADGE = { draft:'badge-gray', active:'badge-blue', completed:'badge-green', cancelled:'badge-red' };
const APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };
const ADMIN_APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };

// ── Notification Bell ────────────────────────────────────────
function DraftNotification() {
  const { isRole } = useAuth();
  const [notify, setNotify] = useState(null);

  useEffect(() => {
    if (isRole('engineer', 'owner')) {
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
    project_name: '', engineer_id: '', client_id: '',
    exchange_rate_eur_usd: 1.08, deadline: '', notes: '', total_panels: 0,
    ...(project ? {
      project_name: project.project_name,
      engineer_id: project.engineer_id || '',
      client_id: project.client_id || '',
      exchange_rate_eur_usd: project.exchange_rate_eur_usd || 1.08,
      deadline: project.deadline?.split('T')[0] || '',
      notes: project.notes || '',
      total_panels: project.total_panels || 0,
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
      const r = project?.id
        ? await api.patch(`/projects/${project.id}`, form)
        : await api.post('/projects', form);
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
                onChange={e => setForm(p => ({ ...p, exchange_rate_eur_usd: parseFloat(e.target.value) || 1.08 }))} />
            </div>
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
  const [clientRejectNote, setClientRejectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/projects/${projectId}`);
      setProject(r.data);
    } catch (e) { toast.error(e.message); onClose(); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (status) => {
    setUpdating(true);
    try {
      const r = await api.patch(`/projects/${projectId}`, { status });
      setProject(p => ({ ...p, ...r.data }));
      onUpdated && onUpdated(r.data);
      toast.success(`✅ Status → ${status}`);
    } catch (e) { toast.error(e.message); }
    finally { setUpdating(false); }
  };

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

  const handleExportPdf = async (type) => {
    setPdfExporting(true);
    setPdfType(type);
    try {
      await exportProjectPdf(projectId, type);
      toast.success('✅ PDF exported');
    } catch (e) { toast.error('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); setPdfType(null); }
  };

  if (loading) return <div className="modal-overlay"><div className="modal"><div className="modal-body" style={{ textAlign: 'center', padding: 40 }}><span className="spinner" />&nbsp; Loading...</div></div></div>;
  if (!project) return null;

  const STATUS_FLOW = ['draft', 'active', 'completed', 'cancelled'];
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

            {/* Stats summary */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">Admin Approval</div>
                <div className="stat-value" style={{ fontSize: 16, color: project.admin_approval === 'approved' ? '#22c55e' : project.admin_approval === 'rejected' ? '#ef4444' : '#f59e0b' }}>
                  {project.admin_approval || 'pending'}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Client Approval</div>
                <div className="stat-value" style={{ fontSize: 16, color: project.client_approval === 'approved' ? '#22c55e' : project.client_approval === 'rejected' ? '#ef4444' : '#f59e0b' }}>
                  {project.client_approval}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Status</div>
                <div className="stat-value" style={{ fontSize: 16 }}>{project.status}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Price</div>
                <div className="stat-value" style={{ fontSize: 16, color: '#22c55e' }}>${parseFloat(project.total_price || 0).toFixed(0)}</div>
              </div>
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
            {isRole('owner') && (
              <div style={{ background: 'rgba(59,130,246,0.04)', borderRadius: 8, padding: 14, border: '1px solid rgba(59,130,246,0.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>👑 Owner Controls</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4 }}>Admin Approval:</span>
                  {['pending', 'approved', 'rejected'].map(a => (
                    <button key={a} className={`btn btn-sm ${project.admin_approval === a ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={project.admin_approval === a || updating}
                      onClick={() => changeAdminApproval(a)}
                      style={a === 'approved' ? { background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' } : a === 'rejected' ? { background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' } : {}}>
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

            {/* ── Status Tracking (only after admin approved) ── */}
            {project.admin_approval === 'approved' && (
              <div style={{ background: 'rgba(245,158,11,0.04)', borderRadius: 8, padding: 14, border: '1px solid rgba(245,158,11,0.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>📊 Status Tracking</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STATUS_FLOW.map(s => (
                    <button key={s} className={`btn btn-sm ${project.status === s ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={project.status === s || updating}
                      onClick={() => changeStatus(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Action Buttons ── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button className="btn btn-primary" onClick={() => { onClose(); navigate(`/projects/${project.id}/crm`); }}>
                📋 Open CRM Editor
              </button>
              {isRole('owner', 'engineer') && (
                <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>
                  ✏️ Edit Project
                </button>
              )}
              {isRole('owner') && (
                <button className="btn btn-secondary" onClick={() => handleExportPdf('owner')} disabled={pdfExporting}
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {pdfExporting && pdfType === 'owner' ? <><span className="spinner" />Exporting...</> : '📄 Export PDF (Owner)'}
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => handleExportPdf('client')} disabled={pdfExporting}
                style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                {pdfExporting && pdfType === 'client' ? <><span className="spinner" />Exporting...</> : '📄 Export PDF (Client)'}
              </button>
            </div>

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
  const [search, setSearch] = useState('');

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
      </div>

      <div style={{ marginBottom: 16 }}>
        <input className="form-input" placeholder="🔍 Search by name, ID, engineer, or client..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Project Name</th><th>Engineer</th><th>Client</th>
                <th>Admin</th><th>Client</th><th>Status</th><th>Deadline</th>
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
                      {p.project_name}
                    </td>
                    <td style={{ fontSize: 12 }}>{p.engineer_name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{p.client_name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td><span className={`badge ${ADMIN_APPROVAL_BADGE[p.admin_approval] || 'badge-gray'}`}>{p.admin_approval || 'pending'}</span></td>
                    <td><span className={`badge ${APPROVAL_BADGE[p.client_approval] || 'badge-gray'}`}>{p.client_approval}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[p.status] || 'badge-gray'}`}>{p.status}</span></td>
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
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/projects/${p.id}/crm`)} style={{ fontSize: 11, padding: '2px 8px' }}>CRM</button>
                      <button className="btn-icon" title="View" onClick={() => setDetail(p.id)}>👁</button>
                      {isRole('owner') && <button className="btn-icon" title="Delete" onClick={() => del(p)} style={{ color: 'var(--danger)' }}>🗑</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && (
        <ProjectModal project={modal.id ? modal : undefined} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {detail !== null && (
        <ProjectDetailModal projectId={detail} onClose={() => setDetail(null)} onUpdated={onUpdated} />
      )}
    </div>
  );
}
