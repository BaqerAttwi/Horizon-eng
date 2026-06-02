import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function FileAttachments({ projectId, panels }) {
  const { worker } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState('');

  const canUpload = worker?.role === 'owner' || worker?.role === 'engineer';

  const load = async () => {
    if (!projectId) return;
    try {
      const r = await api.get(`/projects/${projectId}/attachments`);
      setFiles(r.data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File too large — max 20MB');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (selectedPanel) form.append('panel_id', selectedPanel);
      await api.post(`/projects/${projectId}/attachments`, form);
      toast.success('File uploaded');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await api.delete(`/projects/${projectId}/attachments/${id}`);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <div className="empty"><span className="spinner" /></div>;

  return (
    <div>
      {canUpload && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
              <label className="form-label">Attach Panel (optional)</label>
              <select className="form-select" value={selectedPanel}
                onChange={e => setSelectedPanel(e.target.value)}>
                <option value="">— All panels —</option>
                {(panels || []).map(p => (
                  <option key={p.id} value={p.id}>{p.panel_name || `Panel #${p.panel_number}`}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Upload File</label>
              <input type="file" className="form-input" onChange={handleUpload}
                disabled={uploading} style={{ padding: '6px 10px' }} />
            </div>
            {uploading && <span className="spinner" style={{ marginBottom: 4 }} />}
          </div>
        </div>
      )}

      {!files.length ? (
        <div className="empty">
          <div className="empty-icon">📁</div>
          <p>No files attached yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map(f => (
            <div key={f.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: 'var(--panel2)', borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={`/api/attachments/${f.id}/download`} target="_blank" rel="noreferrer"
                  style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                  📎 {f.file_name}
                </a>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {(f.file_size / 1024).toFixed(1)} KB · by {f.uploader_name}
                  {f.panel_id && <span> · Panel #{panels?.find(p => p.id === f.panel_id)?.panel_number || f.panel_id}</span>}
                  · {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              {canUpload && (
                <button className="btn-icon" style={{ color: 'var(--danger)', flexShrink: 0 }}
                  onClick={() => handleDelete(f.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
