import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';

const STATUS_BADGE = { draft:'badge-gray', active:'badge-blue', completed:'badge-green', cancelled:'badge-red' };
const APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };
const ADMIN_APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };

function DemandRow({ item, onExpand, expanded }) {
  const shortage = item.has_shortage;
  const conflict = item.has_conflict;

  return (
    <>
      <tr
        onClick={() => onExpand(item.product_id)}
        style={{ cursor: 'pointer', background: shortage ? 'rgba(239,68,68,0.05)' : conflict ? 'rgba(245,158,11,0.04)' : '' }}
      >
        <td>
          {shortage
            ? <span title="Shortage — stock less than demanded">🔴</span>
            : conflict
            ? <span title="Multiple projects need this">🟡</span>
            : <span title="OK">🟢</span>
          }
        </td>
        <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{item.reference}</td>
        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={item.description}>
          {item.description || '—'}
        </td>
        <td><span className="badge badge-purple">{item.brand_name || '—'}</span></td>
        <td className="mono">{item.stock_qty}</td>
        <td className="mono" style={{ color: item.available_qty > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
          {item.available_qty}
        </td>
        <td className="mono" style={{ color: shortage ? 'var(--danger)' : 'var(--accent2)', fontWeight: 700 }}>
          {item.total_demanded}
        </td>
        <td className="mono" style={{ color: conflict ? 'var(--accent2)' : 'var(--muted)' }}>
          {item.demands.length}
        </td>
        <td style={{ color: 'var(--muted)', fontSize: 18 }}>{expanded ? '▲' : '▼'}</td>
      </tr>

      {/* Expanded demands */}
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0 }}>
            <div style={{ background: 'var(--panel2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <th style={{ padding: '6px 16px' }}>Admin</th>
                      <th style={{ padding: '6px 8px' }}>Client</th>
                      <th style={{ padding: '6px 8px' }}>Project ID</th>
                      <th style={{ padding: '6px 8px' }}>Project Name</th>
                      <th style={{ padding: '6px 8px' }}>Engineer</th>
                      <th style={{ padding: '6px 8px' }}>Client</th>
                      <th style={{ padding: '6px 8px' }}>Qty Needed</th>
                      <th style={{ padding: '6px 8px' }}>Status</th>
                      <th style={{ padding: '6px 8px' }}>Deadline</th>
                    </tr>
                </thead>
                <tbody>
                  {item.demands.map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(30,48,84,0.5)' }}>
                      <td style={{ padding: '7px 16px' }}>
                        <span className={`badge ${ADMIN_APPROVAL_BADGE[d.admin_approval] || 'badge-gray'}`}>{d.admin_approval||'pending'}</span>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <span className={`badge ${APPROVAL_BADGE[d.client_approval] || 'badge-gray'}`}>{d.client_approval}</span>
                      </td>
                      <td style={{ padding: '7px 16px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>#{d.project_id}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 600, color: 'var(--white)' }}>{d.project_name}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--muted)' }}>{d.engineer_name || '—'}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--muted)' }}>{d.client_name || '—'}</td>
                      <td style={{ padding: '7px 8px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)', fontSize: 14 }}>
                        {d.qty}
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <span className={`badge ${STATUS_BADGE[d.project_status] || 'badge-gray'}`}>{d.project_status}</span>
                      </td>
                      <td style={{ padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                        {d.deadline ? d.deadline.split('T')[0] : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Stock breakdown */}
              <div style={{ padding: '8px 16px 10px', display: 'flex', gap: 20, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                <span>Stock: <strong style={{ color: 'var(--white)' }}>{item.stock_qty}</strong></span>
                <span>Total Demanded: <strong style={{ color: item.has_shortage ? 'var(--danger)' : 'var(--accent2)' }}>{item.total_demanded}</strong></span>
                {item.has_shortage && (
                  <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                    ⚠ Shortage: need {item.total_demanded - item.stock_qty} more units
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ReservationsPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [filter, setFilter]   = useState('all'); // all | conflict | shortage | ok

  const load = async () => {
    setLoading(true);
    console.log('[Reservations] Loading demand overview...');
    try {
      const r = await api.get('/reservations');
      setData(r.data);
      console.log('[Reservations] Loaded:', r.data.summary);
    } catch (e) {
      toast.error('❌ ' + e.message);
      console.error('[Reservations] Load error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = data?.items?.filter(item => {
    if (filter === 'shortage') return item.has_shortage;
    if (filter === 'conflict') return item.has_conflict;
    if (filter === 'ok')       return !item.has_shortage && !item.has_conflict;
    return true;
  }) || [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📊 Stock Demand Tracker</div>
          <div className="page-subtitle">
            See which products are needed across all active projects — click a row to expand
          </div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? <><span className="spinner" /> Refreshing...</> : '🔄 Refresh'}
        </button>
      </div>

      {/* Summary stats */}
      {data?.summary && (
        <div className="stats-row">
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: filter === 'all' ? 'var(--accent)' : 'var(--border)' }} onClick={() => setFilter('all')}>
            <div className="stat-value">{data.summary.total_products}</div>
            <div className="stat-label">Products Demanded</div>
          </div>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: filter === 'shortage' ? 'var(--danger)' : 'var(--border)' }} onClick={() => setFilter('shortage')}>
            <div className="stat-value" style={{ color: data.summary.shortages > 0 ? 'var(--danger)' : 'var(--muted)' }}>
              🔴 {data.summary.shortages}
            </div>
            <div className="stat-label">Shortages</div>
          </div>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: filter === 'conflict' ? 'var(--accent2)' : 'var(--border)' }} onClick={() => setFilter('conflict')}>
            <div className="stat-value" style={{ color: data.summary.conflicts > 0 ? 'var(--accent2)' : 'var(--muted)' }}>
              🟡 {data.summary.conflicts}
            </div>
            <div className="stat-label">Multi-Project Conflicts</div>
          </div>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: filter === 'ok' ? 'var(--success)' : 'var(--border)' }} onClick={() => setFilter('ok')}>
            <div className="stat-value" style={{ color: 'var(--success)' }}>🟢 {data.summary.ok}</div>
            <div className="stat-label">No Issues</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 12, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
        <span>🔴 Shortage — total demand exceeds stock</span>
        <span>🟡 Conflict — 2+ projects need this item</span>
        <span>🟢 OK — no issues</span>
        <span style={{ marginLeft: 'auto' }}>Click any row to see project breakdown</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Brand</th>
                <th>Stock</th>
                <th>Available</th>
                <th>Total Demanded</th>
                <th>Projects</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                  <span className="spinner" /> Loading...
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9}>
                  <div className="empty">
                    <div className="empty-icon">✅</div>
                    <p>{filter === 'all' ? 'No active project demands found.' : `No items with status: ${filter}`}</p>
                  </div>
                </td></tr>
              )}
              {filtered.map(item => (
                <DemandRow
                  key={item.product_id}
                  item={item}
                  expanded={expanded.has(item.product_id)}
                  onExpand={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
