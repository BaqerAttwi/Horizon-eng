import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import ActivityLog from '../components/ActivityLog';
import FileAttachments from '../components/FileAttachments';
import SummaryTesting from '../components/SummaryTesting';
import PanelSection from '../components/crm/PanelSection';
import ExecutionPanel from '../components/crm/ExecutionPanel';
import ProjectTechnicians from '../components/crm/ProjectTechnicians';
import ProjectPayments from '../components/crm/ProjectPayments';
import useCrmProject from '../hooks/useCrmProject';
import { useAuth } from '../context/AuthContext';

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
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Leave blank to keep current values.</div>
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
            for (const [k, v] of Object.entries(form)) { if (v !== '') changes[k] = parseFloat(v); }
            onApply(changes);
          }}>Apply to {count} items</button>
        </div>
      </div>
    </div>
  );
}

function flattenProjectItems(panels) {
  return panels.flatMap(panel => (panel.divisions || []).flatMap(division =>
    (division.items || []).map(item => ({ ...item, panel_id: panel.id, panel_number: panel.panel_number, panel_name: panel.panel_name, division_type: division.division_type }))
  ));
}

function CrItemsPage({ projectId, panels, onChanged }) {
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of flattenProjectItems(panels)) {
      const name = item.is_manual ? (item.custom_name || 'Manual item') : (item.reference || item.product_desc || 'Unknown item');
      const key = item.product_id ? `product:${item.product_id}` : `manual:${name.trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, name, items: [], current: Number(item.cr_amount) || 0 });
      map.get(key).items.push(item);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [panels]);

  const apply = async group => {
    const value = Number(edits[group.key]);
    if (!Number.isFinite(value) || value < 0) return toast.error('Enter a valid C.R. amount');
    setSaving(group.key);
    try {
      await api.post(`/projects/${projectId}/items/bulk-update`, { item_ids: group.items.map(item => item.id), changes: { cr_amount: value } });
      toast.success(`C.R. updated for ${group.items.length} matching items`);
      await onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  return <div className="card"><div className="card-body" style={{ overflowX: 'auto' }}>
    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>All project items are grouped by product/name. Applying a C.R. amount updates every matching occurrence across all panels and divisions.</div>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
      <th style={{ textAlign: 'left', padding: 8 }}>Item</th><th>Occurrences</th><th style={{ textAlign: 'left' }}>Panels</th><th>Current C.R.</th><th>New C.R.</th><th></th>
    </tr></thead><tbody>{groups.map(group => <tr key={group.key} style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: 8, fontWeight: 700, color: 'var(--accent)' }}>{group.name}</td>
      <td style={{ textAlign: 'center' }}>{group.items.length}</td>
      <td>{[...new Set(group.items.map(item => `#${item.panel_number}${item.panel_name ? ` ${item.panel_name}` : ''}`))].join(', ')}</td>
      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>${group.current.toFixed(2)}</td>
      <td style={{ textAlign: 'center' }}><input type="number" min="0" step="0.01" className="form-input" style={{ width: 100 }} value={edits[group.key] ?? ''} placeholder={group.current.toFixed(2)} onChange={e => setEdits(v => ({ ...v, [group.key]: e.target.value }))} /></td>
      <td><button className="btn btn-sm btn-primary" disabled={saving === group.key || edits[group.key] === undefined || edits[group.key] === ''} onClick={() => apply(group)}>{saving === group.key ? 'Saving...' : 'Apply to all'}</button></td>
    </tr>)}</tbody></table>
    {!groups.length && <div className="empty"><p>No project items found.</p></div>}
  </div></div>;
}

