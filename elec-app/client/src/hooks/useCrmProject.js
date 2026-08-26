import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { calcItemFinal, calcItemCurrentPrice, recalcPanelTotal } from '../utils/crmPricing';

export default function useCrmProject() {
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
  const [activeTab, setActiveTab] = useState('items');
  const [editView, setEditView] = useState(false);
  const [divisionTypes,setDivisionTypes]=useState([]);

  const hideCost = isRole('engineer');
  const showCr = isRole('owner', 'head_engineer');
  const exchangeRate = project?.exchange_rate_eur_usd ?? 1.18;

  const load = useCallback(async () => {
    try {
      const [crmRes, exRes, divisionTypeRes] = await Promise.all([
        api.get(`/projects/${id}/crm`),
        api.get(`/projects/${id}/execution`),
        api.get('/division-types')
      ]);
      setProject(crmRes.data);
      setPanels(crmRes.data.panels || []);

      setPendingPriceChanges({});

      setExecutionData(exRes.data);
      setDivisionTypes(divisionTypeRes.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openBrandPreview = useCallback((brand) => {
    const discPct = parseFloat(brandDiscountEdits[brand]);
    if (isNaN(discPct)) { toast.error('Enter a valid discount percentage'); return; }
    setPreviewBrand(brand);
    setPreviewDiscPct(discPct);
    setShowBrandPreview(true);
  }, [brandDiscountEdits]);

  const handleConfirmBrandDiscount = useCallback(async () => {
    setApplyingBrandDisc(true);
    try {
      await api.post(`/projects/${id}/items/apply-brand-discount`, { brand: previewBrand, discount_pct: previewDiscPct });
      toast.success(`✅ ${previewDiscPct}% discount applied to ${previewBrand}`);
      setShowBrandPreview(false);
      setBrandDiscountEdits(prev => ({ ...prev, [previewBrand]: undefined }));
      setPanels(p => p.map(panel => {
        const matchBrand = (item) => {
          const brand = item.is_manual ? (item.custom_brand || 'Unbranded') : (item.brand_name || 'Unbranded');
          return brand === previewBrand;
        };
        const hasMatch = (panel.divisions || []).some(d =>
          (d.items || []).some(matchBrand) || (d.group_instances || []).some(gi => (gi.items || []).some(matchBrand))
        );
        if (!hasMatch) return panel;
        return recalcPanelTotal({
          ...panel,
          divisions: (panel.divisions || []).map(d => ({
            ...d,
            items: (d.items || []).map(i => matchBrand(i) ? { ...i, discount_pct: previewDiscPct } : i),
            group_instances: (d.group_instances || []).map(gi => ({
              ...gi,
              items: (gi.items || []).map(i => matchBrand(i) ? { ...i, discount_pct: previewDiscPct } : i)
            }))
          }))
        });
      }));
    } catch (e) { toast.error(e.message); }
    finally { setApplyingBrandDisc(false); }
  }, [id, previewBrand, previewDiscPct]);

  const addPanel = useCallback(async (panel_number) => {
    try {
      const r = await api.post(`/projects/${id}/panels`, { panel_number, markupP: 0, markupM: 0, manpower_pct: 0 });
      setPanels(p => [...p, recalcPanelTotal(r.data)]);
      toast.success(`Panel #${panel_number} added`);
      setShowAddPanel(false);
    } catch (e) { toast.error(e.message); }
  }, [id]);

  const openCopyPanel = useCallback(async () => {
    setShowCopyPanel(true);
    setCopyStep('projects');
    setSelectedSourceProject(null);
    setSelectedSourcePanel(null);
    try {
      const r = await api.get('/projects');
      setSourceProjects(r.data);
    } catch (e) { toast.error(e.message); }
  }, []);

  const copyPanel = useCallback(async () => {
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
  }, [id, selectedSourceProject, selectedSourcePanel, load]);

  const updatePanel = useCallback(async (panelId, form) => {
    try {
      await api.patch(`/projects/${id}/panels/${panelId}`, form);
      // Reload nested divisions/items because panel markup cascades on the server.
      // Merging only the returned panel row left the first/overridden item stale.
      await load();
    } catch (e) { toast.error(e.message); }
  }, [id, load]);

  const deletePanel = useCallback(async (panelId) => {
    if (!confirm('Delete this panel and all its items?')) return;
    try {
      await api.delete(`/projects/${id}/panels/${panelId}`);
      setPanels(p => p.filter(x => x.id !== panelId));
      toast.success('Panel deleted');
    } catch (e) { toast.error(e.message); }
  }, [id]);

  const togglePanelComplete = useCallback(async (panelId) => {
    try {
      const panel = panels.find(p => p.id === panelId);
      const r = await api.patch(`/projects/${id}/panels/${panelId}/complete`);
      setPanels(p => p.map(x => x.id === panelId ? r.data : x));
      toast.success(r.data.is_completed ? 'Panel marked complete ✓' : 'Panel marked incomplete');
    } catch (e) { toast.error(e.message); }
  }, [id, panels]);

  const addDivision = useCallback(async (panelId, divData) => {
    try {
      const r = await api.post(`/projects/${id}/panels/${panelId}/divisions`, divData);
      setPanels(p => p.map(x => x.id === panelId ? recalcPanelTotal({ ...x, divisions: [...(x.divisions || []), r.data] }) : x));
      toast.success(`${divData.division_type} division added`);
    } catch (e) { toast.error(e.message); }
  }, [id]);

  const deleteDivision = useCallback(async (divisionId) => {
    if (!confirm('Delete this division and all items?')) return;
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.id === divisionId);
      await api.delete(`/projects/${id}/panels/${div.panel_id}/divisions/${divisionId}`);
      setPanels(p => p.map(panel =>
        panel.divisions?.some(d => d.id === divisionId)
          ? recalcPanelTotal({ ...panel, divisions: (panel.divisions || []).filter(d => d.id !== divisionId) })
          : panel
      ));
      toast.success('Division deleted');
    } catch (e) { toast.error(e.message); }
  }, [id, panels]);

  const addItem = useCallback(async (divisionId, itemData) => {
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.id === divisionId);
      const r = await api.post(`/projects/${id}/panels/${div.panel_id}/divisions/${divisionId}/items`, { ...itemData, project_id: parseInt(id) });
      setPanels(p => p.map(panel =>
        panel.divisions?.some(d => d.id === divisionId)
          ? recalcPanelTotal({ ...panel, divisions: (panel.divisions || []).map(d => d.id === divisionId ? { ...d, items: [...(d.items || []), r.data] } : d) })
          : panel
      ));
      toast.success('Product added');
    } catch (e) { toast.error(e.message); }
  }, [id, panels]);

  const updateItem = useCallback(async (itemId, form) => {
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.items?.some(i => i.id === itemId));
      if (!div) { toast.error('Item not found — page may be stale'); return; }
      const panel = panels.find(p => p.divisions?.some(d => d.id === div.id));
      if (!panel) { toast.error('Panel not found — page may be stale'); return; }
      const r = await api.patch(`/projects/${id}/panels/${panel.id}/divisions/${div.id}/items/${itemId}`, form);
      setPanels(p => p.map(panel2 =>
        panel2.divisions?.some(d => d.items?.some(i2 => i2.id === itemId))
          ? recalcPanelTotal({
              ...panel2,
              divisions: (panel2.divisions || []).map(d => ({
                ...d,
                items: (d.items || []).map(i => i.id === itemId ? { ...i, ...r.data } : i)
              }))
            })
          : panel2
      ));
      if (r.data && r.data.message && r.data.message.includes('request')) {
        toast.success('⏳ Price change request sent — waiting for admin approval');
      } else {
        toast.success('Item updated');
      }
    } catch (e) { toast.error(e.message); }
  }, [id, panels]);

  const deleteItem = useCallback(async (itemId) => {
    if (!confirm('Remove this item?')) return;
    try {
      const div = panels.flatMap(p => p.divisions || []).find(d => d.items?.some(i => i.id === itemId));
      if (!div) { toast.error('Item not found — page may be stale'); return; }
      const panel = panels.find(p => p.id === div.panel_id);
      await api.delete(`/projects/${id}/panels/${panel.id}/divisions/${div.id}/items/${itemId}`);
      setPanels(p => p.map(panel2 =>
        panel2.divisions?.some(d => d.items?.some(i2 => i2.id === itemId))
          ? recalcPanelTotal({
              ...panel2,
              divisions: (panel2.divisions || []).map(d => ({
                ...d,
                items: (d.items || []).filter(i => i.id !== itemId)
              }))
            })
          : panel2
      ));
      toast.success('Item removed');
    } catch (e) { toast.error(e.message); }
  }, [id, panels]);

  const toggleExecutionPanel = useCallback(async (panelId, is_completed, description) => {
    try {
      const r = await api.patch(`/projects/${id}/execution/panels/${panelId}`, { is_completed: is_completed ? 1 : 0, description });
      const { cascadedItems, ...panelResult } = r.data;
      setExecutionData(prev => {
        const itemCompletion = { ...prev.itemCompletion };
        for (const item of cascadedItems || []) itemCompletion[item.item_id] = item;
        return {
          ...prev,
          panelCompletion: { ...prev.panelCompletion, [panelId]: panelResult },
          itemCompletion,
        };
      });
    } catch (e) { toast.error(e.message); }
  }, [id]);

  const toggleExecutionItem = useCallback(async (itemId, is_completed, qty_done, execution_notes) => {
    try {
      const body = {};
      if (is_completed !== null) body.is_completed = is_completed ? 1 : 0;
      if (qty_done !== undefined) body.qty_done = qty_done;
      if (execution_notes !== undefined) body.execution_notes = execution_notes;
      const r = await api.patch(`/projects/${id}/execution/items/${itemId}`, body);
      setExecutionData(prev => ({
        ...prev,
        itemCompletion: { ...prev.itemCompletion, [itemId]: r.data }
      }));
    } catch (e) { toast.error(e.message); }
  }, [id]);

  const handleGroupInstanceQtyChange = useCallback(async (instanceId, newQty) => {
    try {
      await api.patch(`/group-instances/${instanceId}`, { quantity: newQty });
      setPanels(p => p.map(panel => ({
        ...panel,
        divisions: (panel.divisions || []).map(d => ({
          ...d,
          group_instances: (d.group_instances || []).map(gi =>
            gi.id === instanceId ? { ...gi, quantity: newQty } : gi
          )
        }))
      })));
      toast.success('Quantity updated');
    } catch (e) { toast.error(e.message); }
  }, []);

  const handleGroupInstanceDescriptionChange = useCallback(async (instanceId, description) => {
    try {
      await api.patch(`/group-instances/${instanceId}`, { description });
      setPanels(p => p.map(panel => ({ ...panel, divisions: (panel.divisions || []).map(d => ({
        ...d, group_instances: (d.group_instances || []).map(gi => gi.id === instanceId ? { ...gi, description } : gi)
      })) })));
      toast.success('Group description updated');
    } catch (e) { toast.error(e.message); }
  }, []);

  const handleGroupInstanceRemove = useCallback(async (instanceId) => {
    if (!confirm('Remove this group instance and all its items?')) return;
    try {
      await api.delete(`/group-instances/${instanceId}`);
      setPanels(p => p.map(panel =>
        panel.divisions?.some(d => d.group_instances?.some(gi => gi.id === instanceId))
          ? recalcPanelTotal({
              ...panel,
              divisions: (panel.divisions || []).map(d => ({
                ...d,
                items: (d.items || []).filter(item => String(item.source_group_instance_id) !== String(instanceId)),
                group_instances: (d.group_instances || []).filter(gi => gi.id !== instanceId)
              }))
            })
          : panel
      ));
      toast.success('Group instance removed');
    } catch (e) { toast.error(e.message); }
  }, []);

  const handleReadyForReview = useCallback(async () => {
    try {
      await api.patch(`/projects/${id}/ready-for-review`);
      toast.success('✅ Project marked ready for review — admin notified');
    } catch (e) { toast.error(e.message); }
  }, [id]);

  const toggleSelectItem = useCallback((itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }, []);

  const selectAllForDivision = useCallback((divisionId, selectAll) => {
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
  }, [panels]);

  const handleBulkEdit = useCallback(async (changes) => {
    const item_ids = Array.from(selectedItems);
    if (!item_ids.length) return;
    try {
      const r = await api.post(`/projects/${id}/items/bulk-update`, { item_ids, changes });
      toast.success(`✅ Updated ${r.data.updated} items`);
      setSelectedItems(new Set());
      setShowBulkEdit(false);
      setPanels(p => p.map(panel =>
        panel.divisions?.some(d => d.items?.some(i => item_ids.includes(i.id)))
          ? recalcPanelTotal({
              ...panel,
              divisions: (panel.divisions || []).map(d => ({
                ...d,
                items: (d.items || []).map(i => item_ids.includes(i.id) ? { ...i, ...changes } : i),
                group_instances: (d.group_instances || []).map(gi => ({
                  ...gi,
                  items: (gi.items || []).map(i => item_ids.includes(i.id) ? { ...i, ...changes } : i)
                }))
              }))
            })
          : panel
      ));
    } catch (e) { toast.error(e.message); }
  }, [id, selectedItems]);

  const clearSelection = useCallback(() => setSelectedItems(new Set()), []);

  const executionStats = useMemo(() => {
    if (activeTab !== 'execution') return { totalQty: 0, doneQty: 0 };
    const totalQty = panels.reduce((s, p) => s + (p.divisions || []).reduce((s2, d) => s2 + (d.items || []).reduce((s3, i) => s3 + (parseInt(i.qty) || 1), 0), 0), 0);
    const doneQty = panels.reduce((s, p) => s + (p.divisions || []).reduce((s2, d) => s2 + (d.items || []).reduce((s3, i) => {
      const ic = executionData.itemCompletion?.[i.id];
      if (ic?.qty_done !== undefined) return s3 + parseInt(ic.qty_done);
      return s3 + (ic?.is_completed ? (parseInt(i.qty) || 1) : 0);
    }, 0), 0), 0);
    return { totalQty, doneQty };
  }, [panels, executionData.itemCompletion, activeTab]);

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

  const brandData = useMemo(() => {
    if (activeTab !== 'brands') return [];
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
          const cost = (parseFloat(item.cost || 0)) * qty;
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
  }, [panels, activeTab]);

  const brandPreview = useMemo(() => {
    if (activeTab !== 'brands') return {};
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
  }, [panels, brandDiscountEdits, activeTab]);

  const reportItems = useMemo(() => {
    if (activeTab !== 'report') return [];
    const flat = [];
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          const ref = item.is_manual
            ? (item.custom_name || 'Manual')
            : (item.reference || 'Unknown');
          flat.push({ panel_number: panel.panel_number, reference: ref, qty: (item.qty ?? 1) * (Number(panel.quantity) || 1) });
        }
      }
    }
    return flat.sort((a, b) => a.panel_number - b.panel_number);
  }, [panels, activeTab]);

  const reportSummary = useMemo(() => {
    if (activeTab !== 'report') return [];
    const map = {};
    for (const item of reportItems) {
      if (!map[item.reference]) map[item.reference] = { reference: item.reference, total_qty: 0 };
      map[item.reference].total_qty += item.qty;
    }
    return Object.values(map).sort((a, b) => b.total_qty - a.total_qty);
  }, [reportItems, activeTab]);

  const projectTotal = panels.reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);
  const baseTotal = parseFloat(project?.total_price) || projectTotal;
  const discPct = parseFloat(project?.project_discount_pct) || 0;
  const discAmt = baseTotal * (discPct / 100);
  const netAfterDisc = baseTotal - discAmt;
  const vatPct = parseFloat(project?.vat_pct) || 0;
  const vatAmt = netAfterDisc * (vatPct / 100);
  const projectTotalWithVat = netAfterDisc + vatAmt;

  return {
    project, setProject, panels, loading, setLoading,divisionTypes,
    pendingPriceChanges,
    showAddPanel, setShowAddPanel,
    showCopyPanel, setShowCopyPanel, copyStep, setCopyStep,
    sourceProjects, setSourceProjects,
    selectedSourceProject, setSelectedSourceProject,
    selectedSourcePanel, setSelectedSourcePanel,
    copying, setCopying,
    executionData, setExecutionData,
    selectedItems, setSelectedItems,
    showBulkEdit, setShowBulkEdit,
    brandDiscountEdits, setBrandDiscountEdits,
    showBrandPreview, setShowBrandPreview,
    previewBrand, setPreviewBrand,
    previewDiscPct, setPreviewDiscPct,
    applyingBrandDisc, setApplyingBrandDisc,
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
  };
}
