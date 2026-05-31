import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';

function fmt(val, sym='') {
  if (val === null || val === undefined) return <span style={{color:'var(--muted)'}}>—</span>;
  return `${sym}${Number(val).toFixed(2)}`;
}

function GroupModal({ group, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: group?.name || '',
    is_public: group?.is_public || false,
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const handleCheck = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.checked }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Group name required'); return; }
    setSaving(true);
    try {
      const r = group
        ? await api.patch(`/item-groups/${group.id}`, form)
        : await api.post('/item-groups', form);
      toast.success(group ? '✅ Group updated' : '✅ Group created');
      onSaved(r.data, !!group);
      onClose();
    } catch (e) { toast.error('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{group ? 'Edit' : 'Create'} Item Group</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Group Name *</label>
            <input className="form-input" placeholder="e.g. Standard Panel Kit" value={form.name} onChange={handleChange('name')} />
          </div>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Public</label>
            <input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} checked={form.is_public} onChange={handleCheck('is_public')} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {form.is_public ? 'Visible to all engineers' : 'Only visible to you'}
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving...</> : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddProductModal({ groupId, onClose, onAdded }) {
  const [q, setQ] = useState('');
  const [results, setRes] = useState([]);
  const [customName, setCustomName] = useState('');
  const [description, setDescription] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [priceEur, setPriceEur] = useState('');
  const [qty, setQty] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const dq = useDebounce(q, 300);

  useEffect(() => {
    if (!dq.trim()) { setRes([]); return; }
    api.get('/products', { params: { search: dq, limit: 10 } })
      .then(r => setRes(r.data.products || []))
      .catch(() => {});
  }, [dq]);

  const add = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/item-groups/${groupId}/items`, {
        product_id: selectedProduct?.id || null,
        is_manual: selectedProduct ? false : true,
        custom_name: selectedProduct ? null : (customName || null),
        description: selectedProduct ? null : (description || null),
        price_usd: selectedProduct ? null : (priceUsd || null),
        price_euro: selectedProduct ? null : (priceEur || null),
        qty,
      });
      toast.success('✅ Item added to group');
      onAdded(r.data);
      setSelectedProduct(null);
      setQ('');
      setCustomName('');
      setDescription('');
      setPriceUsd('');
      setPriceEur('');
      setQty(1);
    } catch (e) { toast.error('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Product to Group</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Search Product</label>
            <input className="form-input" placeholder="Search by reference or description..." value={q}
              onChange={e => setQ(e.target.value)} />
            {results.length > 0 && (
              <div style={{marginTop:4,border:'1px solid var(--border)',borderRadius:6,maxHeight:160,overflowY:'auto'}}>
                {results.map(p => (
                  <div key={p.id} style={{padding:'6px 10px',cursor:'pointer',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',background: selectedProduct?.id === p.id ? 'var(--border)' : ''}}
                    onClick={() => { setSelectedProduct(p); setCustomName(''); setQ(''); setRes([]); }}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--accent)'}}>{p.reference}</div>
                      <div style={{fontSize:10,color:'var(--muted)'}}>{p.description}</div>
                    </div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{fmt(p.price_usd,'$')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedProduct ? (
            <div style={{padding:'8px 10px',background:'rgba(26,95,168,0.06)',borderRadius:6,marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--accent)'}}>{selectedProduct.reference}</div>
              <div style={{fontSize:11,color:'var(--muted)'}}>{selectedProduct.description}</div>
              <button className="btn btn-sm btn-secondary" style={{marginTop:4}} onClick={() => setSelectedProduct(null)}>Change</button>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Or custom name (manual)</label>
                <input className="form-input" placeholder="Custom item name..." value={customName}
                  onChange={e => setCustomName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} placeholder="Item description..." value={description}
                  onChange={e => setDescription(e.target.value)} />
              </div>
              <div style={{display:'flex',gap:8}}>
                <div className="form-group" style={{flex:1}}>
                  <label className="form-label">Price USD ($)</label>
                  <input type="number" step="0.01" min="0" className="form-input" placeholder="0.00" value={priceUsd}
                    onChange={e => setPriceUsd(e.target.value)} />
                </div>
                <div className="form-group" style={{flex:1}}>
                  <label className="form-label">Price EUR (€)</label>
                  <input type="number" step="0.01" min="0" className="form-input" placeholder="0.00" value={priceEur}
                    onChange={e => setPriceEur(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="form-group" style={{maxWidth:100}}>
            <label className="form-label">Qty</label>
            <input type="number" min={1} className="form-input" value={qty}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={add} disabled={saving || (!selectedProduct && !customName)}>
            {saving ? <><span className="spinner" /> Adding...</> : '+ Add to Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupCard({ group, onEdit, onDelete, onAddItem, onRemoveItem }) {
  const { isRole } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const isOwner = isRole('owner');

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const r = await api.get(`/item-groups/${group.id}/items`);
      setItems(r.data);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingItems(false); }
  }, [group.id]);

  useEffect(() => {
    if (expanded) loadItems();
  }, [expanded, loadItems]);

  const removeItem = async (itemId) => {
    if (!confirm('Remove this item from group?')) return;
    try {
      await api.delete(`/item-groups/${group.id}/items/${itemId}`);
      setItems(p => p.filter(i => i.id !== itemId));
      toast.success('Item removed');
    } catch (e) { toast.error(e.message); }
  };

  const canEdit = isOwner || group.created_by === group.workerId;

  return (
    <div className="card" style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',cursor:'pointer'}}
        onClick={() => setExpanded(!expanded)}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:16,transition:'transform .2s',transform: expanded ? 'rotate(90deg)' : ''}}>▶</span>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:'var(--white)'}}>{group.name}</div>
            <div style={{fontSize:11,color:'var(--muted)',display:'flex',gap:8,alignItems:'center'}}>
              <span>by {group.created_by_name}</span>
              {group.is_public ? (
                <span className="badge badge-green" style={{fontSize:9}}>Public</span>
              ) : (
                <span className="badge badge-gray" style={{fontSize:9}}>Private</span>
              )}
              <span>{group.item_count} items</span>
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:4}} onClick={e => e.stopPropagation()}>
          <button className="btn-icon" title="Add item" onClick={() => setShowAdd(true)}>➕</button>
          <button className="btn-icon" title="Edit" onClick={() => onEdit(group)}>✏️</button>
          <button className="btn-icon" title="Delete" style={{color:'var(--danger)'}} onClick={() => onDelete(group.id)}>🗑</button>
        </div>
      </div>

      {expanded && (
        <div style={{borderTop:'1px solid var(--border)'}}>
          {loadingItems ? (
            <div style={{padding:16,textAlign:'center'}}><span className="spinner" /></div>
          ) : items.length === 0 ? (
            <div style={{padding:16,textAlign:'center',color:'var(--muted)',fontSize:12}}>No items in this group.</div>
          ) : (
            <div className="table-wrap">
              <table style={{fontSize:12}}>
                <thead>
                  <tr>
                    <th>Product</th><th>Reference</th><th>Qty</th><th>Brand</th><th>Price</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td style={{fontWeight:600,color:'var(--accent)'}}>{item.custom_name || item.reference || '—'}</td>
                      <td className="mono">{item.reference || '—'}</td>
                      <td className="mono">x{item.qty}</td>
                      <td style={{fontSize:11}}>{item.brand_name || '—'}</td>
                      <td className="mono">{fmt(item.price_usd,'$')}</td>
                      <td>
                        <button className="btn-icon" style={{color:'var(--danger)',fontSize:11}} onClick={() => removeItem(item.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAdd && <AddProductModal groupId={group.id} onClose={() => setShowAdd(false)}
        onAdded={item => { setItems(p => [...p, item]); setShowAdd(false); }} />}
    </div>
  );
}

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const { worker, isRole } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/item-groups');
      setGroups(r.data);
    } catch (e) { toast.error('❌ ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSaved = (group, isUpdate) => {
    if (isUpdate) setGroups(p => p.map(g => g.id === group.id ? group : g));
    else setGroups(p => [...p, group]);
  };

  const del = async (id) => {
    if (!confirm('Delete this group and all its items?')) return;
    try {
      await api.delete(`/item-groups/${id}`);
      setGroups(p => p.filter(g => g.id !== id));
      toast.success('🗑 Group deleted');
    } catch (e) { toast.error('❌ ' + e.message); }
  };

  return (
    <div className="page">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.25}}>
        <div className="page-header">
          <div>
            <div className="page-title">📋 Item Groups</div>
            <div className="page-subtitle">{groups.length} groups — reusable product sets for quick CRM add</div>
          </div>
          <button className="btn btn-primary" onClick={() => setModal({})}>+ New Group</button>
        </div>

        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:40}}><span className="spinner" /></div>
        ) : groups.length === 0 ? (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">📭</div>
              <p>No groups yet. Create reusable product sets for fast CRM importing.</p>
            </div>
          </div>
        ) : (
          groups.map(g => (
            <GroupCard key={g.id} group={g} onEdit={(grp) => setModal(grp)} onDelete={del}
              onAddItem={() => {}} onRemoveItem={() => {}} />
          ))
        )}
      </motion.div>

      {modal !== null && (
        <GroupModal group={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
