import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';

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
      </div>

      {/* Filters */}
      <div className="search-bar" style={{marginBottom:16}}>
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
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Description</th>
                <th>Brand</th>
                <th>Cost</th>
                <th>Euro €</th>
                <th>USD $</th>
                <th>Stock</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Date Imported</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && !loading && (
                <tr><td colSpan={11}>
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
                  <td className="mono">{fmt(p.price_cost,'')}</td>
                  <td className="mono">{fmt(p.price_euro,'€')}</td>
                  <td className="mono">{fmt(p.price_usd,'$')}</td>
                  <td className="mono">{p.stock_qty}</td>
                  <td>
                    {p.reserved_qty > 0
                      ? <button className="btn btn-sm" style={{background:'rgba(245,158,11,.15)',color:'#fbbf24',border:'1px solid rgba(245,158,11,.3)',cursor:'pointer'}}
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
                  <td>
                    <button className="btn-icon" title="Edit" onClick={()=>setEditing(p)}>✏️</button>
                  </td>
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
      </div>

      {editing  && <EditModal product={editing} onClose={()=>setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}
