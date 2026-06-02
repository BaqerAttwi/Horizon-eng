import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/client';

const ACTION_ICONS = {
  item_created: '➕',
  item_updated: '✏️',
  item_deleted: '🗑️',
  panel_created: '📋',
  panel_updated: '🔧',
  panel_deleted: '❌',
  panel_copied: '📝',
  panel_toggled: '✅',
  division_created: '📂',
  division_updated: '🔄',
  division_deleted: '🗂️',
  admin_approval: '👑',
  client_approval: '🤝',
  ready_for_review: '🔍',
};

export default function ActivityLog({ projectId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get(`/projects/${projectId}/activity`)
      .then(r => setLogs(r.data.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="empty"><span className="spinner" /></div>;

  if (!logs.length) {
    return (
      <div className="empty">
        <div className="empty-icon">📭</div>
        <p>No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {logs.map((log, i) => (
        <motion.div key={log.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.02, duration: 0.2 }}
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '8px 12px', background: 'var(--panel2)', borderRadius: 6,
            border: '1px solid var(--border)', fontSize: 13,
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
            {ACTION_ICONS[log.action] || '📌'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text)' }}>
              <strong>{log.performer_name}</strong>
              {log.action === 'item_updated' && log.field_name === 'multiple' && (
                <span> updated item #{log.item_id}: <span style={{ color: 'var(--accent2)', fontSize: 12 }}>{log.new_value}</span></span>
              )}
              {log.action === 'item_updated' && log.field_name !== 'multiple' && (
                <span> updated item #{log.item_id} ({log.field_name}: <span style={{ color: 'var(--accent2)' }}>{log.new_value}</span>)</span>
              )}
              {log.action === 'item_created' && <span> added item #{log.item_id}</span>}
              {log.action === 'item_deleted' && <span> deleted item #{log.item_id} (was ${log.old_value})</span>}
              {log.action === 'panel_created' && <span> created panel ({log.new_value})</span>}
              {log.action === 'panel_deleted' && <span> deleted panel "{log.old_value}"</span>}
              {log.action === 'panel_copied' && <span> copied panel "{log.new_value}" from project</span>}
              {log.action === 'panel_toggled' && <span> toggled panel to {log.new_value === '1' ? '✅ completed' : '⬜ incomplete'}</span>}
              {log.action === 'panel_updated' && <span> updated panel markups: {log.new_value}</span>}
              {log.action === 'division_created' && <span> created division ({log.new_value})</span>}
              {log.action === 'division_updated' && <span> updated division</span>}
              {log.action === 'division_deleted' && <span> deleted division ({log.old_value})</span>}
              {log.action === 'admin_approval' && <span> set admin approval → <strong>{log.new_value}</strong></span>}
              {log.action === 'client_approval' && <span> set client approval → <strong>{log.new_value}</strong></span>}
              {log.action === 'ready_for_review' && <span> marked project as <strong>ready for review</strong></span>}
              {!ACTION_ICONS[log.action] && <span> {log.action}: {log.field_name} = {log.new_value}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {log.performer_role} · {new Date(log.created_at).toLocaleString()}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
