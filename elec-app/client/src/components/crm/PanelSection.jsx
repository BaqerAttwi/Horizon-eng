import { useState, useRef, useEffect, memo } from 'react';
import toast from 'react-hot-toast';
import { DIVISION_TYPES } from '../../utils/crmPricing';
import DivisionSection from './DivisionSection';

function IntersectionLazy({ children, minHeight = 120, rootMargin = '300px', immediate }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, immediate]);

  if (immediate) return children;

  return (
    <div ref={ref} style={{ minHeight: visible ? 0 : minHeight }}>
      {visible ? children : null}
    </div>
  );
}

const PanelSection = memo(function PanelSection({ panel, project, exchangeRate, onUpdatePanel, onDeletePanel, onToggleComplete,
  onAddDivision, onItemAdd, onItemUpdate, onItemDelete, onDivisionDelete, hideCost, showCr, pendingPriceChanges,
  onGroupInstanceQtyChange, onGroupInstanceRemove, onGroupAdded, selectedItems, onToggleItem, onSelectAll, editView }) {

  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [form, setForm] = useState({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct, note: panel.note || '', show_note_in_client_pdf: panel.show_note_in_client_pdf || false, onedrive_link: panel.onedrive_link || '' });

  const handleSavePanel = async () => {
    await onUpdatePanel(panel.id, form);
    toast.success('Panel updated');
    setEditing(false);
  };

  return (
    <div className="panel-section" style={{ marginBottom: 20, border: panel.is_completed ? '2px solid var(--success)' : '1px solid var(--border)', borderRadius: 10, overflow: 'visible', position: 'relative', background: 'var(--panel2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--accent)', borderBottom: collapsed ? 'none' : '1px solid var(--border)', borderRadius: collapsed ? '9px' : '9px 9px 0 0', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: 8 }}
        onClick={() => setCollapsed(!collapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ fontSize: 12, color: '#fff', transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0 }}>{collapsed ? '▶' : '▼'}</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0 }}>Panel #{panel.panel_number}</span>
          {panel.panel_name && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>— {panel.panel_name}</span>}
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.9)', flexShrink: 0 }}>
            Total: ${(parseFloat(panel.total_price) || 0).toFixed(2)}
          </span>
          {showCr && (() => {
            let cr = 0;
            for (const d of panel.divisions || []) {
              for (const it of d.items || []) cr += (parseFloat(it.cr_amount) || 0) * (parseFloat(it.qty) || 1);
              for (const gi of d.group_instances || []) {
                for (const it of gi.items || []) cr += (parseFloat(it.cr_amount) || 0) * (parseFloat(it.qty) || 1);
              }
            }
            const panelPrice = parseFloat(panel.total_price) || 0;
            return (
              <>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(251,191,36,0.9)', flexShrink: 0 }}>
                  C.R: ${cr.toFixed(2)}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(34,197,94,0.9)', flexShrink: 0 }}>
                  N Profit: ${(panelPrice - cr).toFixed(2)}
                </span>
              </>
            );
          })()}
          {panel.onedrive_link && (
            <a href={panel.onedrive_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 10, textDecoration: 'none', flexShrink: 0 }}
              title="Open OneDrive link">
              ☁️ OneDrive
            </a>
          )}
          {panel.updated_by_name && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              Last edit: {panel.updated_by_name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          {editing ? (
            <>
              <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); handleSavePanel(); }}>Save</button>
              <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); setEditing(false); setForm({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct, note: panel.note || '', show_note_in_client_pdf: panel.show_note_in_client_pdf || false, onedrive_link: panel.onedrive_link || '' }); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" style={{ background: panel.is_completed ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.2)', color: panel.is_completed ? 'var(--success)' : '#fff', flexShrink: 0 }}
                onClick={e => { e.stopPropagation(); onToggleComplete(panel.id); }}>
                {panel.is_completed ? '✓ Complete' : '☐ Mark Complete'}
              </button>
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
                onClick={e => { e.stopPropagation(); setEditing(true); setForm({ panel_name: panel.panel_name, markupP: panel.markupP, markupM: panel.markupM, manpower_pct: panel.manpower_pct, note: panel.note || '', show_note_in_client_pdf: panel.show_note_in_client_pdf || false, onedrive_link: panel.onedrive_link || '' }); }}>Edit Panel</button>
            </>
          )}
          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.25)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onDeletePanel(panel.id); }}>Delete</button>
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
          <div className="form-row" style={{ gap: 12, marginTop: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">☁️ OneDrive Link (optional)</label>
              <input className="form-input" type="url" value={form.onedrive_link} onChange={e => setForm(f => ({ ...f, onedrive_link: e.target.value }))} placeholder="Paste a OneDrive folder/file share link for this panel..." />
            </div>
          </div>
        </div>
      )}

      {!collapsed && (
        <IntersectionLazy minHeight={120} immediate={true}>
          <div>
            {panel.divisions?.map(div => (
              <DivisionSection key={div.id} division={div} panel={panel} project={project} exchangeRate={exchangeRate}
                onItemAdd={onItemAdd} onItemUpdate={onItemUpdate} onItemDelete={onItemDelete}
                onDivisionDelete={onDivisionDelete} hideCost={hideCost} showCr={showCr}
                pendingPriceChanges={pendingPriceChanges}
                onGroupInstanceQtyChange={onGroupInstanceQtyChange}
                onGroupInstanceRemove={onGroupInstanceRemove}
                onGroupAdded={onGroupAdded}
                selectedItems={selectedItems}
                onToggleItem={onToggleItem}
                onSelectAll={onSelectAll}
                editView={editView} />
            ))}
          </div>
        </IntersectionLazy>
      )}

      {!collapsed && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
      )}
    </div>
  );
});

export default PanelSection;
