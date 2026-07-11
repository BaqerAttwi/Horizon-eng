import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';

const MODES = [
  { key: 'item', label: 'Item Replace', icon: '↔️' },
  { key: 'panel', label: 'Panel vs Panel', icon: '📊' },
  { key: 'product', label: 'Product Across Project', icon: '🔍' },
];

function calcMetrics(item) {
  const base = parseFloat(item.base_price_usd || 0);
  const eur = parseFloat(item.base_price_euro || 0);
  const qty = parseInt(item.qty) || 1;
  const baseTotal = base * qty;
  const disc = baseTotal * (parseFloat(item.discount_pct) / 100);
  const afterDisc = baseTotal - disc;
  const mkP = afterDisc * (parseFloat(item.markupP_pct) / 100);
  const totalT = afterDisc + mkP;
  const man = afterDisc * (parseFloat(item.manpower_pct) / 100);
  const mkM = man * (parseFloat(item.markupM_pct) / 100);
  const finalPrice = totalT + man + mkM;
  const cost = parseFloat(item.cost || 0);
  const profit = finalPrice - cost;
  const margin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0;
  return { basePrice: base, priceEuro: eur, qty, baseTotal, discountPct: parseFloat(item.discount_pct) || 0, afterDisc, markupP: parseFloat(item.markupP_pct) || 0, mkP, totalT, man, mkM, finalPrice, cost, profit, margin };
}

function formatPct(diff) {
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}

