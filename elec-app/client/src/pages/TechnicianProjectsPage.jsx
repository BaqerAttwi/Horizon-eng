import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function TechnicianProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/technicians/my-projects')
      .then(r => setProjects(r.data))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🛠️ My Projects</div>
          <div className="page-subtitle">Projects assigned to you for execution</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : !projects.length ? (
        <div className="empty">
          <div className="empty-icon">🛠️</div>
          <p>No projects assigned to you yet.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Deadline</th><th>Progress</th></tr></thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/my-projects/${p.id}`)}>
                    <td style={{ fontWeight: 600, color: 'var(--white)' }}>{p.project_name}</td>
                    <td style={{ color: 'var(--muted)' }}>{p.client_name || '—'}</td>
                    <td><span className="badge badge-blue">{p.status}</span></td>
                    <td className="mono">{p.execution_deadline || p.deadline || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${p.progress_pct}%`, height: '100%', background: p.progress_pct >= 100 ? 'var(--success)' : 'var(--accent)' }} />
                        </div>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{p.progress_pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
