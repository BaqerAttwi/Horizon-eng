import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

function fmt(val) {
  if (val === null || val === undefined) return '—';
  return Number(val).toFixed(2);
}

function StatusBadge({ status }) {
  const colors = {
    pending: { bg: 'rgba(245,158,11,.15)', color: 'var(--badge-yellow)', border: 'rgba(245,158,11,.3)' },
    approved: { bg: 'rgba(34,197,94,.15)', color: 'var(--badge-green)', border: 'rgba(34,197,94,.3)' },
    rejected: { bg: 'rgba(239,68,68,.15)', color: 'var(--badge-red)', border: 'rgba(239,68,68,.3)' },
  };
  const s = colors[status] || colors.pending;
  return (
    <span className="badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

function ChangeRow({ label, oldVal, newVal }) {
  const changed = String(oldVal) !== String(newVal);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}:</span>
      <span>
        {changed ? (
          <>
            <span style={{ textDecoration: 'line-through', color: 'var(--badge-red)', marginRight: 6 }}>{fmt(oldVal)}</span>
            <span style={{ color: 'var(--badge-green)', fontWeight: 600 }}>{fmt(newVal)}</span>
          </>
        ) : (
          <span style={{ color: 'var(--muted)' }}>{fmt(oldVal)}</span>
        )}
      </span>
    </div>
  );
}

function RejectModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    setSaving(true);
    try {
      await api.patch(`/price-changes/${request.id}/reject`, { rejection_reason: reason });
      toast.success('Request rejected');
      onDone();
      onClose();
    } catch (e) {
      toast.error('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Reject Price Change — Item #{request.item_id}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Rejection Reason (optional)</label>
            <textarea
              className="form-textarea"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this price change is rejected..."
              rows={3}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ background: 'var(--badge-red)' }} onClick={handleReject} disabled={saving}>
            {saving ? <><span className="spinner"/>Processing...</> : '🚫 Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PriceChangesPage() {
  const { isRole } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [rejecting, setRejecting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/price-changes', { params: { status: filter } });
      setRequests(r.data);
    } catch (e) {
      toast.error('❌ ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    try {
      await api.patch(`/price-changes/${id}/approve`);
      toast.success('✅ Price change approved and applied');
      load();
    } catch (e) {
      toast.error('❌ ' + e.message);
    }
  };

  const isAdmin = isRole('owner');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">💰 Price Change Requests</div>
          <div className="page-subtitle">{requests.length} requests</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['pending', 'approved', 'rejected', 'all'].map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : !requests.length ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">📭</div>
            <p>No price change requests.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Project</th>
                  <th>Requested By</th>
                  <th>Changes</th>
                  <th>Status</th>
                  <th>Date</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--accent)' }}>
                        {r.reference || r.custom_name || `#${r.item_id}`}
                      </div>
                      {r.brand_name && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.brand_name}</div>}
                    </td>
                    <td>{r.project_name}</td>
                    <td>{r.requested_by_name}</td>
                    <td>
                      <div className="pchange-diff" style={{ minWidth: 200 }}>
                        <ChangeRow label="Base USD" oldVal={r.old_base_price_usd} newVal={r.new_base_price_usd} />
                        <ChangeRow label="Base EUR" oldVal={r.old_base_price_euro} newVal={r.new_base_price_euro} />
                        <ChangeRow label="Markup P%" oldVal={r.old_markupP_pct} newVal={r.new_markupP_pct} />
                        <ChangeRow label="Disc%" oldVal={r.old_discount_pct} newVal={r.new_discount_pct} />
                        <ChangeRow label="Man%" oldVal={r.old_manpower_pct} newVal={r.new_manpower_pct} />
                        <ChangeRow label="MkM%" oldVal={r.old_markupM_pct} newVal={r.new_markupM_pct} />
                        <ChangeRow label="Qty" oldVal={r.old_qty} newVal={r.new_qty} />
                      </div>
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    {isAdmin && r.status === 'pending' && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,.15)', color: 'var(--badge-green)', border: '1px solid rgba(34,197,94,.3)' }}
                            onClick={() => handleApprove(r.id)}>
                            ✅
                          </button>
                          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--badge-red)', border: '1px solid rgba(239,68,68,.3)' }}
                            onClick={() => setRejecting(r)}>
                            🚫
                          </button>
                        </div>
                      </td>
                    )}
                    {isAdmin && r.status !== 'pending' && (
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {r.approved_by_name && `by ${r.approved_by_name}`}
                        {r.rejection_reason && <div style={{ color: 'var(--badge-red)', marginTop: 2 }}>{r.rejection_reason}</div>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={load} />}
    </div>
  );
}
