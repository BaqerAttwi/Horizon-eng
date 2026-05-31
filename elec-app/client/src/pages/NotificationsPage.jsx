import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/client';
import { FadeIn } from '../components/AnimatedPage';

const TYPE_ICONS = {
  deadline: '⏰', approval: '📋', status: '🔄',
  request: '🤝', stock: '📦', general: '📌',
};

const TYPE_COLORS = {
  deadline: 'var(--danger)', approval: 'var(--accent2)',
  status: 'var(--accent)', request: 'var(--primary)',
  stock: 'var(--danger)', general: 'var(--muted)',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all'); // all, unread
  const [loading, setLoading] = useState(true);

  const load = () => {
    const url = filter === 'unread'
      ? '/notifications?limit=100&unread_only=true'
      : '/notifications?limit=100';
    api.get(url)
      .then(r => {
        setNotifications(r.data.notifications || []);
        setUnreadCount(r.data.unread_count || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const handleRead = (id) => {
    api.patch(`/notifications/${id}/read`).then(load);
  };

  const handleReadAll = () => {
    api.patch('/notifications/read-all').then(load);
  };

  const handleDelete = (id) => {
    api.delete(`/notifications/${id}`).then(load);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🔔 Notifications</div>
          <div className="page-subtitle">{unreadCount} unread · {notifications.length} total</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="tabs" style={{ marginBottom: 0, border: 'none' }}>
            <div className={`tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</div>
            <div className={`tab${filter === 'unread' ? ' active' : ''}`} onClick={() => setFilter('unread')}>
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </div>
          </div>
          {unreadCount > 0 && (
            <button className="btn btn-sm btn-secondary" onClick={handleReadAll}>Mark all read</button>
          )}
        </div>
      </div>

      <FadeIn>
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" style={{ width: 32, height: 32 }} /></div>
            ) : notifications.length === 0 ? (
              <div className="empty" style={{ padding: 40 }}>
                <div className="empty-icon">🔔</div>
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map(n => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="notif-item"
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '14px 16px',
                    background: n.is_read ? 'transparent' : 'rgba(26,95,168,0.04)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>
                    {TYPE_ICONS[n.type] || '📌'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: 'var(--white)', lineHeight: 1.4 }}>
                      {n.title}
                    </div>
                    {n.message && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="notif-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {!n.is_read && (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleRead(n.id)}>Read</button>
                    )}
                    <button className="btn btn-sm btn-icon" onClick={() => handleDelete(n.id)}>✕</button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
