import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import ExecutionPanel from '../components/crm/ExecutionPanel';

export default function TechnicianExecutionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [panels, setPanels] = useState([]);
  const [executionData, setExecutionData] = useState({ panelCompletion: {}, itemCompletion: {} });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [viewRes, exRes] = await Promise.all([
        api.get(`/projects/${id}/execution/view`),
        api.get(`/projects/${id}/execution`),
      ]);
      setProject(viewRes.data.project);
      setPanels(viewRes.data.panels || []);
      setExecutionData(exRes.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleExecutionPanel = useCallback(async (panelId, is_completed, description) => {
    try {
      const r = await api.patch(`/projects/${id}/execution/panels/${panelId}`, { is_completed: is_completed ? 1 : 0, description });
      const { cascadedItems, ...panelResult } = r.data;
      setExecutionData(prev => {
        const itemCompletion = { ...prev.itemCompletion };
        for (const item of cascadedItems || []) itemCompletion[item.item_id] = item;
        return { ...prev, panelCompletion: { ...prev.panelCompletion, [panelId]: panelResult }, itemCompletion };
      });
    } catch (e) { toast.error(e.message); }
  }, [id]);

  const toggleExecutionItem = useCallback(async (itemId, is_completed, qty_done, execution_notes) => {
    try {
      const body = {};
      if (is_completed !== null) body.is_completed = is_completed ? 1 : 0;
      if (qty_done !== undefined) body.qty_done = qty_done;
      if (execution_notes !== undefined) body.execution_notes = execution_notes;
      const r = await api.patch(`/projects/${id}/execution/items/${itemId}`, body);
      setExecutionData(prev => ({ ...prev, itemCompletion: { ...prev.itemCompletion, [itemId]: r.data } }));
    } catch (e) { toast.error(e.message); }
  }, [id]);

  if (loading) return <div className="page"><div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading...</div></div>;
  if (!project) return <div className="page"><div className="empty"><p>Project not found</p></div></div>;

  const totalQty = panels.reduce((s, p) => s + (p.divisions || []).reduce((s2, d) => s2 + (d.items || []).reduce((s3, i) => s3 + (parseInt(i.qty) || 1), 0), 0), 0);
  const doneQty = panels.reduce((s, p) => s + (p.divisions || []).reduce((s2, d) => s2 + (d.items || []).reduce((s3, i) => {
    const ic = executionData.itemCompletion?.[i.id];
    if (ic?.qty_done !== undefined) return s3 + parseInt(ic.qty_done);
    return s3 + (ic?.is_completed ? (parseInt(i.qty) || 1) : 0);
  }, 0), 0), 0);
  const pct = totalQty > 0 ? Math.round((doneQty / totalQty) * 100) : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/my-projects')}>← Back</button>
            <div className="page-title">🛠️ {project.project_name}</div>
          </div>
          <div className="page-subtitle">
            Client: {project.client_name || '—'} •
            {project.execution_deadline ? ` Execution Deadline: ${project.execution_deadline}` : ' No execution deadline set'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {panels.length > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--panel2)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)' }}>Project Progress</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{doneQty}/{totalQty} ({pct}%)</span>
              </div>
              <div style={{ width: '100%', height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 5, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {panels.length === 0 ? (
            <div className="empty"><p>No panels to execute yet.</p></div>
          ) : (
            panels.map(panel => (
              <ExecutionPanel key={panel.id} panel={panel} project={project}
                executionPanelData={executionData.panelCompletion?.[panel.id]}
                executionItemData={executionData.itemCompletion}
                onTogglePanel={toggleExecutionPanel}
                onToggleItem={toggleExecutionItem}
                onSaveDesc={async (pid, description) => {
                  try { await api.patch(`/projects/${id}/execution/panels/${pid}`, { description }); }
                  catch (e) { toast.error(e.message); }
                }} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
