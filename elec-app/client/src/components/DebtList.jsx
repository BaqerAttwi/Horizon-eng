import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import ProjectPayments from './crm/ProjectPayments';

function PaymentDeadlineEditor({ project, onSaved }) {
  const { isRole } = useAuth();
  const canEdit = isRole('owner');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.payment_deadline ? project.payment_deadline.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.patch(`/projects/${project.id}`, { payment_deadline: value || null });
      toast.success('Payment deadline updated');
      onSaved(r.data);
      setEditing(false);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (!editing) {
    const overdue = project.payment_deadline && new Date(project.payment_deadline) < new Date();
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: project.payment_deadline ? (overdue ? 'var(--danger)' : 'var(--white)') : 'var(--muted)' }}>
          {project.payment_deadline ? new Date(project.payment_deadline).toLocaleDateString() : 'No deadline set'}
          {overdue ? ' (overdue)' : ''}
        </span>
        {canEdit && (
          <button className="btn-icon" title="Edit payment deadline" onClick={() => { setValue(project.payment_deadline ? project.payment_deadline.slice(0, 10) : ''); setEditing(true); }}>✏️</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="date" className="form-input" style={{ width: 150 }} value={value} onChange={e => setValue(e.target.value)} />
      <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>{saving ? <span className="spinner" /> : 'Save'}</button>
      <button className="btn btn-sm btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
    </div>
  );
}

// Full debt overview — every approved project with an outstanding balance,
// expandable to full payment history. Shared by the sidebar Debt page and
// the Debt tab inside Analytics so both stay identical instead of drifting.
export default function DebtList() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    try {
      const r = await api.get('/debt');
      setData(r.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateProjectLocal = (updated) => {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === updated.id ? { ...p, payment_deadline: updated.payment_deadline } : p),
    }));
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>;

  const projects = data?.projects || [];

  return (
    <div>
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--danger)' }}>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>${parseFloat(data?.total_outstanding || 0).toFixed(0)}</div>
          <div className="stat-label">Total Outstanding</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">Projects in Debt</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--danger)' }}>
            {projects.filter(p => p.payment_deadline && new Date(p.payment_deadline) < new Date()).length}
          </div>
          <div className="stat-label">Overdue Deadlines</div>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card card-body" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <div style={{ fontWeight: 600, color: 'var(--white)' }}>No outstanding debt</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Every approved project is fully paid.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.map(p => {
            const expanded = expandedId === p.id;
            const overdue = p.payment_deadline && new Date(p.payment_deadline) < new Date();
            return (
              <div key={p.id} className="card" style={{ overflow: 'visible', border: overdue ? '1px solid var(--danger)' : undefined }}>
                <div
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{expanded ? '▼' : '▶'}</span>
                      <span style={{ fontWeight: 700, color: 'var(--white)', fontSize: 14 }}>{p.project_name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, marginLeft: 20 }}>
                      {p.client_name || 'No client'} · Engineer: {p.engineer_name || '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Due</div>
                      <div className="mono" style={{ fontWeight: 600 }}>${parseFloat(p.total_due).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Paid</div>
                      <div className="mono" style={{ fontWeight: 600, color: 'var(--success)' }}>${parseFloat(p.total_paid).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Outstanding</div>
                      <div className="mono" style={{ fontWeight: 700, color: 'var(--danger)' }}>${parseFloat(p.outstanding).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>Next Payment Due</div>
                      <PaymentDeadlineEditor project={p} onSaved={updateProjectLocal} />
                    </div>
                    <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); navigate(`/projects/${p.id}/crm`); }}>
                      Open Project →
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--panel2)' }}>
                    <ProjectPayments projectId={p.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
