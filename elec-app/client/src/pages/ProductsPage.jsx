import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';

function fmt(val, sym='') {
  if (val === null || val === undefined) return <span style={{color:'var(--muted)'}}>—</span>;
  return `${sym}${Number(val).toFixed(2)}`;
}

function StockBadge({ avail }) {
  if (avail > 10)  return <span className="stock-ok">{avail}</span>;
  if (avail > 0)   return <span className="stock-low">{avail}</span>;
  return <span className="stock-none">{avail}</span>;
}

function ReservationModal({ productId, reference, onClose }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[Reservations] Loading for product:', productId);
    api.get(`/products/${productId}`)
      .then(r => { setReservations(r.data.reservations || []); })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [productId]);

  const typeIcon = { individual:'👤', company:'🏢', engineer:'👷', other:'🔹' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Reserved By — {reference}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? <div className="empty"><div className="spinner" />Loading...</div>
          : !reservations.length ? <div className="empty"><p>No active reservations.</p></div>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Qty</th><th>Type</th><th>Reserved By</th><th>Order</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {reservations.map((r,i) => (
                    <tr key={i}>
                      <td className="mono">{r.qty_reserved}</td>
                      <td>{typeIcon[r.reserved_by_type]||'🔹'} {r.reserved_by_type}</td>
                      <td style={{fontWeight:600,color:'var(--white)'}}>{r.reserved_by_name||'—'}</td>
                      <td className="mono">#{r.order_id}</td>
                      <td><span className="badge badge-yellow">{r.order_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState({
    stock_qty:   product.stock_qty ?? 0,
    price_cost:  product.price_cost ?? '',
    price_euro:  product.price_euro ?? '',
    price_usd:   product.price_usd  ?? '',
    description: product.description ?? '',
    smart_code:  product.smart_code ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    console.log('[Products] Saving edit for id:', product.id, form);
    try {
      const r = await api.patch(`/products/${product.id}`, form);
      toast.success(`✅ Product ${product.reference} updated`);
      onSaved(r.data);
      onClose();
    } catch(e) {
      toast.error('❌ ' + e.message);
      console.error('[Products] Edit save error:', e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Edit — {product.reference}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={form.description}
              onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Smart Code</label>
            <input type="text" className="form-input" value={form.smart_code}
              onChange={e=>setForm(f=>({...f,smart_code:e.target.value}))} placeholder="e.g. S12345" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stock Qty</label>
              <input type="number" className="form-input" value={form.stock_qty}
                onChange={e=>setForm(f=>({...f,stock_qty:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Cost Price</label>
              <input type="number" step="0.01" className="form-input" value={form.price_cost}
                placeholder="Purchase cost"
                onChange={e=>setForm(f=>({...f,price_cost:e.target.value}))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Price (EUR €)</label>
              <input type="number" step="0.01" className="form-input" value={form.price_euro}
                onChange={e=>setForm(f=>({...f,price_euro:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Price (USD $)</label>
              <input type="number" step="0.01" className="form-input" value={form.price_usd}
                onChange={e=>setForm(f=>({...f,price_usd:e.target.value}))} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner"/>Saving...</> : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const navigate = useNavigate();
  const { isRole } = useAuth();
  const [products, setProducts]   = useState([]);
  const [brands, setBrands]       = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [brandFilter, setBrand]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [editing, setEditing]     = useState(null);
  const debouncedSearch = useDebounce(search, 300);
  const LIMIT = 50;

  const hideCost = isRole('engineer');

  // ── Manual product request state ──
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', description: '', price_usd: '', price_euro: '', brand: '', reference: '' });
  const [submitting, setSubmitting] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showPending, setShowPending] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      const r = await api.get('/manual-product-requests', { params: { status: 'pending' } });
      setPendingRequests(r.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!isRole('engineer')) loadPending();
  }, [loadPending, isRole]);

  const handleManualSubmit = async () => {
    if (!manualForm.name.trim()) { toast.error('Product name is required'); return; }
    setSubmitting(true);
    try {
      const r = await api.post('/manual-product-requests', manualForm);
      if (r.data.auto_approved) {
        toast.success('✅ Product added directly');
      } else {
        toast.success('⏳ Request sent for owner approval');
      }
      setManualForm({ name: '', description: '', price_usd: '', price_euro: '', brand: '', reference: '' });
      setShowManualForm(false);
      load(); // Refresh products table
      if (!isRole('engineer')) loadPending();
    } catch (e) {
      toast.error('❌ ' + e.message);
    } finally { setSubmitting(false); }
  };

  const handleApproveRequest = async (id) => {
    try {
      await api.patch(`/manual-product-requests/${id}/approve`);
      toast.success('✅ Product approved');
      loadPending();
      load();
    } catch (e) { toast.error('❌ ' + e.message); }
  };

  const handleRejectRequest = async (id) => {
    const reason = prompt('Rejection reason (optional):');
    try {
      await api.patch(`/manual-product-requests/${id}/reject`, { reason: reason || null });
      toast.success('Request rejected');
      loadPending();
    } catch (e) { toast.error('❌ ' + e.message); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    console.log('[Products] Fetching page:', page, 'search:', debouncedSearch, 'brand:', brandFilter);
    try {
      const r = await api.get('/products', { params: { page, limit: LIMIT, search: debouncedSearch, brand: brandFilter } });
      setProducts(r.data.products);
      setTotal(r.data.total);
      console.log('[Products] Loaded:', r.data.products.length, '/', r.data.total);
    } catch(e) {
      toast.error('❌ ' + e.message);
      console.error('[Products] Load error:', e.message);
    } finally { setLoading(false); }
  }, [page, debouncedSearch, brandFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/brands').then(r => setBrands(r.data)).catch(()=>{});
  }, []);
  useEffect(() => { setPage(1); }, [debouncedSearch, brandFilter]);

  const totalPages = Math.ceil(total / LIMIT);

  const onSaved = (updated) => {
    setProducts(ps => ps.map(p => p.id === updated.id ? updated : p));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📦 Products</div>
          <div className="page-subtitle">{total} products across {brands.length} brands</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowManualForm(!showManualForm)}>
            {showManualForm ? '✕ Close' : '➕ Manual Product'}
          </button>
        </div>
      </div>

      {/* ── Manual Product Request Form ── */}
      {showManualForm && (
        <motion.div className="card" style={{ marginBottom: 16 }}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.2 }}
        >
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>
              ➕ Add Manual Product
            </h3>
            <div className="manual-prod-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Product Name *</label>
                <input className="form-input" placeholder="Enter product name" value={manualForm.name}
                  onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} placeholder="Product description" value={manualForm.description}
                  onChange={e => setManualForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Price USD ($)</label>
                <input type="number" step="0.01" min="0" className="form-input" placeholder="0.00" value={manualForm.price_usd}
                  onChange={e => setManualForm(f => ({ ...f, price_usd: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Price EUR (€)</label>
                <input type="number" step="0.01" min="0" className="form-input" placeholder="0.00" value={manualForm.price_euro}
                  onChange={e => setManualForm(f => ({ ...f, price_euro: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Brand</label>
                <input className="form-input" placeholder="Brand name" value={manualForm.brand}
                  onChange={e => setManualForm(f => ({ ...f, brand: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Reference</label>
                <input className="form-input" placeholder="Optional" value={manualForm.reference}
                  onChange={e => setManualForm(f => ({ ...f, reference: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowManualForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleManualSubmit} disabled={submitting}>
                {submitting ? <><span className="spinner" /> Submitting...</> : isRole('owner') ? '💾 Save to Database' : '📤 Submit for Approval'}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Pending Approvals (owner only) ── */}
      {!isRole('engineer') && pendingRequests.length > 0 && (
        <motion.div className="card" style={{ marginBottom: 16, border: '1px solid rgba(245,158,11,0.3)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent2)' }}>
                ⏳ Pending Manual Product Approvals ({pendingRequests.length})
              </h3>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowPending(!showPending)}>
                {showPending ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {showPending && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)' }}>By</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)' }}>Price USD</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)' }}>Price EUR</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--muted)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--white)' }}>
                          {r.name}
                          {r.brand && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>({r.brand})</span>}
                        </td>
                        <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{r.created_by_name}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {r.price_usd ? `$${parseFloat(r.price_usd).toFixed(2)}` : '—'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {r.price_euro ? `€${parseFloat(r.price_euro).toFixed(2)}` : '—'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: 'none', marginRight: 4 }}
                            onClick={() => handleApproveRequest(r.id)}>✓ Approve</button>
                          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: 'none' }}
                            onClick={() => handleRejectRequest(r.id)}>✕ Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div className="search-bar" style={{marginBottom:16}}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05, ease: 'easeOut' }}
      >
        <input
          className="form-input" style={{maxWidth:300}}
          placeholder="🔍 Search reference or description..."
          value={search} onChange={e=>setSearch(e.target.value)}
        />
        <select className="form-select" style={{width:180}} value={brandFilter} onChange={e=>setBrand(e.target.value)}>
          <option value="">All Brands</option>
          {brands.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        {loading && <span className="spinner" />}
      </motion.div>

      {/* Table */}
      <motion.div className="card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Description</th>
                <th>Brand</th>
                <th>Smart Code</th>
                {!hideCost && <th>Cost</th>}
                <th>Euro €</th>
                <th>USD $</th>
                <th>Stock</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Date Imported</th>
                {!hideCost && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && !loading && (
                <tr><td colSpan={hideCost ? 10 : 12}>
                  <div className="empty">
                    <div className="empty-icon">📭</div>
                    <p>No products found. Import an Excel file to get started.</p>
                  </div>
                </td></tr>
              )}
              {products.map(p => (
                <tr key={p.id}>
                  <td className="mono" style={{fontWeight:600,color:'var(--accent)'}}>{p.reference}</td>
                  <td style={{maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={p.description}>{p.description||'—'}</td>
                  <td><span className="badge badge-purple">{p.brand_name||'—'}</span></td>
                  <td className="mono" style={{fontSize:12,color:'var(--muted)'}}>{p.smart_code || '—'}</td>
                  {!hideCost && <td className="mono">{fmt(p.price_cost,'')}</td>}
                  <td className="mono">{fmt(p.price_euro,'€')}</td>
                  <td className="mono">{fmt(p.price_usd,'$')}</td>
                  <td className="mono">{p.stock_qty}</td>
                  <td>
                    {p.reserved_qty > 0
                      ? <button className="btn btn-sm" style={{background:'rgba(245,158,11,.15)',color:'var(--badge-yellow)',border:'1px solid rgba(245,158,11,.3)',cursor:'pointer'}}
                          onClick={()=>navigate('/reservations')}>
                          {p.reserved_qty} reserved
                        </button>
                      : <span className="mono" style={{color:'var(--muted)'}}>0</span>
                    }
                  </td>
                  <td><StockBadge avail={p.available_qty} /></td>
                  <td className="mono" style={{fontSize:12,color:'var(--muted)'}}>
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                  </td>
                  {!hideCost && (
                    <td>
                      <button className="btn-icon" title="Edit" onClick={()=>setEditing(p)}>✏️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination" style={{padding:'12px 16px'}}>
            <button className="btn btn-sm btn-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
            <span>Page {page} / {totalPages} ({total} total)</span>
            <button className="btn btn-sm btn-secondary" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
          </div>
        )}
      </motion.div>

      {editing  && <EditModal product={editing} onClose={()=>setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}
