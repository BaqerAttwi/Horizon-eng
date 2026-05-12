import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';

const DIVISION_TYPES = ['INCOMING', 'OUTGOING', 'Enclosure', 'Accessories', 'Measurement'];
const DIVISION_COLORS = { INCOMING: '#3b82f6', OUTGOING: '#10b981', Enclosure: '#8b5cf6', Accessories: '#f59e0b', Measurement: '#ec4899' };

// ── Product Search ────────────────────────────────────────────
function ProductSearch({ onSelect, projectId, exchangeRate }) {
  const [q, setQ] = useState('');
  const [results, setRes] = useState([]);
  const [manuals, setManuals] = useState([]);
  const dq = useDebounce(q, 300);

  useEffect(() => {
    if (!dq.trim()) { setRes([]); return; }
    api.get('/products', { params: { search: dq, limit: 15 } })
      .then(r => setRes(r.data.products || []))
      .catch(() => {});
  }, [dq]);

  useEffect(() => {
    api.get(`/projects/${projectId}/manual-products`)
      .then(r => setManuals(r.data || []))
      .catch(() => {});
  }, [projectId]);

  const displayPrice = (p) => {
    const rate = exchangeRate || 1.08;
    let eur = parseFloat(p.price_euro);
    let usd = parseFloat(p.price_usd);
    if (usd && !eur) eur = usd / rate;
    if (eur && !usd) usd = eur * rate;
    return { eur: eur || 0, usd: usd || 0 };
  };

  return (
    <div style={{ position: 'relative', zIndex: 100 }}>
      <input className="form-input" placeholder="🔍 Search database or type to add manual..."
        value={q} onChange={e => setQ(e.target.value)} />
      {q.trim() && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8,
          maxHeight: 280, overflowY: 'auto', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {results.map(p => {
            const { eur, usd } = displayPrice(p);
            return (
            <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseDown={() => { onSelect({ ...p, source: 'db', price_usd: usd, price_euro: eur }); setQ(''); setRes([]); }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--border)'}
              onMouseOut={e => e.currentTarget.style.background = ''}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{p.reference}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.description}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>${usd.toFixed(2)} / €{eur.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.brand_name}</div>
              </div>
            </div>
            );
          })}
          {manuals.filter(m => m.name.toLowerCase().includes(dq.toLowerCase())).map(m => {
            const rate = exchangeRate || 1.08;
            const eur = parseFloat(m.price_euro) || 0;
            const usd = parseFloat(m.price_usd) || (eur * rate) || 0;
            return (
            <div key={m.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245,158,11,0.05)' }}
              onMouseDown={() => { onSelect({ ...m, source: 'manual', price_usd: usd, price_euro: eur }); setQ(''); }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--border)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(245,158,11,0.05)'}
            >
              <div>
                <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600 }}>📝 {m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Manual — {m.brand || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>${usd.toFixed(2)} / €{eur.toFixed(2)}</div>
              </div>
            </div>
            );
          })}
          <div style={{ padding: '8px 12px', textAlign: 'center' }}
            onMouseDown={() => { onSelect({ source: 'new-manual', searchQuery: q }); setQ(''); setRes([]); }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--border)'}
            onMouseOut={e => e.currentTarget.style.background = ''}
          >
            <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>+ Add manually: "{dq}"</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manual Product Modal ──────────────────────────────────────
function ManualProductModal({ project, onClose, onSaved, prefill }) {
  const [form, setForm] = useState({
    name: prefill?.searchQuery || '', description: '', price_euro: '', price_usd: '', brand: ''
  });

  const convertEur = (euro) => {
    const rate = project.exchange_rate_eur_usd || 1.08;
    setForm(f => ({ ...f, price_euro: euro, price_usd: euro ? (parseFloat(euro) * rate).toFixed(2) : '' }));
  };
  const convertUsd = (usd) => {
    const rate = project.exchange_rate_eur_usd || 1.08;
    setForm(f => ({ ...f, price_usd: usd, price_euro: usd ? (parseFloat(usd) / rate).toFixed(4) : '' }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    try {
      const r = await api.post(`/projects/${project.id}/manual-products`, form);
      toast.success('Manual product added');
      if (onSaved) onSaved(r.data);
      onClose();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📝 Add Manual Product</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Product Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Brand</label>
            <input className="form-input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Price (EUR €)</label>
              <input type="number" step="0.01" className="form-input" value={form.price_euro}
                onChange={e => convertEur(e.target.value)} placeholder="Auto-converts to USD" />
            </div>
            <div className="form-group">
              <label className="form-label">Price (USD $)</label>
              <input type="number" step="0.01" className="form-input" value={form.price_usd}
                onChange={e => convertUsd(e.target.value)} placeholder="Auto-converts to EUR" />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            Exchange rate: 1 EUR = {project.exchange_rate_eur_usd || 1.08} USD
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>💾 Save</button>
        </div>
      </div>
    </div>
  );
}

// ── CRM Item Row ──────────────────────────────────────────────
function CrmItemRow({ item, division, panel, project, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...item });

  const name = item.is_manual ? (item.custom_name || 'Manual Product') : item.reference;
  const desc = item.is_manual ? (item.custom_desc || '') : (item.product_desc || '');
  const brand = item.is_manual ? (item.custom_brand || '') : (item.brand_name || '');

  const base = parseFloat(item.base_price_usd || 0);
  const baseEur = parseFloat(item.base_price_euro || 0);
  const qty = parseInt(item.qty) || 1;
  const baseTotal = base * qty;
  const mkP = baseTotal * (parseFloat(item.markupP_pct) / 100);
  const afterMkP = baseTotal + mkP;
  const disc = afterMkP * (parseFloat(item.discount_pct) / 100);
  const totalT = afterMkP - disc;
  const man = baseTotal * (parseFloat(item.manpower_pct) / 100);
  const mkM = totalT * (parseFloat(item.markupM_pct) / 100);
  const final = totalT + man + mkM;
  const finalEur = baseEur * (final / (base || 1));

  if (editing) {
    return (
      <tr style={{ background: 'var(--panel2)' }}>
        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>{name}</td>
        <td>
          <input type="number" min={1} className="form-input" style={{ width: 60 }} value={form.qty || 1}
            onChange={e => setForm(f => ({ ...f, qty: parseInt(e.target.value) || 1 }))} />
        </td>
        <td>
          <input type="number" step="0.01" className="form-input" style={{ width: 75 }} value={form.base_price_usd || ''}
            onChange={e => setForm(f => ({ ...f, base_price_usd: parseFloat(e.target.value) || 0 }))} />
        </td>
        <td className="mono" style={{ color: 'var(--muted)', fontWeight: 600 }}>
          ${((parseFloat(form.base_price_usd) || 0) * (parseInt(form.qty) || 1)).toFixed(2)}
        </td>
        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{desc}</td>
        <td style={{ fontSize: 11 }}>{brand || '—'}</td>
        <td>
          <input type="number" step="0.1" className="form-input" style={{ width: 55 }} value={form.markupP_pct}
            onChange={e => setForm(f => ({ ...f, markupP_pct: parseFloat(e.target.value) || 0 }))} />
        </td>
        <td className="mono" style={{ fontSize: 11, color: '#60a5fa' }}>${afterMkP.toFixed(2)}</td>
        <td>
          <input type="number" step="0.1" className="form-input" style={{ width: 55 }} value={form.discount_pct}
            onChange={e => setForm(f => ({ ...f, discount_pct: parseFloat(e.target.value) || 0 }))} />
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>${totalT.toFixed(2)}</td>
        <td>
          <input type="number" step="0.1" className="form-input" style={{ width: 55 }} value={form.manpower_pct}
            onChange={e => setForm(f => ({ ...f, manpower_pct: parseFloat(e.target.value) || 0 }))} />
        </td>
        <td>
          <input type="number" step="0.1" className="form-input" style={{ width: 55 }} value={form.markupM_pct}
            onChange={e => setForm(f => ({ ...f, markupM_pct: parseFloat(e.target.value) || 0 }))} />
        </td>
        <td className="mono" style={{ fontWeight: 700, color: 'var(--success)' }}>${final.toFixed(2)}</td>
        <td>
          <button className="btn btn-sm btn-primary" style={{ marginRight: 4 }}
            onClick={async () => { await onUpdate(item.id, form); setEditing(false); }}>Save</button>
          <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(false); setForm({ ...item }); }}>Cancel</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>{name}</td>
      <td className="mono">{item.qty}</td>
      <td className="mono" style={{ color: 'var(--text)' }}>${base.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>€{baseEur.toFixed(2)}</div></td>
      <td className="mono" style={{ color: 'var(--text)', fontWeight: 700 }}>${baseTotal.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>€{(baseEur * qty).toFixed(2)}</div></td>
      <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</td>
      <td style={{ fontSize: 11 }}>{brand || '—'}</td>
      <td className="mono" style={{ color: 'var(--accent2)' }}>{item.markupP_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${mkP.toFixed(2)}</div></td>
      <td className="mono" style={{ color: '#60a5fa', fontWeight: 600 }}>${afterMkP.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>after markupP</div></td>
      <td className="mono" style={{ color: item.discount_pct > 0 ? 'var(--danger)' : 'var(--muted)' }}>{item.discount_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>-${disc.toFixed(2)}</div></td>
      <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>${totalT.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>T.PriceT</div></td>
      <td className="mono" style={{ color: 'var(--accent2)' }}>{item.manpower_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${man.toFixed(2)}</div></td>
      <td className="mono" style={{ color: '#8b5cf6' }}>{item.markupM_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${mkM.toFixed(2)}</div></td>
      <td className="mono" style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13 }}>${final.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>€{finalEur.toFixed(2)}</div></td>
      <td>
        <button className="btn-icon" title="Edit" onClick={() => setEditing(true)}>✏️</button>
        <button className="btn-icon" title="Delete" style={{ color: 'var(--danger)' }}
          onClick={() => onDelete(item.id)}>✕</button>
      </td>
    </tr>
  );
}

// ── Division Section ──────────────────────────────────────────
function DivisionSection({ division, panel, project, onItemAdd, onItemUpdate, onItemDelete, onDivisionDelete }) {
  const [showAdd, setShowAdd] = useState(false);
  const [manualModal, setManualModal] = useState(null);
  const [pendingQty, setPendingQty] = useState(null);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [pendingManual, setPendingManual] = useState(null);

  const handleProductSelect = async (product) => {
    if (product.source === 'new-manual') {
      setShowAdd(false);
      setManualModal({ searchQuery: product.searchQuery, divisionId: division.id });
      return;
    }
    setPendingProduct(product);
    setPendingQty(1);
  };

  const confirmAdd = async () => {
    const product = pendingProduct;
    if (!product) return;
    const basePriceUsd = product.source === 'manual'
      ? (parseFloat(product.price_usd) || 0)
      : (parseFloat(product.price_usd) || 0);
    const basePriceEur = product.source === 'manual'
      ? (parseFloat(product.price_euro) || 0)
      : (parseFloat(product.price_euro) || 0);

    await onItemAdd(division.id, {
      product_id: product.source === 'db' ? product.id : null,
      manual_product_id: product.source === 'manual' ? product.id : null,
      is_manual: product.source !== 'db',
      custom_name: product.source === 'manual' ? product.name : null,
      custom_desc: product.source === 'manual' ? product.description : null,
      custom_brand: product.source === 'manual' ? product.brand : null,
      custom_price_usd: product.source === 'manual' ? product.price_usd : null,
      custom_price_euro: product.source === 'manual' ? product.price_euro : null,
      base_price_usd: basePriceUsd,
      base_price_euro: basePriceEur,
      qty: pendingQty || 1,
      markupP_pct: division.markupP,
      markupM_pct: division.markupM,
      manpower_pct: division.manpower_pct,
    });
    setShowAdd(false);
    setPendingProduct(null);
    setPendingQty(null);
  };

  const cancelAdd = () => {
    setPendingProduct(null);
    setPendingQty(null);
  };

  const divColor = DIVISION_COLORS[division.division_type] || 'var(--muted)';

  return (
    <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'visible', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: `${divColor}15`, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: divColor, display: 'inline-block' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: divColor }}>{division.division_type}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>({division.item_count} items)</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            markupP:{division.markupP}% markupM:{division.markupM}% manpower:{division.manpower_pct}%
          </span>
        </div>
        <button className="btn-icon" title="Delete division" style={{ color: 'var(--danger)' }}
          onClick={() => onDivisionDelete(division.id)}>✕</button>
      </div>

      {division.items?.length > 0 && (
        <div className="table-wrap">
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Name</th><th>Qty</th><th>Price for 1 $ / €</th><th>Price $ / €</th><th>Description</th><th>Brand</th>
                <th>mkP%</th><th>After MkP $</th><th>Disc%</th><th>T.PriceT $</th>
                <th>Man%</th><th>mkM%</th><th>Final $ / €</th><th></th>
              </tr>
            </thead>
            <tbody>
              {division.items.map(item => (
                <CrmItemRow key={item.id} item={item} division={division} panel={panel} project={project}
                  onUpdate={onItemUpdate} onDelete={onItemDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingProduct && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'rgba(59,130,246,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', marginBottom: 6 }}>
            Add: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{pendingProduct.reference || pendingProduct.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>Quantity:</label>
            <input type="number" min={1} className="form-input" style={{ width: 70 }}
              value={pendingQty} onChange={e => setPendingQty(Math.max(1, parseInt(e.target.value) || 1))} />
            <button className="btn btn-sm btn-primary" onClick={confirmAdd}>Add</button>
            <button className="btn btn-sm btn-secondary" onClick={cancelAdd}>Cancel</button>
          </div>
        </div>
      )}

      {pendingManual && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', marginBottom: 6 }}>
            Add manual product: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>{pendingManual.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>Quantity:</label>
            <input type="number" min={1} className="form-input" style={{ width: 70 }}
              value={pendingQty} onChange={e => setPendingQty(Math.max(1, parseInt(e.target.value) || 1))} />
            <button className="btn btn-sm btn-primary" onClick={confirmManualAdd}>Add</button>
            <button className="btn btn-sm btn-secondary" onClick={() => { setPendingManual(null); setPendingQty(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {showAdd && !pendingProduct && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <ProductSearch onSelect={handleProductSelect} projectId={project.id} exchangeRate={project.exchange_rate_eur_usd} />
        </div>
      )}

      {!showAdd && !pendingProduct && !pendingManual && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowAdd(true)}>+ Add Product</button>
        </div>
      )}

      {manualModal && (
        <ManualProductModal project={project} onClose={() => setManualModal(null)}
          onSaved={handleManualSaved} prefill={{ searchQuery: manualModal.searchQuery }} />
      )}
    </div>
  );
}

// ── Panel Section ─────────────────────────────────────────────
function PanelSection({ panel, project, onUpdatePanel, onDeletePanel, onToggleComplete,
  onAddDivision, onItemAdd, onItemUpdate, onItemDelete, onDivisionDelete, onPanelTotalUpdate }) {

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct });

  const handleSavePanel = async () => {
    await onUpdatePanel(panel.id, form);
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 20, border: panel.is_completed ? '2px solid #22c55e' : '1px solid var(--border)', borderRadius: 10, overflow: 'visible', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--panel2)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--white)' }}>Panel #{panel.panel_number}</span>
          {panel.panel_name && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>— {panel.panel_name}</span>}
          <span style={{ marginLeft: 12, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
            Total: ${(parseFloat(panel.total_price) || 0).toFixed(2)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {editing ? (
            <>
              <button className="btn btn-sm btn-primary" onClick={handleSavePanel}>Save</button>
              <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(false); setForm({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct }); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" style={{ background: panel.is_completed ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)', color: panel.is_completed ? '#22c55e' : '#3b82f6' }}
                onClick={() => onToggleComplete(panel.id)}>
                {panel.is_completed ? '✓ Complete' : '☐ Mark Complete'}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}>Edit Panel</button>
            </>
          )}
          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            onClick={() => onDeletePanel(panel.id)}>Delete</button>
        </div>
      </div>

      {editing && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(59,130,246,0.03)' }}>
          <div className="form-row" style={{ gap: 12 }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Panel Name</label>
              <input className="form-input" value={form.panel_name || ''} onChange={e => setForm(f => ({ ...f, panel_name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">markupP %</label>
              <input type="number" step="0.1" className="form-input" value={form.markupP} onChange={e => setForm(f => ({ ...f, markupP: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">markupM %</label>
              <input type="number" step="0.1" className="form-input" value={form.markupM} onChange={e => setForm(f => ({ ...f, markupM: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Manpower %</label>
              <input type="number" step="0.1" className="form-input" value={form.manpower_pct} onChange={e => setForm(f => ({ ...f, manpower_pct: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
        </div>
      )}

      {panel.divisions?.map(div => (
        <DivisionSection key={div.id} division={div} panel={panel} project={project}
          onItemAdd={onItemAdd} onItemUpdate={onItemUpdate} onItemDelete={onItemDelete}
          onDivisionDelete={onDivisionDelete} />
      ))}

      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        {DIVISION_TYPES.map(type => (
          <button key={type} className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => onAddDivision(panel.id, { division_type: type, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct })}>
            + {type}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main CrmProjectPage ───────────────────────────────────────
export default function CrmProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [panels, setPanels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/projects/${id}/crm`);
      setProject(r.data);
      setPanels(r.data.panels || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Panel CRUD
  const addPanel = async (panel_number) => {
    try {
      const r = await api.post(`/projects/${id}/panels`, { panel_number, markupP: 0, markupM: 0, manpower_pct: 0 });
      setPanels(p => [...p, r.data]);
      toast.success(`Panel #${panel_number} added`);
      setShowAddPanel(false);
    } catch (e) { toast.error(e.message); }
  };

  const updatePanel = async (panelId, form) => {
    try {
      const r = await api.patch(`/projects/${id}/panels/${panelId}`, form);
      setPanels(p => p.map(x => x.id === panelId ? r.data : x));
      toast.success('Panel updated');
    } catch (e) { toast.error(e.message); }
  };

  const deletePanel = async (panelId) => {
    if (!confirm('Delete this panel and all its items?')) return;
    try {
      await api.delete(`/projects/${id}/panels/${panelId}`);
      setPanels(p => p.filter(x => x.id !== panelId));
      toast.success('Panel deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const togglePanelComplete = async (panelId) => {
    try {
      const panel = panels.find(p => p.id === panelId);
      const r = await api.patch(`/projects/${id}/panels/${panelId}/complete`);
      setPanels(p => p.map(x => x.id === panelId ? r.data : x));
      toast.success(r.data.is_completed ? 'Panel marked complete ✓' : 'Panel marked incomplete');
    } catch (e) { toast.error(e.message); }
  };

  // Division CRUD
  const addDivision = async (panelId, divData) => {
    try {
      const r = await api.post(`/projects/${id}/panels/${panelId}/divisions`, divData);
      setPanels(p => p.map(x => x.id === panelId ? { ...x, divisions: [...(x.divisions || []), r.data] } : x));
      toast.success(`${divData.division_type} division added`);
    } catch (e) { toast.error(e.message); }
  };

  const deleteDivision = async (divisionId) => {
    if (!confirm('Delete this division and all items?')) return;
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.id === divisionId);
      await api.delete(`/projects/${id}/panels/${div.panel_id}/divisions/${divisionId}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  // Item CRUD
  const addItem = async (divisionId, itemData) => {
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.id === divisionId);
      const r = await api.post(`/projects/${id}/panels/${div.panel_id}/divisions/${divisionId}/items`, { ...itemData, project_id: parseInt(id) });
      load();
      toast.success('Product added');
    } catch (e) { toast.error(e.message); }
  };

  const updateItem = async (itemId, form) => {
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.items?.some(i => i.id === itemId));
      const panel = panels.find(p => p.divisions?.some(d => d.id === div?.id));
      await api.patch(`/projects/${id}/panels/${panel.id}/divisions/${div.id}/items/${itemId}`, form);
      load();
      toast.success('Item updated');
    } catch (e) { toast.error(e.message); }
  };

  const deleteItem = async (itemId) => {
    if (!confirm('Remove this item?')) return;
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.items?.some(i => i.id === itemId));
      const panel = panels.find(p => p.id === div?.panel_id);
      await api.delete(`/projects/${id}/panels/${panel.id}/divisions/${div.id}/items/${itemId}`);
      load();
      toast.success('Item removed');
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <div className="page"><div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading CRM...</div></div>;
  if (!project) return <div className="page"><div className="empty"><p>Project not found</p></div></div>;

  const projectTotal = panels.reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/projects')}>← Back</button>
            <div className="page-title">🔧 {project.project_name}</div>
          </div>
          <div className="page-subtitle">
            Engineer: {project.engineer_name || '—'} • Client: {project.client_name || '—'} •
            Rate: 1 EUR = {project.exchange_rate_eur_usd} USD •
            Panels: {panels.length} • Total: <strong style={{ color: 'var(--success)' }}>${projectTotal.toFixed(2)}</strong>
          </div>
          {project.total_panels > 0 && (() => {
            const progPct = Math.round((project.completed_panels / project.total_panels) * 100);
            return (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                Progress: {project.completed_panels}/{project.total_panels}
              </div>
              <div style={{ flex: 1, maxWidth: 200, height: 6, background: 'var(--panel2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progPct}%`, height: '100%', background: progPct >= 80 ? 'var(--success)' : progPct >= 40 ? 'var(--accent2)' : 'var(--danger)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
            );
          })()} 
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddPanel(true)}>+ Add Panel</button>
      </div>

      {showAddPanel && (
        <div className="modal-overlay" onClick={() => setShowAddPanel(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">+ Add Panel</span>
              <button className="btn-icon" onClick={() => setShowAddPanel(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Panel Number</label>
                <input type="number" className="form-input" id="panelNumInput" min={1}
                  onKeyDown={e => { if (e.key === 'Enter') addPanel(parseInt(e.target.value)); }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddPanel(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                const input = document.getElementById('panelNumInput');
                if (input && input.value) addPanel(parseInt(input.value));
              }}>Add Panel</button>
            </div>
          </div>
        </div>
      )}

      {panels.length === 0 && (
        <div className="card card-body" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, color: 'var(--white)', marginBottom: 8 }}>No panels yet</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Click "+ Add Panel" to start building your CRM project</div>
        </div>
      )}

      {panels.map(panel => (
        <PanelSection key={panel.id} panel={panel} project={project}
          onUpdatePanel={updatePanel} onDeletePanel={deletePanel} onToggleComplete={togglePanelComplete}
          onAddDivision={addDivision} onItemAdd={addItem} onItemUpdate={updateItem}
          onItemDelete={deleteItem} onDivisionDelete={deleteDivision} />
      ))}
    </div>
  );
}
