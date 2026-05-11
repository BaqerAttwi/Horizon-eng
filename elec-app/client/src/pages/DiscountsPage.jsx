import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function DiscountsPage() {
  const { isRole } = useAuth();
  const isOwner = isRole('owner');
  const [discounts, setDiscounts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ brand_id: '', discount_pct: '', notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, bRes] = await Promise.all([
        api.get('/discounts'),
        api.get('/brands'),
      ]);
      setDiscounts(dRes.data);
      setBrands(bRes.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.brand_id) { toast.error('Select a brand'); return; }
    if (!form.discount_pct) { toast.error('Enter discount %'); return; }
    try {
      await api.post('/discounts', {
        brand_id: parseInt(form.brand_id),
        discount_pct: parseFloat(form.discount_pct),
        notes: form.notes || null,
      });
      toast.success('Brand discount added');
      setShowForm(false);
      setForm({ brand_id: '', discount_pct: '', notes: '' });
      load();
    } catch (e) { toast.error(e.message); }
  };

  const del = async (id) => {
    if (!confirm('Delete this discount?')) return;
    try {
      await api.delete(`/discounts/${id}`);
      toast.success('Discount deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const brandDiscounts = discounts.filter(d => d.brand_id);
  const productDiscounts = discounts.filter(d => d.product_id);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏷️ Brand Discounts</div>
          <div className="page-subtitle">{brandDiscounts.length} brand discounts • {productDiscounts.length} product-specific discounts</div>
        </div>
        {isOwner && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? '✕ Cancel' : '+ Add Brand Discount'}
        </button>}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 32 }}><span className="spinner" /> Loading...</div>}

      {showForm && (
        <div className="card card-body" style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Brand</label>
              <select className="form-select" value={form.brand_id}
                onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}>
                <option value="">— Select Brand —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Discount %</label>
              <input type="number" step="0.1" className="form-input" value={form.discount_pct}
                onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input className="form-input" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label className="form-label">&nbsp;</label>
              <button className="btn btn-primary" onClick={save}>💾 Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Brand</th><th>Discount %</th><th>Notes</th><th>Created</th>
                {isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              {!brandDiscounts.length && !loading && (
                <tr><td colSpan={isOwner ? 5 : 4}><div className="empty"><p>No brand discounts. Add one above.</p></div></td></tr>
              )}
              {brandDiscounts.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{d.brand_name || `Brand #${d.brand_id}`}</td>
                  <td className="mono" style={{ color: 'var(--danger)', fontWeight: 700 }}>{d.discount_pct}%</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{d.notes || '—'}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{d.created_at?.split('T')[0] || '—'}</td>
                  {isOwner && <td>
                    <button className="btn-icon" style={{ color: 'var(--danger)' }}
                      onClick={() => del(d.id)}>🗑</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
