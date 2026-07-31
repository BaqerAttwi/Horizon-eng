import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const METHODS = ['Cash', 'Bank Transfer', 'Check', 'Credit Card', 'Other'];

export default function ProjectPayments({ projectId }) {
  const { isRole } = useAuth();
  const canManage = isRole('owner') || isRole('accounting');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'Bank Transfer', notes: '', next_payment_deadline: '' });

  const load = async () => {
    try {
      const r = await api.get(`/projects/${projectId}/payments`);
      setData(r.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleAdd = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!form.payment_date) { toast.error('Pick a payment date'); return; }
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/payments`, {
        ...form,
        next_payment_deadline: form.next_payment_deadline || null,
      });
      toast.success('Payment recorded');
      setShowAdd(false);
      setForm({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'Bank Transfer', notes: '', next_payment_deadline: '' });
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this payment record?')) return;
    try {
      await api.delete(`/projects/${projectId}/payments/${id}`);
      toast.success('Payment removed');
      load();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <div className="empty"><span className="spinner" /></div>;
  if (!data) return null;

  const { payments, total_due, total_paid, outstanding, payment_deadline } = data;
  const pct = total_due > 0 ? Math.min(100, Math.round((total_paid / total_due) * 100)) : 0;
  const deadlineOverdue = payment_deadline && new Date(payment_deadline) < new Date();

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total Due</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--white)' }}>${parseFloat(total_due).toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Paid</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>${parseFloat(total_paid).toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Outstanding</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: outstanding > 0.01 ? 'var(--danger)' : 'var(--success)' }}>
              ${parseFloat(outstanding).toFixed(2)}
            </div>
          </div>
          {outstanding > 0.01 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Next Payment Due</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: payment_deadline ? (deadlineOverdue ? 'var(--danger)' : 'var(--white)') : 'var(--muted)' }}>
                {payment_deadline ? new Date(payment_deadline).toLocaleDateString() : 'Not set'}
                {deadlineOverdue ? ' (overdue)' : ''}
              </div>
            </div>
          )}
          {canManage && (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Record Payment</button>
          )}
        </div>
        <div style={{ height: 8, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--success)' : 'var(--accent)', transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{pct}% paid</div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">💰 Record Payment</span>
              <button className="btn-icon" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount ($) *</label>
                  <input type="number" step="0.01" className="form-input" autoFocus
                    value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-input"
                    value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">Method</label>
                <select className="form-select" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional reference, check #, etc." />
              </div>
              {(outstanding - (parseFloat(form.amount) || 0)) > 0.01 && (
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label className="form-label">Deadline for Next Payment (optional)</label>
                  <input type="date" className="form-input" value={form.next_payment_deadline}
                    onChange={e => setForm(f => ({ ...f, next_payment_deadline: e.target.value }))} />
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                    This project still won't be fully paid after this payment — set when the remaining balance is expected, and you'll get reminded automatically if it's overdue.
                  </div>
                </div>
              )}
              {outstanding > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                  ${parseFloat(outstanding).toFixed(2)} remaining after last recorded payment
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleAdd}>
                {saving ? <span className="spinner" /> : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!payments.length ? (
        <div className="empty">
          <div className="empty-icon">💵</div>
          <p>No payments recorded yet.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Notes</th><th>Recorded By</th>{canManage && <th></th>}</tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--success)' }}>${parseFloat(p.amount).toFixed(2)}</td>
                      <td>{p.method || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.recorded_by_name || '—'}</td>
                      {canManage && (
                        <td>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(p.id)}>✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