function ProjectMarkupPage({ projectId, panels, onChanged }) {
  const [form, setForm] = useState({ markupP_pct: '', manpower_pct: '', markupM_pct: '' });
  const [panelEdits, setPanelEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState(null);
  const values = {
    markupP_pct: Number(form.markupP_pct) || 0,
    manpower_pct: Number(form.manpower_pct) || 0,
    markupM_pct: Number(form.markupM_pct) || 0,
  };
  const previewItem = (item, markupValues) => {
    const qty = Number(item.qty) || 1;
    const base = (Number(item.base_price_usd) || 0) * qty;
    const afterDiscount = base * (1 - (Number(item.discount_pct) || 0) / 100);
    const productMarkup = afterDiscount * markupValues.markupP_pct / 100;
    const manpower = afterDiscount * markupValues.manpower_pct / 100;
    return afterDiscount + productMarkup + manpower + manpower * markupValues.markupM_pct / 100;
  };
  const rows = panels.map(panel => {
    const items = (panel.divisions || []).flatMap(d => d.items || []);
    const edit = panelEdits[panel.id] || {};
    const panelHasValues = ['markupP_pct', 'manpower_pct', 'markupM_pct'].every(key => edit[key] !== undefined && edit[key] !== '');
    const panelValues = { markupP_pct: Number(edit.markupP_pct) || 0, manpower_pct: Number(edit.manpower_pct) || 0, markupM_pct: Number(edit.markupM_pct) || 0 };
    return { panel, items, current: Number(panel.total_price) || 0, panelHasValues, panelValues,
      preview: items.reduce((sum, item) => sum + previewItem(item, panelHasValues ? panelValues : values), 0) };
  });
  const hasValues = Object.values(form).every(value => value !== '');
  const apply = async () => {
    const itemIds = rows.flatMap(row => row.items.map(item => item.id));
    if (!itemIds.length) return toast.error('No items to update');
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/items/bulk-update`, { item_ids: itemIds, changes: values });
      toast.success(`Markup updated for ${itemIds.length} items`);
      await onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };
  const applyPanel = async row => {
    if (!row.items.length) return toast.error('This panel has no items');
    setSavingPanel(row.panel.id);
    try {
      await api.post(`/projects/${projectId}/items/bulk-update`, { item_ids: row.items.map(item => item.id), changes: row.panelValues });
      toast.success(`Markup updated for Panel #${row.panel.panel_number}`);
      await onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSavingPanel(null); }
  };
  return <div className="card"><div className="card-body">
    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Enter the new project markup values to preview every panel and the full project before applying.</div>
    <div className="form-row">{[['markupP_pct','Product Markup %'],['manpower_pct','Manpower %'],['markupM_pct','Manpower Markup %']].map(([key,label]) => <div className="form-group" key={key}><label className="form-label">{label}</label><input type="number" min="0" step="0.1" className="form-input" value={form[key]} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} /></div>)}</div>
    <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={!hasValues || saving} onClick={apply}>{saving ? 'Applying...' : 'Apply Markup to Entire Project'}</button>
    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 20, marginBottom: 6 }}>Try and apply markup one panel at a time</div>
    <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ borderBottom: '2px solid var(--border)' }}><th style={{ textAlign: 'left', padding: 8 }}>Panel</th><th>Items</th><th>Current Price</th><th>Product Mk%</th><th>Manpower%</th><th>Manpower Mk%</th><th>New Price</th><th>Change</th><th></th></tr></thead><tbody>
      {rows.map(row => <tr key={row.panel.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: 8 }}>#{row.panel.panel_number} {row.panel.panel_name}</td><td style={{ textAlign: 'center' }}>{row.items.length}</td><td style={{ textAlign: 'right' }}>${row.current.toFixed(2)}</td>
        {['markupP_pct','manpower_pct','markupM_pct'].map(key => <td key={key} style={{ padding: 4 }}><input type="number" min="0" step="0.1" className="form-input" style={{ width: 72, padding: '4px 6px' }} value={panelEdits[row.panel.id]?.[key] ?? ''} placeholder="%" onChange={e => setPanelEdits(v => ({ ...v, [row.panel.id]: { ...(v[row.panel.id] || {}), [key]: e.target.value } }))} /></td>)}
        <td style={{ textAlign: 'right', color: 'var(--accent2)' }}>{row.panelHasValues ? `$${row.preview.toFixed(2)}` : '—'}</td><td style={{ textAlign: 'right', color: row.preview >= row.current ? 'var(--success)' : 'var(--danger)' }}>{row.panelHasValues ? `${row.preview >= row.current ? '+' : '-'}$${Math.abs(row.preview-row.current).toFixed(2)}` : '—'}</td>
        <td style={{ padding: 4 }}><button className="btn btn-sm btn-primary" disabled={!row.panelHasValues || savingPanel === row.panel.id} onClick={() => applyPanel(row)}>{savingPanel === row.panel.id ? 'Applying...' : 'Apply Panel'}</button></td>
      </tr>)}
    </tbody><tfoot><tr style={{ borderTop: '2px solid var(--border)', fontWeight: 800 }}>
      <td colSpan={2} style={{ padding: 8 }}>Project Total</td><td style={{ textAlign: 'right' }}>${rows.reduce((s,r)=>s+r.current,0).toFixed(2)}</td><td colSpan={3}></td>
      <td style={{ textAlign: 'right', color: 'var(--accent2)' }}>${rows.reduce((s,r)=>s+(r.panelHasValues?r.preview:r.current),0).toFixed(2)}</td><td></td><td></td>
    </tr></tfoot></table></div>
  </div></div>;
}

