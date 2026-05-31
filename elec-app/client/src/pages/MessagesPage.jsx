import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function MessagesPage() {
  const { worker, can } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = can('messages') && (worker?.role === 'owner' || worker?.role === 'secretary');

  const load = async () => {
    try {
      const r = await api.get('/messages');
      setMessages(r.data || []);
    } catch (e) {
      toast.error('❌ ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      await api.post('/messages', { content: content.trim() });
      setContent('');
      toast.success('✅ Announcement sent');
      load();
    } catch (e) {
      toast.error('❌ ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/messages/${id}`);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error('❌ ' + e.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📢 Announcements</h1>
          <p className="page-desc">Messages for all team members</p>
        </div>
      </div>

      {canSend && (
        <motion.div className="card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{ marginBottom: 16 }}
        >
          <div className="msg-compose" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">New Announcement</label>
              <textarea className="form-textarea" rows={3}
                placeholder="Type your message here..."
                value={content} onChange={e => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ resize: 'vertical' }}
              />
            </div>
            <button className="btn btn-primary" onClick={send} disabled={sending || !content.trim()}
              style={{ height: 38, whiteSpace: 'nowrap', marginBottom: 2 }}>
              {sending ? <><span className="spinner" /> Sending...</> : '📨 Send'}
            </button>
          </div>
        </motion.div>
      )}

      <motion.div className="card"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><span className="spinner" /> Loading...</div>
        ) : messages.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <p>No announcements yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((msg, i) => (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.15 }}
                style={{
                  padding: '12px 16px',
                  background: 'var(--panel2)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.5 }}>{msg.content}</div>
                  {(worker?.role === 'owner' || msg.created_by === worker?.id) && (
                    <button className="btn-icon" title="Delete" style={{ color: 'var(--danger)', flexShrink: 0, fontSize: 13 }}
                      onClick={() => del(msg.id)}>✕</button>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 12 }}>
                  <span>👤 {msg.creator_name} ({msg.creator_role})</span>
                  <span>🕐 {new Date(msg.created_at).toLocaleString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
