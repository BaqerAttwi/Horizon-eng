import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';
import { calcMetrics, calcPanelMetrics } from '../utils/summaryTesting';

const MODES = [
  { key: 'item', label: 'Search & Replace', icon: '↔️' },
  { key: 'panel', label: 'Panel vs Panel', icon: '📊' },
];

function formatPct(diff) {
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}

export default function SummaryTesting({ panels, project, id, onItemUpdate, onItemDelete, onReload, hideCost, exchangeRate }) {
  const [mode, setMode] = useState('item');
  const [itemSearch, setItemSearch] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [alternative, setAlternative] = useState(null);
  const [sourcePanelId, setSourcePanelId] = useState('');
  const [sourceDivId, setSourceDivId] = useState('');
  const [sourceItemId, setSourceItemId] = useState('');
  const [panelA, setPanelA] = useState('');
  const [panelB, setPanelB] = useState('');
  const [projectA, setProjectA] = useState('current');
  const [projectB, setProjectB] = useState('current');
  const [externalPanelsA, setExternalPanelsA] = useState([]);
  const [externalPanelsB, setExternalPanelsB] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [compareKey, setCompareKey] = useState(0);
  const [applying, setApplying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);

  const dq = searchQ.toLowerCase();

  // Get all items flattened for the item replace mode
  const allItems = useMemo(() => {
    const items = [];
    for (const p of panels) {
      for (const d of p.divisions || []) {
        for (const i of d.items || []) {
          items.push({ ...i, panel_number: p.panel_number, panel_name: p.panel_name, panel_id: p.id, division_id: d.id, division_type: d.division_type });
        }
      }
    }
    return items;
  }, [panels]);

  // Filter items by selected panel/division
  const filteredItems = useMemo(() => {
    let items = allItems;
    if (sourcePanelId) items = items.filter(i => i.panel_id === parseInt(sourcePanelId));
    if (sourceDivId) items = items.filter(i => i.division_id === parseInt(sourceDivId));
    const query = itemSearch.trim().toLowerCase();
    if (query) items = items.filter(i => [i.reference, i.custom_name, i.name, i.description, i.product_desc, i.custom_desc, i.brand_name, i.brand, i.custom_brand, i.panel_name, i.division_type].some(value => String(value || '').toLowerCase().includes(query)));
    return items;
  }, [allItems, sourcePanelId, sourceDivId, itemSearch]);

  // Search alternatives
  useEffect(() => {
    if (!dq.trim()) { setSearchRes([]); return; }
    const t = setTimeout(() => {
      api.get('/products', { params: { search: dq, limit: 10 } })
        .then(r => setSearchRes(r.data.products || []))
        .catch(e => toast.error(e.message, { id: 'api-' + e.message }));
    }, 300);
    return () => clearTimeout(t);
  }, [dq]);

  // Load projects for panel comparison
  useEffect(() => {
    if (mode !== 'panel') return;
    api.get('/projects').then(r => setAllProjects(r.data || [])).catch(e => toast.error(e.message, { id: 'api-' + e.message }));
  }, [mode]);

  // Fetch external panels when project changes
  useEffect(() => {
    if (projectA === 'current' || !projectA) { setExternalPanelsA([]); return; }
    api.get(`/projects/${projectA}/crm`)
      .then(r => setExternalPanelsA((r.data.panels || []).map(p => ({ ...p, exchange_rate_eur_usd: r.data.exchange_rate_eur_usd }))))
      .catch(e => { setExternalPanelsA([]); toast.error(e.message, { id: 'api-' + e.message }); });
  }, [projectA]);

  useEffect(() => {
    if (projectB === 'current' || !projectB) { setExternalPanelsB([]); return; }
    api.get(`/projects/${projectB}/crm`)
      .then(r => setExternalPanelsB((r.data.panels || []).map(p => ({ ...p, exchange_rate_eur_usd: r.data.exchange_rate_eur_usd }))))
      .catch(e => { setExternalPanelsB([]); toast.error(e.message, { id: 'api-' + e.message }); });
  }, [projectB]);

  // Resolve panels for A and B
  const panelsA = projectA === 'current' ? panels : externalPanelsA;
  const panelsB = projectB === 'current' ? panels : externalPanelsB;

  // Force remount when panel selections change
  useEffect(() => { setCompareKey(k => k + 1); }, [panelA, panelB, projectA, projectB]);

  const currentMetrics = useMemo(() => selectedItem ? calcMetrics(selectedItem, exchangeRate || 1.18) : null, [selectedItem, exchangeRate]);
  const altMetrics = useMemo(() => {
  if (!alternative) return null;
  const rate = exchangeRate || 1.18;
  const usd = parseFloat(alternative.price_usd) || (parseFloat(alternative.price_euro) * rate) || 0;
  const eur = parseFloat(alternative.price_euro) || (usd / rate) || 0;
  const altCost = parseFloat(alternative.price_cost) || parseFloat(alternative.cost) || 0;
  return calcMetrics({
    base_price_usd: usd,
    base_price_euro: eur,
    qty: selectedItem?.qty || 1,
    cost: altCost,
    discount_pct: selectedItem?.discount_pct || 0,
    markupP_pct: selectedItem?.markupP_pct || 0,
    manpower_pct: selectedItem?.manpower_pct || 0,
    markupM_pct: selectedItem?.markupM_pct || 0,
  });
}, [alternative, selectedItem, exchangeRate]);

  const handleSelectAlt = (p) => {
    setAlternative(p);
  };

  const handleApply = async () => {
    if (!selectedItem || !alternative) return;
    setApplying(true);
    try {
      const rate = exchangeRate || 1.18;
      const usd = parseFloat(alternative.price_usd) || (parseFloat(alternative.price_euro) * rate) || 0;
      const eur = parseFloat(alternative.price_euro) || (usd / rate) || 0;

      if (applyToAll) {
        // Find all items with same reference across all panels
        const matchRef = selectedItem.reference || selectedItem.custom_name;
        const matchIds = [];
        for (const p of panels) {
          for (const d of p.divisions || []) {
            for (const i of d.items || []) {
              const ref = i.reference || i.custom_name;
              if (ref && ref === matchRef && i.id !== selectedItem.id) {
                matchIds.push(i.id);
              }
            }
          }
        }
        const allIds = [selectedItem.id, ...matchIds];
        await api.post(`/projects/${id}/items/bulk-replace`, {
          item_ids: allIds,
          product_id: alternative.id,
          base_price_usd: usd,
          base_price_euro: eur,
        });
        await onReload?.();
        toast.success(`✅ Replaced in ${allIds.length} item(s) across all panels`);
      } else {
        const form = {
          base_price_usd: usd,
          base_price_euro: eur,
          product_id: alternative.id,
          is_manual: 0,
          custom_name: null,
          custom_desc: null,
          custom_brand: null,
          custom_price_euro: null,
          custom_price_usd: null,
        };
        if (await onItemUpdate(selectedItem.id, form) === false) return;
        await onReload?.();
        toast.success('✅ Item replaced with ' + (alternative.reference || alternative.name));
      }

      setShowConfirm(false);
      setAlternative(null);
      setSearchQ('');
      setSelectedItem(null);
      setSourcePanelId('');
      setSourceDivId('');
      setSourceItemId('');
      setApplyToAll(false);
    } catch (e) { toast.error(e.message); }
    finally { setApplying(false); }
  };

  // Resolve display price from product fields using project exchange rate
  const displayPrice = (p) => {
    const rate = exchangeRate || 1.18;
    let eur = parseFloat(p.price_euro);
    let usd = parseFloat(p.price_usd);
    if (usd && !eur) eur = usd / rate;
    if (eur && !usd) usd = eur * rate;
    return { eur: eur || 0, usd: usd || 0 };
  };

  const ComparisonTable = ({ left, right, leftLabel, rightLabel }) => {
    if (!left || !right) return null;
    const metrics = [
      { key: 'basePrice', label: 'Unit Price', higher: 'worse' },
      { key: 'cost', label: 'Cost', higher: 'worse' },
      { key: 'finalPrice', label: 'Final Price', higher: 'better' },
      { key: 'profit', label: 'Profit', higher: 'better' },
      { key: 'margin', label: 'Margin', higher: 'better' },
    ];
    return <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr><th>Metric</th><th>{leftLabel || 'Current'}</th><th>{rightLabel || 'Alternative'}</th><th>Difference</th></tr></thead>
        <tbody>{metrics.map(metric => {
          const l = left[metric.key], r = right[metric.key];
          const diff = r - l;
          const pct = l !== 0 ? diff / Math.abs(l) * 100 : null;
          const format = value => metric.key === 'margin' ? value.toFixed(2) + '%' : '$' + value.toFixed(2);
          const better = metric.higher === 'better' ? diff > 0 : diff < 0;
          const change = metric.key === 'margin' ? formatPct(diff) + ' points' : (diff > 0 ? '+' : diff < 0 ? '-' : '') + '$' + Math.abs(diff).toFixed(2) + (pct === null ? '' : ' (' + formatPct(pct) + ')');
          return <tr key={metric.key} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{metric.label}</td>
            <td style={{ textAlign: 'right', padding: '6px 10px' }}>{format(l)}</td>
            <td style={{ textAlign: 'right', padding: '6px 10px' }}>{format(r)}</td>
            <td style={{ textAlign: 'right', padding: '6px 10px', color: diff === 0 ? 'var(--muted)' : better ? 'var(--success)' : 'var(--danger)' }}>{change}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>;
  };

  return (
    <div className="card">
      <div className="card-body">
        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {MODES.map(m => (
            <button key={m.key} className={`btn btn-sm ${mode === m.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setMode(m.key); setSelectedItem(null); setAlternative(null); setSearchQ(''); setSelectedItem(null); }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* ── Mode: Item Replace ── */}
        {mode === 'item' && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', marginBottom: 10 }}>
              Search project items, select an occurrence, then search for its replacement
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="form-group" style={{ minWidth: 160 }}>
                <label className="form-label">Panel</label>
                <select className="form-input" value={sourcePanelId} onChange={e => { setSourcePanelId(e.target.value); setSourceDivId(''); setSourceItemId(''); }}>
                  <option value="">All Panels</option>
                  {panels.map(p => <option key={p.id} value={p.id}>Panel #{p.panel_number}{p.panel_name ? ` — ${p.panel_name}` : ''}</option>)}
                </select>
              </div>
              {sourcePanelId && (
                <div className="form-group" style={{ minWidth: 160 }}>
                  <label className="form-label">Division</label>
                  <select className="form-input" value={sourceDivId} onChange={e => { setSourceDivId(e.target.value); setSourceItemId(''); }}>
                    <option value="">All Divisions</option>
                    {(panels.find(p => p.id === parseInt(sourcePanelId))?.divisions || []).map(d => (
                      <option key={d.id} value={d.id} style={{ color: 'var(--accent)' }}>{d.division_type}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <input className="form-input" aria-label="Search project items" placeholder="Search project items by reference, name, description, or brand..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} style={{ marginBottom: 12 }} />
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No items found</div>
              ) : filteredItems.map(item => {
                const ref = item.is_manual ? (item.custom_name || 'Manual') : (item.reference || 'Unknown');
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', background: isSelected ? 'var(--accent)' : '',
                    color: isSelected ? '#fff' : 'inherit'
                  }}
                    onClick={() => { setSelectedItem(item); setAlternative(null); setSearchQ(''); }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: isSelected ? '#ddd' : 'var(--muted)', minWidth: 60 }}>P#{item.panel_number}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: isSelected ? '#fff' : 'var(--white)' }}>{ref}</span>
                    <span style={{ fontSize: 11, color: isSelected ? '#ddd' : 'var(--muted)' }}>${parseFloat(item.base_price_usd || 0).toFixed(2)}</span>
                    <span style={{ fontSize: 11, color: isSelected ? '#ddd' : 'var(--muted)' }}>×{item.qty || 1}</span>
                  </div>
                );
              })}
            </div>

            {selectedItem && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', marginBottom: 8 }}>
                  Search alternative product:
                </div>
                <input className="form-input" placeholder="🔍 Search by reference, name, or description..."
                  value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ marginBottom: 12 }} />
                {searchQ.trim() && searchRes.length > 0 && (
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
                    {searchRes.map(p => {
                      const isAlt = alternative?.id === p.id;
                      return (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)', background: isAlt ? 'var(--accent)' : '',
                          color: isAlt ? '#fff' : 'inherit'
                        }}
                          onClick={() => handleSelectAlt(p)}>
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: isAlt ? '#ddd' : 'var(--accent)', minWidth: 80 }}>{p.reference}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: isAlt ? '#fff' : 'var(--white)' }}>{p.description || p.name}</span>
                          <span style={{ fontSize: 11, color: isAlt ? '#ddd' : 'var(--success)' }}>${displayPrice(p).usd.toFixed(2)} / €{displayPrice(p).eur.toFixed(2)}</span>
                          {p.stock_qty !== undefined && (
                            <span style={{ fontSize: 11, color: p.stock_qty > 0 ? 'var(--success)' : 'var(--danger)' }}>
                              Stock: {p.stock_qty}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {alternative && currentMetrics && altMetrics && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div style={{
                      background: 'var(--panel)', borderRadius: 8, padding: 12, marginBottom: 12,
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Current: </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>
                            {selectedItem.is_manual ? (selectedItem.custom_name || 'Manual') : (selectedItem.reference || 'Unknown')}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>Panel #{selectedItem.panel_number}</span>
                        </div>
                        <div style={{ fontSize: 18, color: 'var(--muted)' }}>↔</div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                            {alternative.reference || alternative.name}
                          </span>
                          {!hideCost && alternative.available_qty !== undefined && (
                            <div style={{ fontSize: 11, color: alternative.available_qty > 0 ? 'var(--success)' : 'var(--danger)' }}>
                              Available: {alternative.available_qty} units
                            </div>
                          )}
                        </div>
                      </div>

                      <ComparisonTable left={currentMetrics} right={altMetrics}
                        leftLabel={`Current (P#${selectedItem.panel_number})`} rightLabel={alternative.reference || 'Alternative'} />
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <button className="btn btn-primary"
                        onClick={() => setShowConfirm(true)}
                        style={{ background: currentMetrics.finalPrice > altMetrics.finalPrice ? 'var(--success)' : 'var(--accent2)' }}>
                        {currentMetrics.finalPrice > altMetrics.finalPrice
                          ? '💰 Apply — Cheaper Alternative'
                          : '📋 Apply Replacement'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Mode: Panel vs Panel ── */}
        {mode === 'panel' && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', marginBottom: 10 }}>
              Compare two panels from any project
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div className="form-group" style={{ minWidth: 200 }}>
                <label className="form-label">Panel A</label>
                <select className="form-input" value={projectA} onChange={e => { setProjectA(e.target.value); setPanelA(''); }}>
                  <option value="current">Current Project</option>
                  {allProjects.filter(p => p.id !== parseInt(id)).map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
                <select className="form-input" value={panelA} onChange={e => setPanelA(e.target.value)} style={{ marginTop: 4 }}>
                  <option value="">Select panel...</option>
                  {panelsA.map(p => <option key={p.id} value={p.id}>Panel #{p.panel_number}{p.panel_name ? ` — ${p.panel_name}` : ''}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 200 }}>
                <label className="form-label">Panel B</label>
                <select className="form-input" value={projectB} onChange={e => { setProjectB(e.target.value); setPanelB(''); }}>
                  <option value="current">Current Project</option>
                  {allProjects.filter(p => p.id !== parseInt(id)).map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
                <select className="form-input" value={panelB} onChange={e => setPanelB(e.target.value)} style={{ marginTop: 4 }}>
                  <option value="">Select panel...</option>
                  {panelsB.map(p => <option key={p.id} value={p.id}>Panel #{p.panel_number}{p.panel_name ? ` — ${p.panel_name}` : ''}</option>)}
                </select>
              </div>
            </div>
            {panelA && panelB && (projectA !== projectB || panelA !== panelB) && (() => {
              const rate = exchangeRate || 1.18;
              const a = panelsA.find(p => p.id === parseInt(panelA));
              const b = panelsB.find(p => p.id === parseInt(panelB));
              if (!a || !b) return <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:12 }}>Panel not found</div>;

              const { total: aTotal, cost: aCost } = calcPanelMetrics(a, a.exchange_rate_eur_usd || rate);
              const { total: bTotal, cost: bCost } = calcPanelMetrics(b, b.exchange_rate_eur_usd || rate);
              const diff = bTotal - aTotal;
              const pct = aTotal !== 0 ? (diff / aTotal) * 100 : 0;
              const aItems = (a.divisions || []).reduce((s, d) => s + (d.items || []).length, 0);
              const bItems = (b.divisions || []).reduce((s, d) => s + (d.items || []).length, 0);
              const projNameA = projectA === 'current' ? 'Current' : (allProjects.find(p => p.id === parseInt(projectA))?.project_name || 'Other');
              const projNameB = projectB === 'current' ? 'Current' : (allProjects.find(p => p.id === parseInt(projectB))?.project_name || 'Other');

              return (
                <div key={compareKey} style={{ background: 'var(--panel)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start', marginBottom: 12 }}>
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--panel2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{projNameA}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Panel A</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>#{a.panel_number}</div>
                      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>${aTotal.toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{aItems} items</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: pct > 0 ? 'var(--success)' : pct < 0 ? 'var(--danger)' : 'var(--muted)' }}>
                        {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        ${Math.abs(diff).toFixed(2)} {diff > 0 ? 'more' : 'less'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--panel2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{projNameB}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Panel B</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>#{b.panel_number}</div>
                      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>${bTotal.toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{bItems} items</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    {[a, b].map((panel, index) => <div key={index} style={{ overflowX: 'auto' }}>
                      <h4>Panel {index === 0 ? 'A' : 'B'} — {panel.panel_name || '#' + panel.panel_number}</h4>
                      {(panel.divisions || []).map(division => <div key={division.id}>
                        <div style={{ fontWeight: 600, margin: '8px 0' }}>{division.division_type}</div>
                        <table style={{ width: '100%', fontSize: 12 }}><thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit $</th></tr></thead>
                          <tbody>{(division.items || []).map(item => <tr key={item.id}>
                            <td>{item.is_manual ? item.custom_name : item.reference || item.name}</td>
                            <td>{item.is_manual ? item.custom_desc : item.product_desc || item.description}</td>
                            <td>{item.qty ?? 1}</td><td>{Number(item.base_price_usd || Number(item.base_price_euro || 0) * rate).toFixed(2)}</td>
                          </tr>)}</tbody></table>
                        {!(division.items || []).length && <p>No items in this division.</p>}
                      </div>)}
                      {!(panel.divisions || []).length && <p>No items in this panel.</p>}
                    </div>)}
                  </div>
                  {!hideCost && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: 8 }}>
                      Cost: ${aCost.toFixed(2)} vs ${bCost.toFixed(2)} —
                      Profit: ${(aTotal - aCost).toFixed(2)} vs ${(bTotal - bCost).toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* ── Confirm Modal ── */}
        {showConfirm && selectedItem && alternative && (
          <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <span className="modal-title">⚠️ Confirm Replacement</span>
                <button className="btn-icon" onClick={() => setShowConfirm(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--white)', marginBottom: 8 }}>
                  Are you sure you want to replace this item?
                </p>
                <div style={{ background: 'var(--panel)', padding: 10, borderRadius: 6, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Panel #{selectedItem?.panel_number}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
                    ✕ {selectedItem?.is_manual ? (selectedItem?.custom_name || 'Manual') : (selectedItem?.reference || 'Unknown')}
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 16, color: 'var(--muted)', marginBottom: 8 }}>↓</div>
                <div style={{ background: 'var(--panel)', padding: 10, borderRadius: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                    ✓ {alternative?.reference || alternative?.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    ${displayPrice(alternative).usd.toFixed(2)} / €{displayPrice(alternative).eur.toFixed(2)}
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }} />
                  Apply to all panels — replace <strong style={{ color: 'var(--white)' }}>{selectedItem?.reference || selectedItem?.custom_name}</strong> everywhere in this project
                </label>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowConfirm(false)} disabled={applying}>Cancel</button>
                <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
                  {applying ? <><span className="spinner" /> Applying...</> : '✅ Confirm Replace'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
