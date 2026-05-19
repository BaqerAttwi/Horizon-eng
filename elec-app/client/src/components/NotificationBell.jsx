import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/client';

const TYPE_ICONS = {
  deadline: '⏰',
  approval: '📋',
  status: '🔄',
  request: '🤝',
  stock: '📦',
  general: '📌',
};

const TYPE_COLORS = {
  deadline: 'var(--danger)',
  approval: 'var(--accent2)',
  status: 'var(--accent)',
  request: 'var(--primary)',
  stock: 'var(--danger)',
  general: 'var(--muted)',
};

function NotificationItem({ n, onRead, onDelete }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        padding: '10px 12px',
        background: n.is_read ? 'transparent' : 'rgba(26,95,168,0.06)',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!n.is_read) e.currentTarget.style.background = 'rgba(26,95,168,0.1)'; }}
      onMouseLeave={e => { if (!n.is_read) e.currentTarget.style.background = 'rgba(26,95,168,0.06)'; }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>
        {TYPE_ICONS[n.type] || '📌'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: n.is_read ? 500 : 700, color: 'var(--white)', lineHeight: 1.3 }}>
          {n.title}
        </div>
        {n.message && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.3 }}>
            {n.message}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          {new Date(n.created_at).toLocaleString()}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {!n.is_read && (
          <button
            onClick={() => onRead(n.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent)', fontSize: 14, padding: 2,
            }}
            title="Mark as read"
          >✓</button>
        )}
        <button
          onClick={() => onDelete(n.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 12, padding: 2,
          }}
          title="Delete"
        >✕</button>
      </div>
    </motion.div>
  );
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef();

  const loadNotifications = () => {
    api.get('/notifications?limit=20')
      .then(r => {
        setNotifications(r.data.notifications || []);
        setUnreadCount(r.data.unread_count || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadNotifications(); }, []);

  // Poll every 60 seconds for new notifications
  useEffect(() => {
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRead = (id) => {
    api.patch(`/notifications/${id}/read`).then(() => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    });
  };

  const handleReadAll = () => {
    api.patch('/notifications/read-all').then(() => {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    });
  };

  const handleDelete = (id) => {
    api.delete(`/notifications/${id}`).then(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    });
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn-icon"
        onClick={() => setOpen(!open)}
        style={{ position: 'relative' }}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: 'var(--danger)', color: '#fff',
            fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
            width: 16, height: 16, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 360, maxHeight: 480,
              background: 'var(--panel)', border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              zIndex: 300,
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 14px', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>
                Notifications {unreadCount > 0 && `(${unreadCount})`}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={handleReadAll}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                  }}
                >Mark all read</button>
              )}
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', maxHeight: 400 }}>
              {loading ? (
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <span className="spinner" />
                </div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  No notifications
                </div>
              ) : (
                notifications.map(n => (
                  <NotificationItem
                    key={n.id} n={n}
                    onRead={handleRead}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '8px 14px', borderTop: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <Link
                to="/notifications"
                onClick={() => setOpen(false)}
                style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
              >
                View all notifications →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