export default function CrmProjectPage() {
  const navigate = useNavigate();
  const { isRole } = useAuth();
  const {
    project, setProject, panels, loading,divisionTypes,
    pendingPriceChanges,
    showAddPanel, setShowAddPanel,
    showCopyPanel, setShowCopyPanel, copyStep, setCopyStep,
    sourceProjects, setSourceProjects,
    selectedSourceProject, setSelectedSourceProject,
    selectedSourcePanel, setSelectedSourcePanel,
    copying, setCopying,
    executionData,
    selectedItems,
    showBulkEdit, setShowBulkEdit,
    brandDiscountEdits, setBrandDiscountEdits,
    showBrandPreview, setShowBrandPreview,
    previewBrand, previewDiscPct,
    applyingBrandDisc,
    activeTab, setActiveTab,
    editView, setEditView,
    hideCost, showCr, exchangeRate,
    load, addPanel, openCopyPanel, copyPanel,
    updatePanel, deletePanel, togglePanelComplete,
    addDivision, deleteDivision,
    addItem, updateItem, deleteItem,
    toggleExecutionPanel, toggleExecutionItem,
    handleGroupInstanceQtyChange, handleGroupInstanceDescriptionChange, handleGroupInstanceRemove,
    handleReadyForReview, handleBulkEdit, clearSelection,
    toggleSelectItem, selectAllForDivision,
    openBrandPreview, handleConfirmBrandDiscount,
    executionStats,
    brandPanelBreakdown, brandData, brandPreview,
    reportItems, reportSummary,
    projectTotal, baseTotal, discPct, discAmt, netAfterDisc, vatPct, vatAmt, projectTotalWithVat,
  } = useCrmProject();

  if (loading) return <div className="page"><div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading CRM...</div></div>;
  if (!project) return <div className="page"><div className="empty"><p>Project not found</p></div></div>;
  const commercialLocked = project.client_approval === 'approved' && !isRole('owner','head_engineer');

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
            {!hideCost && <>Rate: 1 EUR = {project.exchange_rate_eur_usd} USD • </>}
            Panels: {panels.length}{!hideCost && <> • Total: <strong style={{ color: 'var(--success)' }}>${projectTotal.toFixed(2)}</strong></>}
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
          {!commercialLocked && <button className="btn btn-primary" onClick={() => setShowAddPanel(true)}>+ Add Panel</button>}
          <a href={`/api/export/crm/${project.id}`} className="btn btn-secondary" style={{ textDecoration: 'none' }}>📥 CSV</a>
          {!commercialLocked && <button className="btn btn-secondary" onClick={openCopyPanel}>📋 Copy from existing</button>}
          <button className="btn btn-success" onClick={handleReadyForReview}
            style={{ background: 'var(--success)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ✅ Ready for Review
          </button>
        </div>
      </div>

      {commercialLocked && <div className="tint-box" style={{ marginBottom: 12, borderColor:'var(--accent2)', color:'var(--accent2)' }}>
        🔒 Client-approved quotation: panels, quantities, items, and prices are read-only. Only Owner can make commercial changes. Progress and execution tracking remain available.
      </div>}

      <div style={{ display: 'flex', gap: 0, marginBottom: 4, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', overflowX: 'auto' }}>
        <button onClick={() => setActiveTab('items')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'items' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'items' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          📋 Items
        </button>
        {activeTab === 'items' && !commercialLocked && (
          <button onClick={() => setEditView(v => !v)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, border: 'none', background: editView ? 'var(--accent)' : 'transparent', color: editView ? '#fff' : 'var(--muted)', borderRadius: '0 0 6px 6px', cursor: 'pointer', marginLeft: 4, borderBottom: editView ? 'none' : '2px solid transparent' }}>
            {editView ? '◉ Edit View ON' : '○ Edit View'}
          </button>
        )}
        {!hideCost && <button onClick={() => setActiveTab('brands')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'brands' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'brands' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          🏷️ Brand Summary
        </button>}
        {isRole('owner','head_engineer') && <button onClick={() => setActiveTab('cr-items')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'cr-items' ? 'var(--accent2)' : 'var(--muted)', borderBottom: activeTab === 'cr-items' ? '2px solid var(--accent2)' : '2px solid transparent', cursor: 'pointer' }}>
          💵 C.R. Items
        </button>}
        {isRole('owner','head_engineer') && <button onClick={() => setActiveTab('markup')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'markup' ? 'var(--accent2)' : 'var(--muted)', borderBottom: activeTab === 'markup' ? '2px solid var(--accent2)' : '2px solid transparent', cursor: 'pointer' }}>
          📈 Project Markup
        </button>}
        <button onClick={() => setActiveTab('report')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'report' ? 'var(--accent)' : 'var(--muted)', borderBottom: activeTab === 'report' ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
          📋 Final Report
        </button>
        {isRole('owner','head_engineer') && (<button onClick={() => setActiveTab('testing')}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'testing' ? 'var(--accent2)' : 'var(--muted)', borderBottom: activeTab === 'testing' ? '2px solid var(--accent2)' : '2px solid transparent', cursor: 'pointer' }}>
          🧪 Summary Testing
        </button>
        )}
        {project.client_approval === 'approved' && (
          <button onClick={() => setActiveTab('execution')}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'execution' ? 'var(--success)' : 'var(--muted)', borderBottom: activeTab === 'execution' ? '2px solid var(--success)' : '2px solid transparent', cursor: 'pointer' }}>
            🔧 Execution
          </button>
        )}
        {(isRole('owner') || isRole('accounting')) && (
          <button onClick={() => setActiveTab('payments')}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', color: activeTab === 'payments' ? 'var(--success)' : 'var(--muted)', borderBottom: activeTab === 'payments' ? '2px solid var(--success)' : '2px solid transparent', cursor: 'pointer' }}>
            💰 Payments
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
                          try {
                            const r = await api.get(`/projects/${p.id}/crm`);
                            setSelectedSourceProject(prev => ({ ...prev, panels: r.data.panels || [] }));
                          } catch (e) {
                            toast.error(e.message);
                            setCopyStep('projects');
                          }
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
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Panel #{p.panel_number}{p.panel_name ? ` — ${p.panel_name}` : ''} × {p.quantity || 1}</div>
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

      {activeTab === 'items' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minHeight: 400 }}>
          {panels.map(panel => (
            <PanelSection key={panel.id} panel={panel} project={project} exchangeRate={exchangeRate}
              onUpdatePanel={updatePanel} onDeletePanel={deletePanel} onToggleComplete={togglePanelComplete}
              onAddDivision={addDivision} onItemAdd={addItem} onItemUpdate={updateItem}
              onItemDelete={deleteItem} onDivisionDelete={deleteDivision} hideCost={hideCost}
              showCr={showCr}
              pendingPriceChanges={pendingPriceChanges}
              onGroupInstanceQtyChange={handleGroupInstanceQtyChange}
              onGroupInstanceDescriptionChange={handleGroupInstanceDescriptionChange}
              onGroupInstanceRemove={handleGroupInstanceRemove}
              onGroupAdded={load}
              selectedItems={selectedItems}
              onToggleItem={toggleSelectItem}
              onSelectAll={selectAllForDivision}
              editView={commercialLocked ? false : editView} divisionTypes={divisionTypes} />
          ))}
        </div>
      )}

      {activeTab === 'cr-items' && isRole('owner','head_engineer') && <CrItemsPage projectId={project.id} panels={panels} onChanged={load} />}
      {activeTab === 'markup' && isRole('owner','head_engineer') && <ProjectMarkupPage projectId={project.id} panels={panels} onChanged={load} />}

      {isRole('owner') && selectedItems.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: 'var(--panel2)', borderTop: '1px solid var(--accent)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
          justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>{selectedItems.size} selected</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowBulkEdit(true)}>✏️ Edit Selected</button>
          <button className="btn btn-sm btn-secondary" onClick={clearSelection}>Clear</button>
        </div>
      )}

      {isRole('owner') && showBulkEdit && (
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
            {isRole('owner') && <ProjectTechnicians projectId={project.id} />}
            {panels.length > 0 && (() => {
              const { totalQty, doneQty } = executionStats;
              const pct = totalQty > 0 ? Math.round((doneQty / totalQty) * 100) : 0;
              return (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)' }}>Project Progress</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{doneQty}/{totalQty} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 5, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })()}
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
                    try { await api.patch(`/projects/${project.id}/execution/panels/${pid}`, { description }); }
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
                      const discPctVal = hasEdit ? parseFloat(edit) : null;
                      const previewTotal = hasEdit && !isNaN(discPctVal) ? (brandPreview[b.brand] ?? null) : null;
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
                            disabled={!isRole('owner','head_engineer')}
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
                            disabled={!isRole('owner','head_engineer') || !hasEdit || isNaN(parseFloat(edit))}>
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

      {showBrandPreview && (
        <div className="modal-overlay" onClick={() => setShowBrandPreview(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="modal-title">📊 Preview: {previewDiscPct}% Discount on {previewBrand}</span>
              <button className="btn-icon" onClick={() => setShowBrandPreview(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Review the impact per panel before applying</div>
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

      {activeTab === 'testing' && isRole('owner','head_engineer') && (
        <SummaryTesting panels={panels} project={project} id={project.id}
          onItemUpdate={updateItem} onItemDelete={deleteItem}
          hideCost={hideCost} exchangeRate={exchangeRate} />
      )}

      {activeTab === 'payments' && (isRole('owner') || isRole('accounting')) && (
        <ProjectPayments projectId={project.id} />
      )}

      {activeTab === 'activity' && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>📜 Activity Log</h3>
            <ActivityLog projectId={project.id} />
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>📎 File Attachments</h3>
            <FileAttachments projectId={project.id} panels={panels} project={project} onProjectUpdate={setProject} />
          </div>
        </div>
      )}
    </div>
  );
}
