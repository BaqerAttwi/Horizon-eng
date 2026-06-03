import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';

const STATUS_BADGE = { draft:'badge-gray', active:'badge-blue', completed:'badge-green', cancelled:'badge-red' };
const APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };
const ADMIN_APPROVAL_BADGE = { pending:'badge-yellow', approved:'badge-green', rejected:'badge-red' };

function DemandRow({ item, onExpand, expanded, onReserve, onRelease, loadingReserve }) {
  const shortage = item.has_shortage;
  const conflict = item.has_conflict;
  const urgent = item.has_urgent_deadline;

  return (
    <>
      <tr
        onClick={() => onExpand(item.product_id)}
        style={{
          cursor: 'pointer',
          background: shortage ? 'rgba(239,68,68,0.05)' : urgent ? 'rgba(245,158,11,0.04)' : '',
        }}
      >
        <td>
          {shortage
            ? <span title="Shortage — stock less than demanded">🔴</span>
            : conflict
            ? <span title="Multiple projects need this">🟡</span>
            : urgent
            ? <span title="Urgent — project deadline within 7 days">🟠</span>
            : <span title="OK">🟢</span>
          }
        </td>
        <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{item.reference}</td>
        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={item.description}>
          {item.description || '—'}
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--badge-yellow)' }}>{item.smart_code || '—'}</td>
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
          <td colSpan={10} style={{ padding: 0 }}>
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
                  {item.demands.map((d, i) => {
                    const isUrgent = d.deadline && new Date(d.deadline) - new Date() < 7 * 86400000;
                    return (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)', background: isUrgent ? 'rgba(239,68,68,0.03)' : '' }}>
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
                        <td style={{
                          padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 11,
                          color: isUrgent ? 'var(--danger)' : 'var(--muted)',
                          fontWeight: isUrgent ? 700 : 400,
                        }}>
                          {d.deadline ? d.deadline.split('T')[0] : '—'}
                          {isUrgent && <span style={{ marginLeft: 4 }}>⚠</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Stock breakdown + Reserve/Release */}
              <div style={{ padding: '8px 16px 10px', display: 'flex', gap: 20, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Stock: <strong style={{ color: 'var(--white)' }}>{item.stock_qty}</strong></span>
                <span>Reserved: <strong style={{ color: 'var(--accent)' }}>{item.reserved_qty}</strong></span>
                <span>Available: <strong style={{ color: item.available_qty > 0 ? 'var(--success)' : 'var(--danger)' }}>{item.available_qty}</strong></span>
                <span>Total Demanded: <strong style={{ color: item.has_shortage ? 'var(--danger)' : 'var(--accent2)' }}>{item.total_demanded}</strong></span>
                {item.has_shortage && (
                  <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                    ⚠ Shortage: need {item.total_demanded - item.stock_qty} more units
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={(e) => { e.stopPropagation(); onRelease(item.product_id, 1); }}
                    disabled={loadingReserve === item.product_id || item.reserved_qty < 1}
                    title="Release 1 unit from reserved"
                  >
                    -1 Release
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(e) => { e.stopPropagation(); onReserve(item.product_id, 1); }}
                    disabled={loadingReserve === item.product_id || item.available_qty < 1}
                    title="Reserve 1 unit"
                  >
                    +1 Reserve
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ReservationsPage() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [loadingReserve, setLoadingReserve] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState(null);
  const [sortDir, setSortDir]   = useState('asc');
  const [approvedOnly, setApprovedOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/reservations');
      setData(r.data);
    } catch (e) {
      toast.error('❌ ' + e.message);
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

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleReserve = async (productId, qty) => {
    setLoadingReserve(productId);
    try {
      const r = await api.patch(`/reservations/product/${productId}/reserved-qty`, { action: 'reserve', qty });
      toast.success(`✅ Reserved ${qty} unit(s)`);
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => {
            if (item.product_id === productId) {
              return {
                ...item,
                reserved_qty: r.data.reserved_qty,
                available_qty: r.data.available_qty,
                has_shortage: item.total_demanded > r.data.available_qty,
              };
            }
            return item;
          }),
        };
      });
    } catch (e) {
      toast.error('❌ ' + (e.response?.data?.error || e.message));
    } finally {
      setLoadingReserve(null);
    }
  };

  const handleRelease = async (productId, qty) => {
    setLoadingReserve(productId);
    try {
      const r = await api.patch(`/reservations/product/${productId}/reserved-qty`, { action: 'release', qty });
      toast.success(`✅ Released ${qty} unit(s)`);
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => {
            if (item.product_id === productId) {
              return {
                ...item,
                reserved_qty: r.data.reserved_qty,
                available_qty: r.data.available_qty,
                has_shortage: item.total_demanded > r.data.available_qty,
              };
            }
            return item;
          }),
        };
      });
    } catch (e) {
      toast.error('❌ ' + (e.response?.data?.error || e.message));
    } finally {
      setLoadingReserve(null);
    }
  };

  // ── Filtering pipeline ──
  let filtered = data?.items || [];

  // Approval filter
  if (approvedOnly) {
    filtered = filtered.map(item => {
      const approvedDemands = item.demands.filter(d =>
        d.admin_approval === 'approved' && d.client_approval === 'approved'
      );
      if (approvedDemands.length === 0) return null;
      const total_demanded = approvedDemands.reduce((s, d) => s + d.qty, 0);
      return {
        ...item,
        demands: approvedDemands,
        total_demanded,
        has_shortage: total_demanded > item.stock_qty,
        has_conflict: approvedDemands.length > 1,
      };
    }).filter(Boolean);
  }

  // Category filter
  if (filter === 'shortage') filtered = filtered.filter(item => item.has_shortage);
  else if (filter === 'conflict') filtered = filtered.filter(item => item.has_conflict);
  else if (filter === 'ok') filtered = filtered.filter(item => !item.has_shortage && !item.has_conflict);

  // Search filter
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(item =>
      (item.reference && item.reference.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.smart_code && item.smart_code.toLowerCase().includes(q)) ||
      (item.brand_name && item.brand_name.toLowerCase().includes(q))
    );
  }

  // Urgency indicator (computed after filters)
  filtered = filtered.map(item => ({
    ...item,
    has_urgent_deadline: item.demands.some(d => d.deadline && new Date(d.deadline) - new Date() < 7 * 86400000),
  }));

  // Sort
  if (sortKey) {
    const getVal = (item) => {
      switch (sortKey) {
        case 'reference': return item.reference || '';
        case 'description': return item.description || '';
        case 'smart_code': return item.smart_code || '';
        case 'brand': return item.brand_name || '';
        case 'stock': return item.stock_qty;
        case 'available': return item.available_qty;
        case 'demanded': return item.total_demanded;
        case 'projects': return item.demands.length;
        case 'status': return item.has_shortage ? 0 : item.has_urgent_deadline ? 1 : item.has_conflict ? 2 : 3;
        default: return '';
      }
    };
    filtered.sort((a, b) => {
      const av = getVal(a), bv = getVal(b);
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }

  const SORT_ARROW = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const canSort = (key) => ({
    onClick: () => handleSort(key),
    style: { cursor: 'pointer', userSelect: 'none' },
  });

  const handleCsvDownload = () => {
    const a = document.createElement('a');
    a.href = '/api/export/reservations';
    a.download = '';
    a.click();
  };

  const SHOW_LEGEND = filtered.length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📊 Stock Demand Tracker</div>
          <div className="page-subtitle">
            See which products are needed across all active projects — click a row to expand
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleCsvDownload}>
            📥 CSV
          </button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? <><span className="spinner" /> Refreshing...</> : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {data?.summary && (
        <motion.div className="stats-row"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
          }}
        >
          {[
            { key: 'all',     label: 'Products Demanded',     value: data.summary.total_products,     color: null,                     borderC: 'var(--accent)' },
            { key: 'shortage',label: 'Shortages',             value: `🔴 ${data.summary.shortages}`,  color: data.summary.shortages > 0 ? 'var(--danger)' : 'var(--muted)', borderC: 'var(--danger)' },
            { key: 'conflict',label: 'Multi-Project Conflicts',value: `🟡 ${data.summary.conflicts}`, color: data.summary.conflicts > 0 ? 'var(--accent2)' : 'var(--muted)', borderC: 'var(--accent2)' },
            { key: 'ok',      label: 'No Issues',             value: `🟢 ${data.summary.ok}`,         color: 'var(--success)',        borderC: 'var(--success)' },
          ].map(c => (
            <motion.div key={c.key} className="stat-card"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
              }}
              style={{ cursor: 'pointer', borderColor: filter === c.key ? c.borderC : 'var(--border)' }}
              onClick={() => setFilter(c.key)}
              whileHover={{ scale: 1.02, borderColor: c.borderC }}
              transition={{ duration: 0.15 }}
            >
              <div className="stat-value" style={{ color: c.color || 'var(--white)' }}>{c.value}</div>
              <div className="stat-label">{c.label}</div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Search + Toggles bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search reference, description, smart code, brand..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 260px', minWidth: 180, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: 13 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={approvedOnly} onChange={e => setApprovedOnly(e.target.checked)} />
          Only approved projects
        </label>
        {search && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} of {data?.items?.length || 0} products
          </span>
        )}
      </div>

      {/* Legend */}
      {SHOW_LEGEND && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 12, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
          <span>🔴 Shortage</span>
          <span>🟡 Conflict</span>
          <span>🟠 Urgent (≤7 days)</span>
          <span>🟢 OK</span>
          <span style={{ marginLeft: 'auto' }}>Click row to expand + reserve/release</span>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th {...canSort('status')}>Status{SORT_ARROW('status')}</th>
                <th {...canSort('reference')}>Reference{SORT_ARROW('reference')}</th>
                <th {...canSort('description')}>Description{SORT_ARROW('description')}</th>
                <th {...canSort('smart_code')}>Smart Code{SORT_ARROW('smart_code')}</th>
                <th {...canSort('brand')}>Brand{SORT_ARROW('brand')}</th>
                <th {...canSort('stock')}>Stock{SORT_ARROW('stock')}</th>
                <th {...canSort('available')}>Available{SORT_ARROW('available')}</th>
                <th {...canSort('demanded')}>Total Demanded{SORT_ARROW('demanded')}</th>
                <th {...canSort('projects')}>Projects{SORT_ARROW('projects')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}>
                  <span className="spinner" /> Loading...
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10}>
                  <div className="empty">
                    <div className="empty-icon">✅</div>
                    <p>{search ? 'No products match your search.' : filter !== 'all' ? `No items with status: ${filter}` : 'No active project demands found.'}</p>
                  </div>
                </td></tr>
              )}
              {filtered.map(item => (
                <DemandRow
                  key={item.product_id}
                  item={item}
                  expanded={expanded.has(item.product_id)}
                  onExpand={toggle}
                  onReserve={handleReserve}
                  onRelease={handleRelease}
                  loadingReserve={loadingReserve}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
