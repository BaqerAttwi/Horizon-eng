import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function FileAttachments({ projectId, panels, project, onProjectUpdate }) {
  const { worker } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingLink, setAddingLink] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [editingProjectLink, setEditingProjectLink] = useState(false);
  const [projectLinkDraft, setProjectLinkDraft] = useState('');
  const [savingProjectLink, setSavingProjectLink] = useState(false);

  const canUpload = worker?.role === 'owner' || worker?.role === 'engineer';

  const saveProjectLink = async () => {
    setSavingProjectLink(true);
    try {
      const r = await api.patch(`/projects/${projectId}`, { onedrive_folder_link: projectLinkDraft || null });
      onProjectUpdate?.(prev => ({ ...prev, ...r.data }));
      toast.success('Project OneDrive link saved');
      setEditingProjectLink(false);
    } catch (e) { toast.error(e.message); }
    finally { setSavingProjectLink(false); }
  };

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

  const handleAddLink = async () => {
    if (!linkUrl.trim()) { toast.error('Paste a link first'); return; }
    setAddingLink(true);
    try {
      await api.post(`/projects/${projectId}/attachments`, {
        link_url: linkUrl.trim(),
        name: linkName.trim(),
        panel_id: selectedPanel || undefined,
      });
      toast.success('Link added');
      setLinkName('');
      setLinkUrl('');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAddingLink(false);
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
      <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
        {editingProjectLink ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" type="url" style={{ flex: 1, minWidth: 200 }} autoFocus
              value={projectLinkDraft} onChange={e => setProjectLinkDraft(e.target.value)}
              placeholder="Paste a OneDrive link for all project files..." />
            <button className="btn btn-sm btn-primary" disabled={savingProjectLink} onClick={saveProjectLink}>
              {savingProjectLink ? <span className="spinner" /> : 'Save'}
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => setEditingProjectLink(false)}>Cancel</button>
          </div>
        ) : project?.onedrive_folder_link ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <a href={project.onedrive_folder_link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              ☁️ Project OneDrive Folder (all files) →
            </a>
            {canUpload && <button className="btn-icon" title="Edit link" onClick={() => { setProjectLinkDraft(project.onedrive_folder_link || ''); setEditingProjectLink(true); }}>✏️</button>}
          </div>
        ) : canUpload ? (
          <button className="btn btn-sm btn-secondary" onClick={() => { setProjectLinkDraft(''); setEditingProjectLink(true); }}>
            ☁️ + Add project OneDrive folder link
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>No project OneDrive folder link set.</span>
        )}
      </div>

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
            <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
              <label className="form-label">Name (optional)</label>
              <input className="form-input" value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="e.g. Site photos" />
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 220 }}>
              <label className="form-label">Link</label>
              <input className="form-input" type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                placeholder="Paste a OneDrive/Drive/etc. link..." onKeyDown={e => e.key === 'Enter' && handleAddLink()} />
            </div>
            <button className="btn btn-primary" onClick={handleAddLink} disabled={addingLink}>
              {addingLink ? <span className="spinner" /> : '+ Add Link'}
            </button>
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
                <a href={f.storage === 'link' ? f.link_url : `/api/attachments/${f.id}/download`} target="_blank" rel="noreferrer"
                  style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                  🔗 {f.file_name}
                </a>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.storage !== 'link' && <>{(f.file_size / 1024).toFixed(1)} KB · </>}
                  by {f.uploader_name}
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
