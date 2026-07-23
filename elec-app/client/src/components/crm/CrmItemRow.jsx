import { useState, memo } from 'react';

const CrmItemRow = memo(function CrmItemRow({ item, division, panel, exchangeRate, onUpdate, onDelete, hideCost, showCr, pendingPriceChange, isSelected, onToggleSelect, editView }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...item });

  const name = item.is_manual ? (item.custom_name || 'Manual Product') : item.reference;
  const desc = item.is_manual ? (item.custom_desc || '') : (item.product_desc || '');
  const brand = item.is_manual ? (item.custom_brand || '') : (item.brand_name || '');
  const notes = item.notes || '';

  // While editing, derive every price figure from the in-progress form state
  // (not the original item) so the preview recalculates live as the user
  // types instead of staying frozen until Save round-trips to the server.
  const source = editing ? form : item;
  const base = parseFloat(source.base_price_usd || 0);
  const baseEur = parseFloat(source.base_price_euro || 0);
  const qty = parseInt(source.qty) || 1;
  const baseTotal = base * qty;
  const discPctVal = parseFloat(source.discount_pct) || 0;
  const disc = baseTotal * (discPctVal / 100);
  const afterDisc = baseTotal - disc;
  const mkPPct = parseFloat(source.markupP_pct) || 0;
  const mkP = afterDisc * (mkPPct / 100);
  const totalT = afterDisc + mkP;
  const manPct = parseFloat(source.manpower_pct) || 0;
  const man = afterDisc * (manPct / 100);
  const mkMPct = parseFloat(source.markupM_pct) || 0;
  const mkM = man * (mkMPct / 100);
  const final = totalT + man + mkM;
  const finalEur = baseEur * (final / (base || 1));
  const cost = (parseFloat(source.cost || 0)) * qty;
  const profit = final - cost;
  const isLoss = final < cost && cost > 0;
  const crAmount = (parseFloat(source.cr_amount) || 0) * qty;
  const nProfit = final - crAmount;

  const convertEurEdit = (euro) => {
    const rate = exchangeRate ?? 1.08;
    setForm(f => ({ ...f, base_price_euro: euro, base_price_usd: euro ? (parseFloat(euro) * rate).toFixed(2) : '' }));
  };
  const convertUsdEdit = (usd) => {
    const rate = exchangeRate ?? 1.08;
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
          ${baseTotal.toFixed(2)}
        </td>
        <td style={{ fontSize: 11, color: 'var(--muted)', verticalAlign: 'middle' }}>{desc}</td>
        <td style={{ fontSize: 11, verticalAlign: 'middle' }}>{brand || '—'}</td>
        <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.1" className="form-input" style={{ width: 48, padding: '2px 4px', fontSize: 11 }} value={form.discount_pct}
            onChange={e => setForm(f => ({ ...f, discount_pct: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--primary-light)', fontWeight: 600, verticalAlign: 'middle' }}>${afterDisc.toFixed(2)}</td>
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
        <td className="mono" style={{ fontWeight: 700, color: isLoss ? 'var(--danger)' : 'var(--success)', verticalAlign: 'middle' }}>${final.toFixed(2)}</td>
        {!hideCost && <td style={{ verticalAlign: 'middle' }}>
           <input type="number" step="0.01" className="form-input" style={{ width: 62, padding: '2px 4px', fontSize: 11 }} value={form.cost ?? ''}
            onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>}
        {!hideCost && <td className="mono" style={{ fontWeight: 700, color: profit >= 0 ? 'var(--success)' : 'var(--danger)', verticalAlign: 'middle' }}>
          ${profit.toFixed(2)}
        </td>}
        {showCr && <td style={{ verticalAlign: 'middle' }}>
          <input type="number" step="0.01" className="form-input" style={{ width: 55, padding: '2px 4px', fontSize: 11 }} value={form.cr_amount ?? ''}
            onChange={e => setForm(f => ({ ...f, cr_amount: parseFloat(e.target.value) || 0 }))} onKeyDown={handleKeyDown} />
        </td>}
        {showCr && <td className="mono" style={{ fontWeight: 700, color: nProfit >= 0 ? 'var(--success)' : 'var(--danger)', verticalAlign: 'middle' }}>
          ${nProfit.toFixed(2)}
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
      <td className="mono" style={{ color: 'var(--primary-light)', fontWeight: 600 }}>${afterDisc.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>after disc</div></td>
      <td className="mono" style={{ color: 'var(--accent2)' }}>{item.markupP_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${mkP.toFixed(2)}</div></td>
      <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>${totalT.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>T.PriceT</div></td>
      <td className="mono" style={{ color: 'var(--accent2)' }}>{item.manpower_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${man.toFixed(2)}</div></td>
      <td className="mono" style={{ color: 'var(--badge-purple)' }}>{item.markupM_pct}%<div style={{ fontSize: 10, color: 'var(--muted)' }}>+${mkM.toFixed(2)}</div></td>
      <td className="mono" style={{ fontWeight: 700, color: isLoss ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>${final.toFixed(2)}<div style={{ fontSize: 10, color: 'var(--muted)' }}>€{finalEur.toFixed(2)}</div></td>
      {!hideCost && <td className="mono" style={{ color: 'var(--muted)' }}>${cost.toFixed(2)}</td>}
      {!hideCost && <td className="mono" style={{ fontWeight: 700, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{profit >= 0 ? '+' : ''}${profit.toFixed(2)}</td>}
      {showCr && <td className="mono" style={{ color: 'var(--accent2)' }}>${crAmount.toFixed(2)}</td>}
      {showCr && <td className="mono" style={{ fontWeight: 700, color: nProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>${nProfit.toFixed(2)}</td>}
      <td onClick={e => e.stopPropagation()}>
        <button className="btn-icon" title="Edit" onClick={() => setEditing(true)}>✏️</button>
        <button className="btn-icon" title="Delete" style={{ color: 'var(--danger)' }}
          onClick={() => onDelete(item.id)}>✕</button>
      </td>
    </tr>
  );
});

export default CrmItemRow;
