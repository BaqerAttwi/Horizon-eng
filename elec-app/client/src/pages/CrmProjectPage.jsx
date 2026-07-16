import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import ActivityLog from '../components/ActivityLog';
import FileAttachments from '../components/FileAttachments';
import SummaryTesting from '../components/SummaryTesting';

const DIVISION_TYPES = ['INCOMING', 'OUTGOING', 'Enclosure', 'Accessories', 'Measurement'];
const DIVISION_COLORS = { INCOMING: '#e11d48', OUTGOING: '#2563eb', Enclosure: '#7c3aed', Accessories: '#d97706', Measurement: '#059669' };

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
        value={q} onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && q.trim() && results.length) {
            const p = results[0];
            const { eur, usd } = displayPrice(p);
            onSelect({ ...p, source: 'db', price_usd: usd, price_euro: eur });
            setQ('');
            setRes([]);
          }
        }} />
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
                {p.smart_code ? <div style={{ fontSize: 10, color: 'var(--badge-yellow)' }}>📌 {p.smart_code}</div> : null}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>${usd.toFixed(2)} / €{eur.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.brand_name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</div>
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

// ── Group Select Modal ─────────────────────────────────────────
function GroupSelectModal({ project, division, panel, onClose, onGroupAdded }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [instanceQty, setInstanceQty] = useState(1);

  useEffect(() => {
    api.get('/item-groups')
      .then(r => setGroups(r.data || []))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const addGroupAsInstance = async (group) => {
    setAdding(true);
    try {
      await api.post(
        `/projects/${project.id}/panels/${panel.id}/divisions/${division.id}/group-instances`,
        { item_group_id: group.id, quantity: instanceQty }
      );
      toast.success(`✅ Group "${group.name}" added as sub-division (×${instanceQty})`);
      if (onGroupAdded) onGroupAdded();
      onClose();
    } catch (e) {
      toast.error('❌ ' + (e.response?.data?.error || e.message));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Group Data</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Group multiplier:</label>
            <input type="number" min={1} className="form-input" style={{ width: 70 }}
              value={instanceQty} onChange={e => setInstanceQty(Math.max(1, parseInt(e.target.value) || 1))} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>(each item qty × multiplier)</span>
          </div>
          {loading ? (
            <div style={{display:'flex',justifyContent:'center',padding:20}}><span className="spinner" /></div>
          ) : groups.length === 0 ? (
            <div className="empty"><div className="empty-icon">📭</div><p>No groups available. Create them in Item Groups page.</p></div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
              {groups.map(g => (
                <div key={g.id} className="card" style={{cursor:'pointer',padding:12,margin:0}}
                  onClick={() => !adding && addGroupAsInstance(g)}>
                  <div style={{fontWeight:700,fontSize:13,color:'var(--white)'}}>{g.name}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>
                    by {g.created_by_name} • {g.item_count} items
                    {g.is_public && <span className="badge badge-green" style={{marginLeft:6,fontSize:9}}>Public</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {adding && <div style={{textAlign:'center',marginTop:8}}><span className="spinner" /> Adding items...</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── CRM Item Row ──────────────────────────────────────────────
function CrmItemRow({ item, division, panel, project, onUpdate, onDelete, hideCost, pendingPriceChange, isSelected, onToggleSelect, editView }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...item });

  const name = item.is_manual ? (item.custom_name || 'Manual Product') : item.reference;
  const desc = item.is_manual ? (item.custom_desc || '') : (item.product_desc || '');
  const brand = item.is_manual ? (item.custom_brand || '') : (item.brand_name || '');
  const notes = item.notes || '';

  const base = parseFloat(item.base_price_usd || 0);
  const baseEur = parseFloat(item.base_price_euro || 0);
  const qty = parseInt(item.qty) || 1;
  const baseTotal = base * qty;
  const discPctVal = parseFloat(item.discount_pct) || 0;
  const disc = baseTotal * (discPctVal / 100);
  const afterDisc = baseTotal - disc;
  const mkPPct = parseFloat(item.markupP_pct) || 0;
  const mkP = afterDisc * (mkPPct / 100);
  const totalT = afterDisc + mkP;
  const manPct = parseFloat(item.manpower_pct) || 0;
  const man = afterDisc * (manPct / 100);
  const mkMPct = parseFloat(item.markupM_pct) || 0;
  const mkM = man * (mkMPct / 100);
  const final = totalT + man + mkM;
  const finalEur = baseEur * (final / (base || 1));
  const cost = parseFloat(item.cost || 0);
  const profit = final - cost;
  const isLoss = final < cost && cost > 0;

  const convertEurEdit = (euro) => {
    const rate = project.exchange_rate_eur_usd || 1.08;
    setForm(f => ({ ...f, base_price_euro: euro, base_price_usd: euro ? (parseFloat(euro) * rate).toFixed(2) : '' }));
  };
  const convertUsdEdit = (usd) => {
    const rate = project.exchange_rate_eur_usd || 1.08;
    setForm(f => ({ ...f, base_price_usd: usd, base_price_euro: usd ? (parseFloat(usd) / rate).toFixed(4) : '' }));
  };

  const handleSave = async () => {
    await onUpdate(item.id, form);
    setEditing(false);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
  };

  if (editing) {
    return (
      <tr className="crm-item-row" style={{ background: 'var(--panel2)' }}>
        <td style={{ textAlign: 'center', verticalAlign: 'middle', width: 28 }}>
          <input type="checkbox" checked={!!isSelected}
            onChange={() => onToggleSelect?.(item.id)}
            style={{ width: 15, height: 15, cursor: 'pointer' }} />
        </td>
        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
          <input type="checkbox" checked={!!form.visible_in_client_pdf}
            onChange={e => setForm(f => ({ ...f, visible_in_client_pdf: e.target.checked ? 1 : 0 }))} />
        </td>
        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', verticalAlign: 'middle' }}>{name}</td>
        <td style={{ verticalAlign: 'middle' }}>
          <input type="number" min={1} className="form-input" style={{ width: 55, padding: '2px 4px', fontSize: 11 }} value={form.qty || 1}
            onChange={e => setForm(f => ({ ...f, qty: parseInt(e.target.value) || 1 }))} onKeyDown={handleKeyDown} />
        </td>
        <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.01" className="form-input" style={{ width: 58, padding: '2px 4px', fontSize: 11 }} value={form.base_price_usd ?? ''}
            onChange={e => convertUsdEdit(e.target.value)} placeholder="USD $" onKeyDown={handleKeyDown} />
          <input type="number" step="0.01" className="form-input" style={{ width: 58, padding: '2px 4px', fontSize: 11, marginTop: 2 }} value={form.base_price_euro ?? ''}
            onChange={e => convertEurEdit(e.target.value)} placeholder="EUR €" onKeyDown={handleKeyDown} />
        </td>
        <td className="mono" style={{ verticalAlign: 'middle', color: 'var(--muted)', fontWeight: 600 }}>
          ${((parseFloat(form.base_price_usd) || 0) * (parseInt(form.qty) || 1)).toFixed(2)}
        </td>
        <td style={{ fontSize: 11, color: 'var(--muted)', verticalAlign: 'middle' }}>{desc}</td>
        <td style={{ fontSize: 11, verticalAlign: 'middle' }}>{brand || '—'}</td>
        <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.1" className="form-input" style={{ width: 48, padding: '2px 4px', fontSize: 11 }} value={form.discount_pct}
            onChange={e => setForm(f => ({ ...f, discount_pct: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>
        <td className="mono" style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, verticalAlign: 'middle' }}>${afterDisc.toFixed(2)}</td>
        <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.1" className="form-input" style={{ width: 48, padding: '2px 4px', fontSize: 11 }} value={form.markupP_pct}
            onChange={e => setForm(f => ({ ...f, markupP_pct: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, verticalAlign: 'middle' }}>${totalT.toFixed(2)}</td>
        <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.1" className="form-input" style={{ width: 48, padding: '2px 4px', fontSize: 11 }} value={form.manpower_pct}
            onChange={e => setForm(f => ({ ...f, manpower_pct: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>
        <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.1" className="form-input" style={{ width: 48, padding: '2px 4px', fontSize: 11 }} value={form.markupM_pct}
            onChange={e => setForm(f => ({ ...f, markupM_pct: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>
        <td className="mono" style={{ fontWeight: 700, color: 'var(--success)', verticalAlign: 'middle' }}>${final.toFixed(2)}</td>
        {!hideCost && <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.01" className="form-input" style={{ width: 62, padding: '2px 4px', fontSize: 11 }} value={form.cost || ''}
            onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>}
        {!hideCost && <td className="mono" style={{ fontWeight: 700, color: (parseFloat(form.cost) ? (final - parseFloat(form.cost)) : final) >= 0 ? 'var(--success)' : 'var(--danger)', verticalAlign: 'middle' }}>
          ${(final - (parseFloat(form.cost) || 0)).toFixed(2)}
        </td>}
        <td style={{ verticalAlign: 'middle' }}>
          <button className="btn btn-sm btn-primary" style={{ marginRight: 4 }}
            onClick={handleSave}>Save</button>
          <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(false); setForm({ ...item }); }}>Cancel</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="crm-item-row" style={{ ...(pendingPriceChange ? { background: 'rgba(245,158,11,0.06)' } : {}), ...(editView ? { cursor: 'pointer' } : {}) }}
      onClick={() => { if (editView) setEditing(true); }}>
      <td style={{ textAlign: 'center', verticalAlign: 'middle', width: 28 }} onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={!!isSelected}
          onChange={() => onToggleSelect?.(item.id)}
          style={{ width: 15, height: 15, cursor: 'pointer' }} />
      </td>
      <td style={{ textAlign: 'center', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
        <span style={{ cursor: 'pointer', fontSize: 14, opacity: item.visible_in_client_pdf ? 1 : 0.35, userSelect: 'none' }}
          onClick={async (e) => { e.stopPropagation(); await onUpdate(item.id, { visible_in_client_pdf: item.visible_in_client_pdf ? 0 : 1 }); }}
          title={item.visible_in_client_pdf ? 'Visible in Client PDF — click to hide' : 'Hidden from Client PDF — click to show'}>
          {item.visible_in_client_pdf ? '👁' : '🚫'}
        </span>
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
        {name}{notes ? <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--muted)', cursor: 'help' }} title={notes}>📝</span> : ''}
        {pendingPriceChange && (
          <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: 'var(--badge-yellow)', fontWeight: 700, cursor: 'help' }}
            title="Price change pending approval">⏳ PENDING</span>
        )}
      </td>
      <td className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>{item.qty}</td>
      <td className="mono" style={{ color: 'var(--text)' }}>${base.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>€{baseEur.toFixed(2)}</div></td>
      <td className="mono" style={{ color: 'var(--text)', fontWeight: 700 }}>${baseTotal.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>€{(baseEur * qty).toFixed(2)}</div></td>
      <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</td>
      <td style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{brand || '—'}</td>
      <td className="mono" style={{ color: item.discount_pct > 0 ? 'var(--danger)' : 'var(--muted)' }}>{item.discount_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>-${disc.toFixed(2)}</div></td>
      <td className="mono" style={{ color: '#60a5fa', fontWeight: 600 }}>${afterDisc.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>after disc</div></td>
      <td className="mono" style={{ color: 'var(--accent2)' }}>{item.markupP_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${mkP.toFixed(2)}</div></td>
      <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>${totalT.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>T.PriceT</div></td>
      <td className="mono" style={{ color: 'var(--accent2)' }}>{item.manpower_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${man.toFixed(2)}</div></td>
      <td className="mono" style={{ color: '#8b5cf6' }}>{item.markupM_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${mkM.toFixed(2)}</div></td>
      <td className="mono" style={{ fontWeight: 700, color: isLoss ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>${final.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>€{finalEur.toFixed(2)}</div></td>
      {!hideCost && <td className="mono" style={{ color: 'var(--muted)' }}>${cost.toFixed(2)}</td>}
      {!hideCost && <td className="mono" style={{ fontWeight: 700, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{profit >= 0 ? '+' : ''}${profit.toFixed(2)}</td>}
      <td onClick={e => e.stopPropagation()}>
        <button className="btn-icon" title="Edit" onClick={() => setEditing(true)}>✏️</button>
        <button className="btn-icon" title="Delete" style={{ color: 'var(--danger)' }}
          onClick={() => onDelete(item.id)}>✕</button>
      </td>
    </tr>
  );
}

// ── Division Section ──────────────────────────────────────────
function DivisionSection({ division, panel, project, onItemAdd, onItemUpdate, onItemDelete, onDivisionDelete, hideCost, pendingPriceChanges,
  onGroupInstanceQtyChange, onGroupInstanceRemove, onGroupAdded, selectedItems, onToggleItem, onSelectAll, editView }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
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

  const handleManualSaved = (manualProduct) => {
    setPendingManual(manualProduct);
    setPendingQty(1);
  };

  const confirmManualAdd = async () => {
    const product = pendingManual;
    if (!product) return;
    await onItemAdd(division.id, {
      product_id: null,
      manual_product_id: product.id,
      is_manual: true,
      custom_name: product.name,
      custom_desc: product.description || '',
      custom_brand: product.brand || '',
      custom_price_usd: product.price_usd || 0,
      custom_price_euro: product.price_euro || 0,
      base_price_usd: parseFloat(product.price_usd) || 0,
      base_price_euro: parseFloat(product.price_euro) || 0,
      qty: pendingQty || 1,
      markupP_pct: division.markupP,
      markupM_pct: division.markupM,
      manpower_pct: division.manpower_pct,
    });
    setPendingManual(null);
    setPendingQty(null);
  };

  const divColor = DIVISION_COLORS[division.division_type] || 'var(--muted)';

  return (
    <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'visible', position: 'relative', background: 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: `${divColor}20`, borderBottom: '1px solid var(--border)' }}>
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
        <div className="table-wrap" style={{ overflowX: 'auto', background: 'var(--panel)' }}>
          <table style={{ fontSize: 12, whiteSpace: 'nowrap', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: 32 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 35 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 38 }} />
              <col style={{ width: 38 }} />
              <col style={{ width: 70 }} />
              {!hideCost && <col style={{ width: 55 }} />}
              {!hideCost && <col style={{ width: 60 }} />}
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 28, textAlign: 'center' }}>
                  <input type="checkbox"
                    checked={division.items.filter(i => !i.source_group_instance_id).length > 0 &&
                      division.items.filter(i => !i.source_group_instance_id).every(i => selectedItems?.has(i.id))}
                    onChange={e => onSelectAll?.(division.id, e.target.checked)}
                    style={{ width: 15, height: 15, cursor: 'pointer' }} />
                </th>
                <th style={{ width: 32 }}><span style={{ fontSize: 11 }}>👁</span></th>
                <th>Name</th><th>Qty</th><th>Price for 1 $ / €</th><th>Price $ / €</th><th>Description</th><th>Brand</th>
                <th>Disc%</th><th>After Disc $</th><th>mkP%</th><th>T.PriceT $</th>
                <th>Man%</th><th>mkM%</th><th>Final $ / €</th>
                {!hideCost && <><th>Cost $</th><th>Profit $</th></>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {division.items
                .filter(i => !i.source_group_instance_id)
                .map(item => (
                <CrmItemRow key={item.id} item={item} division={division} panel={panel} project={project}
                  onUpdate={onItemUpdate} onDelete={onItemDelete} hideCost={hideCost}
                  pendingPriceChange={pendingPriceChanges?.[item.id] || null}
                  isSelected={selectedItems?.has(item.id)}
                  onToggleSelect={onToggleItem}
                  editView={editView} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Render group instances (sub-divisions) */}
      {division.group_instances?.map(inst => (
        <GroupInstanceSection key={inst.id} instance={inst} division={division} panel={panel} project={project}
          onInstanceQtyChange={onGroupInstanceQtyChange}
          onInstanceRemove={onGroupInstanceRemove}
          onItemUpdate={onItemUpdate}
          onItemDelete={onItemDelete}
          hideCost={hideCost}
          selectedItems={selectedItems}
          onToggleItem={onToggleItem}
          editView={editView} />
      ))}

      {pendingProduct && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'rgba(26,95,168,0.06)' }}>
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <ProductSearch onSelect={handleProductSelect} projectId={project.id} exchangeRate={project.exchange_rate_eur_usd} />
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => setShowAdd(false)} style={{ marginTop: 1 }}>Cancel</button>
          </div>
        </div>
      )}

      {!showAdd && !pendingProduct && !pendingManual && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowAdd(true)}>+ Add Product</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowGroup(true)}>+ Add Group</button>
        </div>
      )}

      {showGroup && (
        <GroupSelectModal project={project} division={division} panel={panel}
          onClose={() => setShowGroup(false)} onGroupAdded={onGroupAdded} />
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
  onAddDivision, onItemAdd, onItemUpdate, onItemDelete, onDivisionDelete, hideCost, pendingPriceChanges,
  onGroupInstanceQtyChange, onGroupInstanceRemove, onGroupAdded, selectedItems, onToggleItem, onSelectAll, editView }) {

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct, note: panel.note || '', show_note_in_client_pdf: panel.show_note_in_client_pdf || false });

  const handleSavePanel = async () => {
    await onUpdatePanel(panel.id, form);
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 20, border: panel.is_completed ? '2px solid var(--success)' : '1px solid var(--border)', borderRadius: 10, overflow: 'visible', position: 'relative', background: 'var(--panel2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--accent)', borderBottom: '1px solid var(--border)', borderRadius: '9px 9px 0 0' }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>Panel #{panel.panel_number}</span>
          {panel.panel_name && <span style={{ marginLeft: 8, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>— {panel.panel_name}</span>}
          <span style={{ marginLeft: 12, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.9)' }}>
            Total: ${(parseFloat(panel.total_price) || 0).toFixed(2)}
          </span>
          {panel.updated_by_name && (
            <span style={{ marginLeft: 10, fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
              — Last edit: {panel.updated_by_name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {editing ? (
            <>
              <button className="btn btn-sm btn-primary" onClick={handleSavePanel}>Save</button>
              <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(false); setForm({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct, note: panel.note || '', show_note_in_client_pdf: panel.show_note_in_client_pdf || false }); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" style={{ background: panel.is_completed ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.2)', color: panel.is_completed ? 'var(--success)' : '#fff' }}
                onClick={() => onToggleComplete(panel.id)}>
                {panel.is_completed ? '✓ Complete' : '☐ Mark Complete'}
              </button>
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                onClick={() => { setEditing(true); setForm({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct, note: panel.note || '', show_note_in_client_pdf: panel.show_note_in_client_pdf || false }); }}>Edit Panel</button>
            </>
          )}
          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.25)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            onClick={() => onDeletePanel(panel.id)}>Delete</button>
        </div>
      </div>

      {editing && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)' }}>
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
          <div className="form-row" style={{ gap: 12, marginTop: 10 }}>
            <div className="form-group" style={{ flex: 3 }}>
              <label className="form-label">Note for Client PDF</label>
              <textarea className="form-input" rows={3} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Add a note visible in client PDF..." />
            </div>
            <div className="form-group" style={{ flex: 0, minWidth: 180, alignSelf: 'flex-end', paddingBottom: 4 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={form.show_note_in_client_pdf} onChange={e => setForm(f => ({ ...f, show_note_in_client_pdf: e.target.checked }))} />
                Show note in Client PDF
              </label>
            </div>
          </div>
        </div>
      )}

      {panel.divisions?.map(div => (
        <DivisionSection key={div.id} division={div} panel={panel} project={project}
          onItemAdd={onItemAdd} onItemUpdate={onItemUpdate} onItemDelete={onItemDelete}
          onDivisionDelete={onDivisionDelete} hideCost={hideCost}
          pendingPriceChanges={pendingPriceChanges}
          onGroupInstanceQtyChange={onGroupInstanceQtyChange}
          onGroupInstanceRemove={onGroupInstanceRemove}
          onGroupAdded={onGroupAdded}
          selectedItems={selectedItems}
          onToggleItem={onToggleItem}
          onSelectAll={onSelectAll}
          editView={editView} />
      ))}

      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        {DIVISION_TYPES.map(type => {
          const existingTypes = new Set((panel.divisions || []).map(d => d.division_type));
          if (existingTypes.has(type)) return null;
          return (
            <button key={type} className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => onAddDivision(panel.id, { division_type: type, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct })}>
              + {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Group Instance Section (sub-division) ─────────────────────
function GroupInstanceSection({ instance, division, panel, project, onInstanceQtyChange, onInstanceRemove, onItemUpdate, onItemDelete, hideCost, selectedItems, onToggleItem, editView }) {
  const [localQty, setLocalQty] = useState(instance.quantity);

  useEffect(() => { setLocalQty(instance.quantity); }, [instance.quantity]);

  return (
    <div style={{ margin: '8px 12px', border: '1px dashed var(--accent2)', borderRadius: 6, background: 'rgba(245,158,11,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px dashed var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)' }}>📦 {instance.group_name}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>×</span>
          <input type="number" min={1} className="form-input" style={{ width: 50, padding: '2px 4px', fontSize: 11 }}
            value={localQty}
            onChange={e => setLocalQty(Math.max(1, parseInt(e.target.value) || 1))}
            onBlur={() => { if (localQty !== instance.quantity) onInstanceQtyChange(instance.id, localQty); }} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>= {instance.quantity} × group</span>
        </div>
        <button className="btn-icon" style={{ color: 'var(--danger)', fontSize: 12 }}
          onClick={() => onInstanceRemove(instance.id)}>✕</button>
      </div>
      {instance.items?.length > 0 && (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: 11, whiteSpace: 'nowrap', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: 32 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 35 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 38 }} />
              <col style={{ width: 38 }} />
              <col style={{ width: 70 }} />
              {!hideCost && <col style={{ width: 55 }} />}
              {!hideCost && <col style={{ width: 60 }} />}
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 28, textAlign: 'center' }}>
                  <input type="checkbox"
                    checked={instance.items?.length > 0 && instance.items.every(i => selectedItems?.has(i.id))}
                    onChange={e => {
                      const checked = e.target.checked;
                      instance.items?.forEach(i => {
                        if (checked && !selectedItems?.has(i.id)) onToggleItem(i.id);
                        else if (!checked && selectedItems?.has(i.id)) onToggleItem(i.id);
                      });
                    }}
                    style={{ width: 15, height: 15, cursor: 'pointer' }} />
                </th>
                <th style={{ width: 32 }}><span style={{ fontSize: 11 }}>👁</span></th>
                <th>Name</th><th>Qty</th><th>Price for 1 $ / €</th><th>Price $ / €</th><th>Description</th><th>Brand</th>
                <th>Disc%</th><th>After Disc $</th><th>mkP%</th><th>T.PriceT $</th>
                <th>Man%</th><th>mkM%</th><th>Final $ / €</th>
                {!hideCost && <><th>Cost $</th><th>Profit $</th></>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {instance.items.map(item => (
                <CrmItemRow key={item.id} item={item} division={division} panel={panel} project={project}
                  onUpdate={onItemUpdate} onDelete={onItemDelete} hideCost={hideCost}
                  isSelected={selectedItems?.has(item.id)}
                  onToggleSelect={onToggleItem}
                  editView={editView} />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--accent2)', fontWeight: 700, background: 'rgba(245,158,11,0.06)' }}>
                <td colSpan={14} style={{ padding: '6px 10px', fontSize: 12, color: 'var(--accent2)', textAlign: 'right' }}>
                  Group Total:
                </td>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--success)', fontWeight: 800 }}>
                  ${instance.items.reduce((s, i) => s + (parseFloat(i.totalfinalProduct) || 0), 0).toFixed(2)}
                </td>
                {!hideCost && (
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
                    ${instance.items.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0).toFixed(2)}
                  </td>
                )}
                {!hideCost && (
                  <td style={{ padding: '6px 10px' }}></td>
                )}
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Execution Panel (checklist for field completion) ──────────
function ExecutionPanel({ panel, project, executionPanelData, executionItemData, onTogglePanel, onToggleItem, onSaveDesc }) {
  const [expanded, setExpanded] = useState(false);
  const [desc, setDesc] = useState(executionPanelData?.description || '');
  const panelDone = executionPanelData?.is_completed ? true : false;
  const allItems = panel.divisions?.flatMap(d => d.items || []) || [];
  const totalItems = allItems.length;
  const doneItems = allItems.filter(i => executionItemData?.[i.id]?.is_completed).length;

  return (
    <div style={{ marginBottom: 12, border: panelDone ? '2px solid var(--success)' : '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: panelDone ? 'rgba(34,197,94,0.08)' : 'var(--panel2)', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <input type="checkbox" checked={panelDone}
          onChange={e => { e.stopPropagation(); onTogglePanel(panel.id, e.target.checked, desc); }}
          style={{ width: 18, height: 18, cursor: 'pointer' }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: panelDone ? 'var(--success)' : 'var(--white)' }}>
            Panel #{panel.panel_number}{panel.panel_name ? ` — ${panel.panel_name}` : ''}
          </span>
          <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--muted)' }}>
            {doneItems}/{totalItems} items {expanded ? '▲' : '▼'}
          </span>
        </div>
        {panelDone && <span style={{ fontSize: 20 }}>✅</span>}
      </div>

      {expanded && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Field Description / Notes</label>
            <textarea className="form-textarea" rows={2} style={{ fontSize: 11 }}
              value={desc} onChange={e => setDesc(e.target.value)}
              onBlur={() => onSaveDesc(panel.id, desc)}
              placeholder="Add field notes about this panel's installation status..." />
          </div>

          {totalItems > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allItems.map(item => {
                const itemDone = executionItemData?.[item.id]?.is_completed ? true : false;
                const name = item.is_manual ? (item.custom_name || 'Manual') : (item.reference || '—');
                return (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={itemDone}
                      onChange={() => onToggleItem(item.id, !itemDone)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', flex: 1 }}>{name}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 10 }}>×{item.qty}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: itemDone ? 'var(--success)' : 'var(--muted)' }}>
                      {itemDone ? '✅ Done' : '⬜ Pending'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {totalItems === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', padding: 8 }}>No items in this panel</div>}
        </div>
      )}
    </div>
  );
}

function BulkEditModal({ onClose, onApply, count }) {
  const [form, setForm] = useState({ markupP_pct: '', manpower_pct: '', markupM_pct: '', discount_pct: '' });

  const hasAny = Object.values(form).some(v => v !== '');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">✏️ Bulk Edit ({count} items)</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            Leave blank to keep current values.
          </div>
          {['markupP_pct', 'manpower_pct', 'markupM_pct', 'discount_pct'].map(key => (
            <div className="form-group" key={key}>
              <label className="form-label">{key.replace(/_/g, ' ').toUpperCase()} %</label>
              <input type="number" step="0.1" className="form-input" value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder="Leave empty = keep current" />
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!hasAny} onClick={() => {
            const changes = {};
            for (const [k, v] of Object.entries(form)) {
              if (v !== '') changes[k] = parseFloat(v);
            }
            onApply(changes);
          }}>Apply to {count} items</button>
        </div>
      </div>
    </div>
  );
}

// ── Main CrmProjectPage ───────────────────────────────────────
export default function CrmProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isRole } = useAuth();
  const [project, setProject] = useState(null);
  const [panels, setPanels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingPriceChanges, setPendingPriceChanges] = useState({});
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [copyStep, setCopyStep] = useState('projects');
  const [sourceProjects, setSourceProjects] = useState([]);
  const [selectedSourceProject, setSelectedSourceProject] = useState(null);
  const [selectedSourcePanel, setSelectedSourcePanel] = useState(null);
  const [copying, setCopying] = useState(false);
  const [executionData, setExecutionData] = useState({ panelCompletion: {}, itemCompletion: {} });
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [brandDiscountEdits, setBrandDiscountEdits] = useState({});
  const [showBrandPreview, setShowBrandPreview] = useState(false);
  const [previewBrand, setPreviewBrand] = useState('');
  const [previewDiscPct, setPreviewDiscPct] = useState(0);
  const [applyingBrandDisc, setApplyingBrandDisc] = useState(false);

  const hideCost = isRole('engineer');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/projects/${id}/crm`);
      setProject(r.data);
      setPanels(r.data.panels || []);

      const pc = await api.get(`/price-changes/project/${id}`);
      const map = {};
      pc.data.forEach(req => { map[req.item_id] = req; });
      setPendingPriceChanges(map);

      const ex = await api.get(`/projects/${id}/execution`);
      setExecutionData(ex.data);
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

  const openCopyPanel = async () => {
    setShowCopyPanel(true);
    setCopyStep('projects');
    setSelectedSourceProject(null);
    setSelectedSourcePanel(null);
    try {
      const r = await api.get('/projects');
      setSourceProjects(r.data);
    } catch (e) { toast.error(e.message); }
  };

  const copyPanel = async () => {
    if (!selectedSourceProject || !selectedSourcePanel) return;
    setCopying(true);
    try {
      await api.post(`/projects/${id}/panels/copy-from`, {
        sourceProjectId: selectedSourceProject.id,
        sourcePanelId: selectedSourcePanel.id,
      });
      toast.success('Panel copied');
      setShowCopyPanel(false);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setCopying(false); }
  };

  const updatePanel = async (panelId, form) => {
    try {
      await api.patch(`/projects/${id}/panels/${panelId}`, form);
      load();
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
      if (!div) { toast.error('Item not found — page may be stale'); return; }
      const panel = panels.find(p => p.divisions?.some(d => d.id === div.id));
      if (!panel) { toast.error('Panel not found — page may be stale'); return; }
      const r = await api.patch(`/projects/${id}/panels/${panel.id}/divisions/${div.id}/items/${itemId}`, form);
      load();
      if (r.data && r.data.message && r.data.message.includes('request')) {
        toast.success('⏳ Price change request sent — waiting for admin approval');
      } else {
        toast.success('Item updated');
      }
    } catch (e) { toast.error(e.message); }
  };

  const deleteItem = async (itemId) => {
    if (!confirm('Remove this item?')) return;
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.items?.some(i => i.id === itemId));
      if (!div) { toast.error('Item not found — page may be stale'); return; }
      const panel = panels.find(p => p.id === div.panel_id);
      await api.delete(`/projects/${id}/panels/${panel.id}/divisions/${div.id}/items/${itemId}`);
      load();
      toast.success('Item removed');
    } catch (e) { toast.error(e.message); }
  };

  const toggleExecutionPanel = async (panelId, is_completed, description) => {
    try {
      const r = await api.patch(`/projects/${id}/execution/panels/${panelId}`, { is_completed: is_completed ? 1 : 0, description });
      setExecutionData(prev => ({
        ...prev,
        panelCompletion: { ...prev.panelCompletion, [panelId]: r.data }
      }));
    } catch (e) { toast.error(e.message); }
  };

  const toggleExecutionItem = async (itemId, is_completed) => {
    try {
      const r = await api.patch(`/projects/${id}/execution/items/${itemId}`, { is_completed: is_completed ? 1 : 0 });
      setExecutionData(prev => ({
        ...prev,
        itemCompletion: { ...prev.itemCompletion, [itemId]: r.data }
      }));
    } catch (e) { toast.error(e.message); }
  };

  const handleGroupInstanceQtyChange = async (instanceId, newQty) => {
    try {
      await api.patch(`/group-instances/${instanceId}`, { quantity: newQty });
      load();
      toast.success('Quantity updated');
    } catch (e) { toast.error(e.message); }
  };

  const handleGroupInstanceRemove = async (instanceId) => {
    if (!confirm('Remove this group instance and all its items?')) return;
    try {
      await api.delete(`/group-instances/${instanceId}`);
      load();
      toast.success('Group instance removed');
    } catch (e) { toast.error(e.message); }
  };

  const handleReadyForReview = async () => {
    try {
      await api.patch(`/projects/${id}/ready-for-review`);
      toast.success('✅ Project marked ready for review — admin notified');
    } catch (e) { toast.error(e.message); }
  };

  const toggleSelectItem = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const selectAllForDivision = (divisionId, selectAll) => {
    const div = panels.flatMap(p => p.divisions || []).find(d => d.id === divisionId);
    if (!div) return;
    const ids = (div.items || []).filter(i => !i.source_group_instance_id).map(i => i.id);
    setSelectedItems(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selectAll) next.add(id); else next.delete(id);
      }
      return next;
    });
  };

  const handleBulkEdit = async (changes) => {
    const item_ids = Array.from(selectedItems);
    if (!item_ids.length) return;
    try {
      const r = await api.post(`/projects/${id}/items/bulk-update`, { item_ids, changes });
      toast.success(`✅ Updated ${r.data.updated} items`);
      setSelectedItems(new Set());
      setShowBulkEdit(false);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const clearSelection = () => setSelectedItems(new Set());

  const [activeTab, setActiveTab] = useState('items');
  const [editView, setEditView] = useState(false);

  // ── Brand discount helpers (must be before early returns to keep hook order) ──
  const calcItemFinal = (item, discPct) => {
    const base = parseFloat(item.base_price_usd) || 0;
    const qty = parseFloat(item.qty) || 1;
    const baseTotal = base * qty;
    const discAmt = baseTotal * (discPct / 100);
    const afterDisc = baseTotal - discAmt;
    const mkPPct = parseFloat(item.markupP_pct) || 0;
    const mkPAmt = afterDisc * (mkPPct / 100);
    const tPrice = afterDisc + mkPAmt;
    const manPct = parseFloat(item.manpower_pct) || 0;
    const manAmt = afterDisc * (manPct / 100);
    const mkMPct = parseFloat(item.markupM_pct) || 0;
    const mkMAmt = manAmt * (mkMPct / 100);
    return tPrice + manAmt + mkMAmt;
  };
  const brandPanelBreakdown = useMemo(() => {
    if (!showBrandPreview || !previewBrand) return [];
    const rows = [];
    for (const panel of panels) {
      let currentTotal = 0, newTotal = 0, itemCount = 0;
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          const brand = item.is_manual
            ? (item.custom_brand || 'Unbranded')
            : (item.brand_name || 'Unbranded');
          if (brand !== previewBrand) continue;
          const base = parseFloat(item.base_price_usd) || 0;
          const qty = parseFloat(item.qty) || 1;
          const baseTotal = base * qty;
          const bDiscPct = parseFloat(item.discount_pct) || 0;
          const curDisc = baseTotal * (bDiscPct / 100);
          const curAfter = baseTotal - curDisc;
          const bMkPPct = parseFloat(item.markupP_pct) || 0;
          const curMkP = curAfter * (bMkPPct / 100);
          const bManPct = parseFloat(item.manpower_pct) || 0;
          const curMan = curAfter * (bManPct / 100);
          const bMkMPct = parseFloat(item.markupM_pct) || 0;
          const curMkM = curMan * (bMkMPct / 100);
          currentTotal += curAfter + curMkP + curMan + curMkM;
          newTotal += calcItemFinal(item, previewDiscPct);
          itemCount++;
        }
      }
      if (itemCount > 0) rows.push({ panel_number: panel.panel_number, panel_name: panel.panel_name, currentTotal, newTotal, itemCount });
    }
    return rows;
  }, [showBrandPreview, previewBrand, previewDiscPct, panels]);

  if (loading) return <div className="page"><div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading CRM...</div></div>;
  if (!project) return <div className="page"><div className="empty"><p>Project not found</p></div></div>;

  const projectTotal = panels.reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);
  const baseTotal = parseFloat(project.total_price) || projectTotal;
  const discPct = parseFloat(project.project_discount_pct) || 0;
  const discAmt = baseTotal * (discPct / 100);
  const netAfterDisc = baseTotal - discAmt;
  const vatPct = parseFloat(project.vat_pct) || 0;
  const vatAmt = netAfterDisc * (vatPct / 100);
  const projectTotalWithVat = netAfterDisc + vatAmt;

  // ── Brand aggregation helper ──
  const brandData = (() => {
    const map = {};
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          const brand = item.is_manual
            ? (item.custom_brand || 'Unbranded')
            : (item.brand_name || 'Unbranded');
          const base = parseFloat(item.base_price_usd) || 0;
          const qty = parseFloat(item.qty) || 1;
          const baseTotal = base * qty;
          const discPctVal = parseFloat(item.discount_pct) || 0;
          const discAmt = baseTotal * (discPctVal / 100);
          const afterDisc = baseTotal - discAmt;
          const mkPPct = parseFloat(item.markupP_pct) || 0;
          const mkPAmt = afterDisc * (mkPPct / 100);
          const tPrice = afterDisc + mkPAmt;
          const manPct = parseFloat(item.manpower_pct) || 0;
          const manAmt = afterDisc * (manPct / 100);
          const mkMPct = parseFloat(item.markupM_pct) || 0;
          const mkMAmt = manAmt * (mkMPct / 100);
          const finalPrice = tPrice + manAmt + mkMAmt;
          const cost = parseFloat(item.cost || 0);
          if (!map[brand]) map[brand] = { brand, total_cost: 0, total_price: 0, total_qty: 0, profit: 0, count: 0, discountInfo: {} };
          map[brand].total_cost += cost;
          map[brand].total_price += finalPrice;
          map[brand].total_qty += qty;
          map[brand].profit = map[brand].total_price - map[brand].total_cost;
          map[brand].count++;
          const key = String(discPctVal);
          if (!map[brand].discountInfo[key]) map[brand].discountInfo[key] = { pct: discPctVal, count: 0 };
          map[brand].discountInfo[key].count += qty;
        }
      }
    }
    return Object.values(map).sort((a, b) => b.total_price - a.total_price);
  })();

  const brandPreview = (() => {
    const map = {};
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          const brand = item.is_manual
            ? (item.custom_brand || 'Unbranded')
            : (item.brand_name || 'Unbranded');
          const edit = brandDiscountEdits[brand];
          if (edit === undefined || edit === null) continue;
          const discPct = parseFloat(edit);
          if (isNaN(discPct)) continue;
          const finalPrice = calcItemFinal(item, discPct);
          if (!map[brand]) map[brand] = 0;
          map[brand] += finalPrice;
        }
      }
    }
    return map;
  })();

  const openBrandPreview = (brand) => {
    const discPct = brandDiscountEdits[brand];
    if (discPct === undefined || discPct === null || discPct === '') {
      toast.error('Enter a discount percentage first');
      return;
    }
    setPreviewBrand(brand);
    setPreviewDiscPct(parseFloat(discPct) || 0);
    setShowBrandPreview(true);
  };

  const handleConfirmBrandDiscount = async () => {
    setApplyingBrandDisc(true);
    try {
      const r = await api.post(`/projects/${id}/items/apply-brand-discount`, { brand: previewBrand, discount_pct: previewDiscPct });
      toast.success(`✅ ${r.data.updated} items updated for ${previewBrand}`);
      setBrandDiscountEdits(prev => ({ ...prev, [previewBrand]: undefined }));
      setShowBrandPreview(false);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setApplyingBrandDisc(false); }
  };

  const reportItems = (() => {
    const flat = [];
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          const ref = item.is_manual
            ? (item.custom_name || 'Manual')
            : (item.reference || 'Unknown');
          flat.push({ panel_number: panel.panel_number, reference: ref, qty: item.qty ?? 1 });
        }
      }
    }
    return flat.sort((a, b) => a.panel_number - b.panel_number);
  })();

  const reportSummary = (() => {
    const map = {};
    for (const item of reportItems) {
      if (!map[item.reference]) map[item.reference] = { reference: item.reference, total_qty: 0 };
      map[item.reference].total_qty += item.qty;
    }
    return Object.values(map).sort((a, b) => b.total_qty - a.total_qty);
  })();

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
            {discPct > 0 && <span> • Discount ({discPct}%): -<strong style={{ color: 'var(--danger)' }}>${discAmt.toFixed(2)}</strong></span>}
            {vatPct > 0 && <span> • VAT ({vatPct}%): <strong style={{ color: 'var(--accent2)' }}>${vatAmt.toFixed(2)}</strong> • Total with VAT: <strong style={{ color: 'var(--success)' }}>${projectTotalWithVat.toFixed(2)}</strong></span>}
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setShowAddPanel(true)}>+ Add Panel</button>
          <a href={`/api/export/crm/${id}`} className="btn btn-secondary" style={{ textDecoration: 'none' }}>📥 CSV</a>
          <button className="btn btn-secondary" onClick={openCopyPanel}>📋 Copy from existing</button>
          <button className="btn btn-success" onClick={handleReadyForReview}
            style={{ background: 'var(--success)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ✅ Ready for Review
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('items')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'items' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'items' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          📋 Items
        </button>
        {activeTab === 'items' && (
          <button onClick={() => setEditView(v => !v)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, border: 'none', background: editView ? 'var(--accent)' : 'transparent', color: editView ? '#fff' : 'var(--muted)', borderRadius: '0 0 6px 6px', cursor: 'pointer', marginLeft: 4, borderBottom: editView ? 'none' : '2px solid transparent' }}>
            {editView ? '◉ Edit View ON' : '○ Edit View'}
          </button>
        )}
        <button onClick={() => setActiveTab('brands')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'brands' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'brands' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          🏷️ Brand Summary
        </button>
        <button onClick={() => setActiveTab('report')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'report' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'report' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          📋 Final Report
        </button>
        <button onClick={() => setActiveTab('testing')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'testing' ? 'var(--accent2)' : 'var(--muted)', borderBottom: activeTab === 'testing' ? '2px solid var(--accent2)' : '2px solid transparent', cursor: 'pointer' }}>
          🧪 Summary Testing
        </button>
        {project.client_approval === 'approved' && (
          <button onClick={() => setActiveTab('execution')}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'execution' ? 'var(--success)' : 'var(--muted)', borderBottom: activeTab === 'execution' ? '2px solid var(--success)' : '2px solid transparent', cursor: 'pointer' }}>
            🔧 Execution
          </button>
        )}
        <button onClick={() => setActiveTab('activity')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'activity' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'activity' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          📜 Activity
        </button>
        <button onClick={() => setActiveTab('files')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'files' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'files' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          📎 Files
        </button>
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

      {showCopyPanel && (
        <div className="modal-overlay" onClick={() => setShowCopyPanel(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">📋 Copy Panel from Existing Project</span>
              <button className="btn-icon" onClick={() => setShowCopyPanel(false)}>✕</button>
            </div>
            <div className="modal-body">
              {copyStep === 'projects' && (
                <>
                  <label className="form-label">Select Source Project</label>
                  {sourceProjects.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, padding: 12 }}>No other projects available</div>}
                  <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sourceProjects.map(p => (
                      <div key={p.id} className="card" style={{ cursor: 'pointer', padding: '8px 12px', background: selectedSourceProject?.id === p.id ? 'var(--accent)' : 'var(--panel)', color: selectedSourceProject?.id === p.id ? '#fff' : 'inherit' }}
                        onClick={async () => {
                          setSelectedSourceProject(p);
                          setCopyStep('panels');
                          const r = await api.get(`/projects/${p.id}/crm`);
                          setSelectedSourceProject(prev => ({ ...prev, panels: r.data.panels || [] }));
                        }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.project_name}</div>
                        <div style={{ fontSize: 11, color: selectedSourceProject?.id === p.id ? '#ddd' : 'var(--muted)' }}>{p.client_name || 'No client'} • {p.crm_panels || 0} panels</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {copyStep === 'panels' && selectedSourceProject && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setCopyStep('projects'); setSelectedSourcePanel(null); }}>← Back</button>
                    <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 13 }}>{selectedSourceProject.project_name}</span>
                  </div>
                  <label className="form-label">Select Panel to Copy</label>
                  <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(selectedSourceProject.panels || []).map(p => (
                      <div key={p.id} className="card" style={{ cursor: 'pointer', padding: '8px 12px', background: selectedSourcePanel?.id === p.id ? 'var(--accent)' : 'var(--panel)', color: selectedSourcePanel?.id === p.id ? '#fff' : 'inherit' }}
                        onClick={() => setSelectedSourcePanel(p)}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Panel #{p.panel_number}{p.panel_name ? ` — ${p.panel_name}` : ''}</div>
                        <div style={{ fontSize: 11, color: selectedSourcePanel?.id === p.id ? '#ddd' : 'var(--muted)' }}>
                          {(p.divisions || []).length} divisions • ${parseFloat(p.total_price || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCopyPanel(false)}>Cancel</button>
              {copyStep === 'panels' && (
                <button className="btn btn-primary" disabled={!selectedSourcePanel || copying} onClick={copyPanel}>
                  {copying ? <><span className="spinner" /> Copying...</> : '📋 Copy Panel'}
                </button>
              )}
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

      {activeTab === 'items' && panels.map(panel => (
        <PanelSection key={panel.id} panel={panel} project={project}
          onUpdatePanel={updatePanel} onDeletePanel={deletePanel} onToggleComplete={togglePanelComplete}
          onAddDivision={addDivision} onItemAdd={addItem} onItemUpdate={updateItem}
          onItemDelete={deleteItem} onDivisionDelete={deleteDivision} hideCost={hideCost}
          pendingPriceChanges={pendingPriceChanges}
          onGroupInstanceQtyChange={handleGroupInstanceQtyChange}
          onGroupInstanceRemove={handleGroupInstanceRemove}
          onGroupAdded={load}
          selectedItems={selectedItems}
          onToggleItem={toggleSelectItem}
          onSelectAll={selectAllForDivision}
          editView={editView} />
      ))}

      {/* Bulk Edit Toolbar */}
      {selectedItems.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          background: 'var(--panel2)', border: '1px solid var(--accent)',
          borderRadius: 12, padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>
            {selectedItems.size} selected
          </span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowBulkEdit(true)}>
            ✏️ Edit Selected
          </button>
          <button className="btn btn-sm btn-secondary" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}

      {showBulkEdit && (
        <BulkEditModal count={selectedItems.size}
          onClose={() => setShowBulkEdit(false)}
          onApply={handleBulkEdit} />
      )}

      {activeTab === 'execution' && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>🔧 Execution Phase</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              {project.execution_deadline
                ? `Execution Deadline: ${project.execution_deadline}`
                : 'Set an execution deadline in the project details page.'}
            </div>
            {panels.length === 0 ? (
              <div className="empty"><p>No panels to execute yet.</p></div>
            ) : (
              panels.map(panel => (
                <ExecutionPanel key={panel.id} panel={panel} project={project}
                  executionPanelData={executionData.panelCompletion?.[panel.id]}
                  executionItemData={executionData.itemCompletion}
                  onTogglePanel={toggleExecutionPanel}
                  onToggleItem={toggleExecutionItem}
                  onSaveDesc={async (pid, description) => {
                    try { await api.patch(`/projects/${id}/execution/panels/${pid}`, { description }); }
                    catch (e) { toast.error(e.message); }
                  }} />
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'brands' && (
        <div className="card">
          <div className="card-body" style={{ overflowX: 'auto' }}>
            {brandData.length === 0 ? (
              <div className="empty"><p>No items with brands found.</p></div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                  Set a discount % per brand to preview the impact. Click Apply to save to this project.
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Brand</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Items</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Total Qty</th>
                      {!hideCost && <th style={{ textAlign: 'right', padding: '8px 10px' }}>Total Cost</th>}
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Current Total</th>
                      <th style={{ textAlign: 'center', padding: '8px 10px', minWidth: 70 }}>Current Disc %</th>
                      <th style={{ textAlign: 'center', padding: '8px 10px', minWidth: 80 }}>New Discount %</th>
                      {Object.keys(brandDiscountEdits).some(k => brandDiscountEdits[k] !== undefined && brandDiscountEdits[k] !== '') && (
                        <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--accent2)' }}>Preview Total</th>
                      )}
                      <th style={{ textAlign: 'center', padding: '8px 10px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandData.map(b => {
                      const edit = brandDiscountEdits[b.brand];
                      const hasEdit = edit !== undefined && edit !== null && edit !== '';
                      const discPct = hasEdit ? parseFloat(edit) : null;
                      const previewTotal = hasEdit && !isNaN(discPct) ? (brandPreview[b.brand] ?? null) : null;
                      const diff = previewTotal !== null ? previewTotal - b.total_price : null;
                      return (
                      <tr key={b.brand} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--accent)' }}>{b.brand}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{b.count}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{b.total_qty}</td>
                        {!hideCost && <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>${b.total_cost.toFixed(2)}</td>}
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>${b.total_price.toFixed(2)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
                          {Object.values(b.discountInfo)
                            .sort((a, b2) => b2.count - a.count)
                            .map(d => `${d.pct}% (${d.count})`).join(', ')}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input type="number" min={0} max={100} step={0.5}
                            value={edit ?? ''}
                            onChange={e => setBrandDiscountEdits(prev => ({ ...prev, [b.brand]: e.target.value }))}
                            placeholder="%"
                            style={{ width: 60, padding: '4px 6px', fontSize: 12, textAlign: 'center', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--white)' }} />
                        </td>
                        {Object.keys(brandDiscountEdits).some(k => brandDiscountEdits[k] !== undefined && brandDiscountEdits[k] !== '') && (
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>
                            {previewTotal !== null ? `$${previewTotal.toFixed(2)}` : '—'}
                            {diff !== null && diff !== 0 && (
                              <div style={{ fontSize: 10, color: diff < 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {diff < 0 ? '-' : '+'}${Math.abs(diff).toFixed(2)}
                              </div>
                            )}
                          </td>
                        )}
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => openBrandPreview(b.brand)}
                            disabled={!hasEdit || isNaN(parseFloat(edit))}>
                            Preview & Apply
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                      <td style={{ padding: '8px 10px' }}>Total</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{brandData.reduce((s, b) => s + b.count, 0)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>{brandData.reduce((s, b) => s + b.total_qty, 0)}</td>
                      {!hideCost && <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>${brandData.reduce((s, b) => s + b.total_cost, 0).toFixed(2)}</td>}
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>${brandData.reduce((s, b) => s + b.total_price, 0).toFixed(2)}</td>
                      {Object.keys(brandDiscountEdits).some(k => brandDiscountEdits[k] !== undefined && brandDiscountEdits[k] !== '') && (
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>
                          ${(brandData.reduce((s, b) => s + (brandPreview[b.brand] ?? b.total_price), 0)).toFixed(2)}
                        </td>
                      )}
                      <td style={{ padding: '8px 10px' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Brand Discount Preview Modal ── */}
      {showBrandPreview && (
        <div className="modal-overlay" onClick={() => setShowBrandPreview(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="modal-title">📊 Preview: {previewDiscPct}% Discount on {previewBrand}</span>
              <button className="btn-icon" onClick={() => setShowBrandPreview(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                Review the impact per panel before applying
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Panel</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Items</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Current Total</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--accent2)' }}>New Total ({previewDiscPct}% off)</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {brandPanelBreakdown.map(r => {
                    const diff = r.newTotal - r.currentTotal;
                    return (
                      <tr key={r.panel_number} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', color: 'var(--white)', fontWeight: 600 }}>#{r.panel_number}{r.panel_name ? ` — ${r.panel_name}` : ''}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--muted)' }}>{r.itemCount}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${r.currentTotal.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>${r.newTotal.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: diff < 0 ? 'var(--success)' : diff > 0 ? 'var(--danger)' : 'var(--muted)' }}>
                          {diff < 0 ? '-' : '+'}${Math.abs(diff).toFixed(2)} ({((diff / (r.currentTotal || 1)) * 100).toFixed(1)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ padding: '6px 8px' }}>Total</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{brandPanelBreakdown.reduce((s, r) => s + r.itemCount, 0)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${brandPanelBreakdown.reduce((s, r) => s + r.currentTotal, 0).toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>${brandPanelBreakdown.reduce((s, r) => s + r.newTotal, 0).toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                      -${(brandPanelBreakdown.reduce((s, r) => s + r.currentTotal, 0) - brandPanelBreakdown.reduce((s, r) => s + r.newTotal, 0)).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBrandPreview(false)} disabled={applyingBrandDisc}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConfirmBrandDiscount} disabled={applyingBrandDisc}>
                {applyingBrandDisc ? <><span className="spinner" /> Applying...</> : `✅ Apply ${previewDiscPct}% to ${previewBrand}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'report' && (
        <div className="card">
          <div className="card-body" style={{ overflowX: 'auto' }}>
            {reportItems.length === 0 ? (
              <div className="empty"><p>No items found.</p></div>
            ) : (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 10 }}>📋 Items by Panel</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Panel #</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Reference</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportItems.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{r.panel_number}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--accent)' }}>{r.reference}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', margin: '24px 0 10px' }}>📊 Summary</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Reference</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Total Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportSummary.map(r => (
                      <tr key={r.reference} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--accent)' }}>{r.reference}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.total_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'testing' && (
        <SummaryTesting panels={panels} project={project} id={id}
          onItemUpdate={updateItem} onItemDelete={deleteItem}
          hideCost={hideCost} exchangeRate={project.exchange_rate_eur_usd} />
      )}

      {activeTab === 'activity' && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>📜 Activity Log</h3>
            <ActivityLog projectId={id} />
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>📎 File Attachments</h3>
            <FileAttachments projectId={id} panels={panels} />
          </div>
        </div>
      )}
    </div>
  );
}
