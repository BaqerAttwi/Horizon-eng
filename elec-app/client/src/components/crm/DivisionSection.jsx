import { useState, useEffect, memo } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { DIVISION_COLORS } from '../../utils/crmPricing';
import CrmItemRow from './CrmItemRow';
import GroupInstanceSection from './GroupInstanceSection';

function ProductSearch({ onSelect, projectId, exchangeRate }) {
  const [q, setQ] = useState('');
  const [results, setRes] = useState([]);
  const [manuals, setManuals] = useState([]);
  const [dq, setDq] = useState('');

  const handleSearch = (val) => {
    setQ(val);
    if (!val.trim()) { setDq(''); setRes([]); return; }
    setDq(val);
    api.get('/products', { params: { search: val, limit: 15 } })
      .then(r => setRes(r.data.products || []))
      .catch(() => {});
  };

  useEffect(() => {
    api.get(`/projects/${projectId}/manual-products`)
      .then(r => setManuals(r.data || []))
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!dq.trim()) { setRes([]); return; }
    api.get('/products', { params: { search: dq, limit: 15 } })
      .then(r => setRes(r.data.products || []))
      .catch(() => {});
  }, [dq]);

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
        value={q} onChange={e => { setQ(e.target.value); handleSearch(e.target.value); }}
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
          minWidth: 260, maxWidth: 'calc(100vw - 32px)',
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

const DivisionSection = memo(function DivisionSection({ division, panel, project, exchangeRate, onItemAdd, onItemUpdate, onItemDelete, onDivisionDelete, hideCost, showCr, pendingPriceChanges,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: `${divColor}20`, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: divColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: divColor, flexShrink: 0 }}>{division.division_type}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>({division.item_count} items)</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            markupP:{division.markupP}% markupM:{division.markupM}% manpower:{division.manpower_pct}%
          </span>
        </div>
        <button className="btn-icon" title="Delete division" style={{ color: 'var(--danger)', flexShrink: 0 }}
          onClick={() => onDivisionDelete(division.id)}>✕</button>
      </div>

      {division.items?.length > 0 && (
        <div className="table-wrap" style={{ overflowX: 'auto', background: 'var(--panel)' }}>
          <table style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: 28 }} />
              <col style={{ minWidth: 60 }} />
              <col style={{ width: 30 }} />
              <col style={{ minWidth: 60 }} />
              <col style={{ minWidth: 60 }} />
              <col style={{ minWidth: 70 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 48 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 36 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 34 }} />
              <col style={{ width: 34 }} />
              <col style={{ minWidth: 60 }} />
              {!hideCost && <col style={{ width: 50 }} />}
              {!hideCost && <col style={{ width: 50 }} />}
              {showCr && <col style={{ width: 50 }} />}
              {showCr && <col style={{ width: 60 }} />}
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
                {showCr && <><th style={{ width: 60 }}>C.R $</th><th style={{ width: 70 }}>N Profit $</th></>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {division.items
                .filter(i => !i.source_group_instance_id)
                .map(item => (
                <CrmItemRow key={item.id} item={item} division={division} panel={panel} exchangeRate={exchangeRate}
                  onUpdate={onItemUpdate} onDelete={onItemDelete} hideCost={hideCost} showCr={showCr}
                  pendingPriceChange={pendingPriceChanges?.[item.id] || null}
                  isSelected={selectedItems?.has(item.id)}
                  onToggleSelect={onToggleItem}
                  editView={editView} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {division.group_instances?.map(inst => (
        <GroupInstanceSection key={inst.id} instance={inst} division={division} panel={panel} exchangeRate={exchangeRate}
          onInstanceQtyChange={onGroupInstanceQtyChange}
          onInstanceRemove={onGroupInstanceRemove}
          onItemUpdate={onItemUpdate}
          onItemDelete={onItemDelete}
          hideCost={hideCost} showCr={showCr}
          pendingPriceChanges={pendingPriceChanges}
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
});

export default DivisionSection;
