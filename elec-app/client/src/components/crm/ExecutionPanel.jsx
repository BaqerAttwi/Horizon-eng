import { useState, memo } from 'react';

const ExecutionPanel = memo(function ExecutionPanel({ panel, project, executionPanelData, executionItemData, onTogglePanel, onToggleItem, onSaveDesc }) {
  const [expanded, setExpanded] = useState(false);
  const [desc, setDesc] = useState(executionPanelData?.description || '');
  const [itemNotes, setItemNotes] = useState({});
  const panelDone = executionPanelData?.is_completed ? true : false;
  const allItems = panel.divisions?.flatMap(d => d.items || []) || [];
  const totalQty = allItems.reduce((s, i) => s + (parseInt(i.qty) || 1), 0);
  const doneQty = allItems.reduce((s, i) => s + (parseInt(executionItemData?.[i.id]?.qty_done) || (executionItemData?.[i.id]?.is_completed ? (parseInt(i.qty) || 1) : 0)), 0);
  const panelPct = totalQty > 0 ? Math.round((doneQty / totalQty) * 100) : 0;

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
            {doneQty}/{totalQty} ({panelPct}%) {expanded ? '▲' : '▼'}
          </span>
          {totalQty > 0 && (
            <div style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 8, width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${panelPct}%`, height: '100%', background: panelPct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          )}
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

          {allItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allItems.map(item => {
                const itemQty = parseInt(item.qty) || 1;
                const ic = executionItemData?.[item.id];
                const itemDone = ic?.is_completed ? true : false;
                const itemDoneQty = ic?.qty_done !== undefined ? parseInt(ic.qty_done) : (itemDone ? itemQty : 0);
                const name = item.is_manual ? (item.custom_name || 'Manual') : (item.reference || '—');
                return (
                  <div key={item.id} style={{ padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      {itemQty > 1 ? (
                        <>
                          <button onClick={() => onToggleItem(item.id, null, Math.max(0, itemDoneQty - 1))}
                            disabled={itemDoneQty <= 0}
                            style={{ width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--panel2)', color: 'var(--white)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--white)', minWidth: 50, textAlign: 'center' }}>
                            {itemDoneQty}/{itemQty}
                          </span>
                          <button onClick={() => onToggleItem(item.id, null, Math.min(itemQty, itemDoneQty + 1))}
                            disabled={itemDoneQty >= itemQty}
                            style={{ width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--panel2)', color: 'var(--white)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', flex: 1 }}>{name}</span>
                          {itemDoneQty >= itemQty && <span style={{ fontSize: 11, color: 'var(--success)' }}>✅ Done</span>}
                          {itemDoneQty > 0 && itemDoneQty < itemQty && <span style={{ fontSize: 11, color: 'var(--warning)' }}>⏳ {Math.round((itemDoneQty / itemQty) * 100)}%</span>}
                          {itemDoneQty === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>⬜ Pending</span>}
                        </>
                      ) : (
                        <>
                          <input type="checkbox" checked={itemDone}
                            onChange={() => onToggleItem(item.id, !itemDone, undefined)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', flex: 1 }}>{name}</span>
                          <span style={{ fontSize: 11, color: itemDone ? 'var(--success)' : 'var(--muted)' }}>
                            {itemDone ? '✅ Done' : '⬜ Pending'}
                          </span>
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: 2, paddingLeft: itemQty > 1 ? 56 : 24 }}>
                      <input style={{ width: '100%', fontSize: 10, padding: '2px 6px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', outline: 'none' }}
                        placeholder="Execution notes..."
                        value={itemNotes[item.id] !== undefined ? itemNotes[item.id] : (ic?.execution_notes || '')}
                        onChange={e => setItemNotes(n => ({ ...n, [item.id]: e.target.value }))}
                        onBlur={() => {
                          const val = itemNotes[item.id];
                          if (val !== undefined) onToggleItem(item.id, null, undefined, val);
                        }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {allItems.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)', padding: 8 }}>No items in this panel</div>}
        </div>
      )}
    </div>
  );
});

export default ExecutionPanel;
