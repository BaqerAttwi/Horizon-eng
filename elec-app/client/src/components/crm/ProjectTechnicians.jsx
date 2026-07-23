import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';

// Owner-only widget: assign/remove technicians (execution-only field workers) on a project.
export default function ProjectTechnicians({ projectId }) {
  const [assigned, setAssigned] = useState([]);
  const [available, setAvailable] = useState([]);
  const [pickerId, setPickerId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [assignedRes, workersRes] = await Promise.all([
        api.get(`/projects/${projectId}/technicians`),
        api.get('/workers', { params: { role: 'technician' } }),
      ]);
      setAssigned(assignedRes.data);
      setAvailable(workersRes.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const assign = async () => {
    if (!pickerId) return;
    try {
      await api.post(`/projects/${projectId}/technicians`, { worker_id: pickerId });
      toast.success('Technician assigned');
      setPickerId('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async (workerId) => {
    try {
      await api.delete(`/projects/${projectId}/technicians/${workerId}`);
      setAssigned(a => a.filter(t => t.worker_id !== workerId));
      toast.success('Technician removed');
    } catch (e) { toast.error(e.message); }
  };

  const assignedIds = new Set(assigned.map(t => t.worker_id));
  const pickable = available.filter(w => !assignedIds.has(w.id));

  if (loading) return null;

  return (
    <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--panel2)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', marginBottom: 8 }}>🛠️ Assigned Technicians</div>
      {assigned.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>No technicians assigned yet.</div>}
      {assigned.map(t => (
        <div key={t.worker_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0' }}>
          <span style={{ flex: 1, color: 'var(--white)' }}>{t.name}</span>
          <button className="btn-icon" title="Remove" onClick={() => remove(t.worker_id)} style={{ color: 'var(--danger)' }}>🗑</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <select className="form-select" style={{ flex: 1 }} value={pickerId} onChange={e => setPickerId(e.target.value)}>
          <option value="">Select technician to assign...</option>
          {pickable.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" disabled={!pickerId} onClick={assign}>+ Assign</button>
      </div>
    </div>
  );
}