export default function SummaryTesting({ panels, project, id, onItemUpdate, onItemDelete, hideCost, exchangeRate }) {
  const [mode, setMode] = useState('item');
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
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
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
    return items;
  }, [allItems, sourcePanelId, sourceDivId]);

  // Search alternatives
  useEffect(() => {
    if (!dq.trim()) { setSearchRes([]); return; }
    const t = setTimeout(() => {
      api.get('/products', { params: { search: dq, limit: 10 } })
        .then(r => setSearchRes(r.data.products || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [dq]);

  // Load projects for panel comparison
  useEffect(() => {
    if (mode !== 'panel') return;
    api.get('/projects').then(r => setAllProjects(r.data || [])).catch(() => {});
  }, [mode]);

  // Fetch external panels when project changes
  useEffect(() => {
    if (projectA === 'current' || !projectA) { setExternalPanelsA([]); return; }
    api.get(`/projects/${projectA}/crm`)
      .then(r => setExternalPanelsA(r.data.panels || []))
      .catch(() => setExternalPanelsA([]));
  }, [projectA]);

  useEffect(() => {
    if (projectB === 'current' || !projectB) { setExternalPanelsB([]); return; }
    api.get(`/projects/${projectB}/crm`)
      .then(r => setExternalPanelsB(r.data.panels || []))
      .catch(() => setExternalPanelsB([]));
  }, [projectB]);

  // Resolve panels for A and B
  const panelsA = projectA === 'current' ? panels : externalPanelsA;
  const panelsB = projectB === 'current' ? panels : externalPanelsB;

  // Force remount when panel selections change
  useEffect(() => { setCompareKey(k => k + 1); }, [panelA, panelB, projectA, projectB]);

  // Product across project search
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const t = setTimeout(() => {
      api.get('/products', { params: { search: productSearch, limit: 10 } })
        .then(r => setProductResults(r.data.products || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // Find all panel occurrences for selected product
  const productOccurrences = useMemo(() => {
    const sel = alternative || (productResults.length === 1 ? productResults[0] : null);
    if (!sel) return [];
    const ref = sel.reference || sel.name;
    const found = [];
    for (const p of panels) {
      for (const d of p.divisions || []) {
        for (const i of d.items || []) {
          const itemRef = i.is_manual ? (i.custom_name || '') : (i.reference || '');
          if (itemRef.toLowerCase().includes(ref.toLowerCase())) {
            found.push({ ...i, panel_number: p.panel_number, panel_name: p.panel_name, panel_id: p.id, division_id: d.id, division_type: d.division_type });
          }
        }
      }
    }
    return found;
  }, [alternative, productResults, panels]);

  const currentMetrics = useMemo(() => selectedItem ? calcMetrics(selectedItem) : null, [selectedItem]);
  const altMetrics = useMemo(() => {
  if (!alternative) return null;
  const rate = exchangeRate || 1.08;
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
      const rate = exchangeRate || 1.08;
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
        await onItemUpdate(selectedItem.id, form);
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
    const rate = exchangeRate || 1.08;
    let eur = parseFloat(p.price_euro);
    let usd = parseFloat(p.price_usd);
    if (usd && !eur) eur = usd / rate;
    if (eur && !usd) usd = eur * rate;
    return { eur: eur || 0, usd: usd || 0 };
  };

  const ComparisonTable = ({ left, right, leftLabel, rightLabel }) => {
    if (!left || !right) return null;
    const metrics = [
      { label: 'Unit Price', left: left.basePrice, right: right.basePrice, fmt: 'currency', higher: 'worse' },
      { label: 'Cost', left: left.cost, right: right.cost, fmt: 'currency', higher: 'worse' },
      { label: 'Final Price', left: left.finalPrice, right: right.finalPrice, fmt: 'currency', higher: 'better' },
      { label: 'Profit', left: left.profit, right: right.profit, fmt: 'currency', higher: 'better' },
      { label: 'Margin', left: left.margin, right: right.margin, fmt: 'pct', higher: 'better' },
    ];

    return (
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px' }}>Metric</th>
              <th style={{ textAlign: 'right', padding: '8px 10px' }}>{leftLabel || 'Current'}</th>
              <th style={{ textAlign: 'right', padding: '8px 10px' }}>{rightLabel || 'Alternative'}</th>
              <th style={{ textAlign: 'right', padding: '8px 10px' }}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => {
              const diff = right[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'] - left[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'];
              const pctDiff = left[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'] !== 0
                ? (diff / Math.abs(left[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'])) * 100
                : 0;
              const isBetter = m.higher === 'better' ? diff > 0 : diff < 0;
              const isWorse = m.higher === 'better' ? diff < 0 : diff > 0;
              const val = m.label === 'Margin' ? pctDiff : diff;

              return (
                <tr key={m.label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--white)' }}>{m.label}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                    {hideCost ? `$${left[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'].toFixed(2)}` : `$${left[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'].toFixed(2)}`}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                    {hideCost ? `$${right[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'].toFixed(2)}` : `$${right[m.label === 'Unit Price' ? 'basePrice' : m.label.toLowerCase() === 'cost' ? 'cost' : m.label.toLowerCase() === 'final price' ? 'finalPrice' : m.label.toLowerCase() === 'profit' ? 'profit' : 'margin'].toFixed(2)}`}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isBetter ? 'var(--success)' : isWorse ? 'var(--danger)' : 'var(--muted)' }}>
                    {hideCost || m.label === 'Margin' ? formatPct(pctDiff) : `${isBetter ? '+' : isWorse ? '' : ''}$${Math.abs(val).toFixed(2)} (${formatPct(pctDiff)})`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
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
              Select an item from any panel to test a replacement
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
              const rate = exchangeRate || 1.08;
              const a = panelsA.find(p => p.id === parseInt(panelA));
              const b = panelsB.find(p => p.id === parseInt(panelB));
              if (!a || !b) return <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:12 }}>Panel not found</div>;

              const panelTotal = (p) => {
                let total = 0, cost = 0;
                for (const d of p.divisions || []) {
                  for (const i of d.items || []) {
                    const qty = parseInt(i.qty) || 1;
                    const tfp = parseFloat(i.totalfinalProduct);
                    if (tfp && tfp > 0) {
                      total += tfp * qty;
                    } else {
                      let base = parseFloat(i.base_price_usd || 0);
                      const eur = parseFloat(i.base_price_euro || 0);
                      if (!base && eur) base = eur * rate;
                      const baseTotal = base * qty;
                      const disc = baseTotal * (parseFloat(i.discount_pct) / 100);
                      const afterDisc = baseTotal - disc;
                      total += afterDisc
                        + afterDisc * (parseFloat(i.markupP_pct) / 100)
                        + afterDisc * (parseFloat(i.manpower_pct) / 100)
                        + (afterDisc * (parseFloat(i.manpower_pct) / 100)) * (parseFloat(i.markupM_pct) / 100);
                    }
                    cost += parseFloat(i.cost || 0) * qty;
                  }
                }
                return { total, cost };
              };

              const { total: aTotal, cost: aCost } = panelTotal(a);
              const { total: bTotal, cost: bCost } = panelTotal(b);
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

        {/* ── Mode: Product Across Project ── */}
        {mode === 'product' && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', marginBottom: 10 }}>
              Search a product and see where it's used across all panels
            </div>
            <input className="form-input" placeholder="🔍 Search product reference or name..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)} style={{ marginBottom: 12 }} />

            {productSearch.trim() && productResults.length > 0 && (
              <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
                {productResults.slice(0, 5).map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', background: alternative?.id === p.id ? 'var(--accent)' : '',
                    color: alternative?.id === p.id ? '#fff' : 'inherit'
                  }} onClick={() => setAlternative(p)}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: alternative?.id === p.id ? '#ddd' : 'var(--accent)', minWidth: 80 }}>{p.reference}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: alternative?.id === p.id ? '#fff' : 'var(--white)' }}>{p.description || p.name}</span>
                    <span style={{ fontSize: 11, color: alternative?.id === p.id ? '#ddd' : 'var(--success)' }}>${displayPrice(p).usd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {productOccurrences.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Panel</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Division</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Unit Price</th>
                      {!hideCost && <th style={{ textAlign: 'right', padding: '8px 10px' }}>Cost</th>}
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>Final Price</th>
                      {!hideCost && <th style={{ textAlign: 'right', padding: '8px 10px' }}>Profit</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {productOccurrences.map((item, i) => {
                      const m = calcMetrics(item);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>P#{item.panel_number}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--accent)' }}>{item.division_type}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{m.qty}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${m.basePrice.toFixed(2)}</td>
                          {!hideCost && <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${m.cost.toFixed(2)}</td>}
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>${m.finalPrice.toFixed(2)}</td>
                          {!hideCost && (
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: m.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {m.profit >= 0 ? '+' : '-'}${Math.abs(m.profit).toFixed(2)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {productSearch.trim() && productOccurrences.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>
                Product not found in any panel. Try a different search term.
              </div>
            )}
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
