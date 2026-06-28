import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function RequestsPage() {
  const [pending, setPending] = useState([]);
  const [sent, setSent] = useState([]);
  const [tab, setTab] = useState('incoming');
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [pR, sR] = await Promise.all([
        api.get('/engineer-requests/pending'),
        api.get('/engineer-requests/sent'),
      ]);
      setPending(pR.data);
      setSent(sR.data);
    } catch (e) { toast.error(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRespond = async (id, action) => {
    try {
      if (action === 'reject') {
        setRejectModal(id);
        return;
      }
      await api.patch(`/engineer-requests/${id}/respond`, { action });
      toast.success('Request accepted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) { toast.error('Please provide a reason'); return; }
    try {
      await api.patch(`/engineer-requests/${rejectModal}/respond`, { action: 'reject', rejection_reason: rejectReason });
      toast.success('Request rejected');
      setRejectModal(null);
      setRejectReason('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Revoke this request?')) return;
    try {
      await api.delete(`/engineer-requests/${id}`);
      toast.success('Request revoked');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Engineer Requests</h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'incoming' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('incoming')}>
          Incoming ({pending.length})
        </button>
        <button className={`btn btn-sm ${tab === 'sent' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('sent')}>
          Sent ({sent.length})
        </button>
      </div>

      {tab === 'incoming' && (
        <>
          {pending.length === 0 ? (
            <div className="empty"><p>No pending requests</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pending.map(r => (
                <div key={r.id} style={{ background: 'var(--panel)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--white)' }}>{r.project_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Requested by <strong>{r.requested_by_name}</strong></div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }} onClick={() => handleRespond(r.id, 'accept')}>Accept</button>
                    <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }} onClick={() => handleRespond(r.id, 'reject')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'sent' && (
        <>
          {sent.length === 0 ? (
            <div className="empty"><p>No requests sent</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sent.map(r => (
                <div key={r.id} style={{ background: 'var(--panel)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--white)' }}>{r.project_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>To: <strong>{r.target_name}</strong></div>
                    <div style={{ fontSize: 11, color: r.status === 'accepted' ? 'var(--success)' : r.status === 'rejected' ? 'var(--danger)' : 'var(--muted)' }}>
                      {r.status === 'pending' ? '⏳ Pending' : r.status === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
                      {r.status === 'rejected' && r.rejection_reason && ` — ${r.rejection_reason}`}
                    </div>
                  </div>
                  <div>
                    {r.status === 'pending' && (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleRevoke(r.id)}>Revoke</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {rejectModal && (
        <div className="modal-overlay" onClick={() => { setRejectModal(null); setRejectReason(''); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3>Reject Request</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Provide a reason for rejection:</p>
            <textarea
              className="form-textarea" rows={3}
              style={{ width: '100%', marginTop: 8 }}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Required reason..."
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => { setRejectModal(null); setRejectReason(''); }}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }} onClick={handleRejectConfirm}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
