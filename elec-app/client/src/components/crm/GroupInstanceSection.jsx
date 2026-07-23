import { useState, useEffect, memo } from 'react';
import CrmItemRow from './CrmItemRow';

const GroupInstanceSection = memo(function GroupInstanceSection({ instance, division, panel, exchangeRate, onInstanceQtyChange, onInstanceRemove, onItemUpdate, onItemDelete, hideCost, showCr, pendingPriceChanges, selectedItems, onToggleItem, editView }) {
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
          <table style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
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
                {showCr && <><th style={{ width: 60 }}>C.R $</th><th style={{ width: 70 }}>N Profit $</th></>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {instance.items.map(item => (
                <CrmItemRow key={item.id} item={item} division={division} panel={panel} exchangeRate={exchangeRate}
                  onUpdate={onItemUpdate} onDelete={onItemDelete} hideCost={hideCost} showCr={showCr}
                  pendingPriceChange={pendingPriceChanges?.[item.id] || null}
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
                    ${instance.items.reduce((s, i) => s + ((parseFloat(i.cost) || 0) * (parseFloat(i.qty) || 1)), 0).toFixed(2)}
                  </td>
                )}
                {!hideCost && (
                  <td style={{ padding: '6px 10px' }}></td>
                )}
                {showCr && (
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent2)' }}>
                    ${instance.items.reduce((s, i) => s + ((parseFloat(i.cr_amount) || 0) * (parseFloat(i.qty) || 1)), 0).toFixed(2)}
                  </td>
                )}
                {showCr && (
                  <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>
                    ${instance.items.reduce((s, i) => s + ((parseFloat(i.totalfinalProduct) || 0) - ((parseFloat(i.cr_amount) || 0) * (parseFloat(i.qty) || 1))), 0).toFixed(2)}
                  </td>
                )}
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
});

export default GroupInstanceSection;
