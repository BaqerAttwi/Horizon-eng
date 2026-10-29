import { useRef, useState } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function CheckPrices({ projectId, onUpdated, locked }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const selection = row => ({ id: row.id, expected_usd: row.current_usd, expected_euro: row.current_euro, saved_usd: row.saved_usd, saved_euro: row.saved_euro });
  const check = async () => {
    setBusy(true);
    try { setRows((await api.get(`/projects/${projectId}/check-prices`)).data); }
    catch(e) { toast.error(e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };
  const apply = async row => {
    if (inFlight.current || locked) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/check-prices/${row.id}`, selection(row));
      await onUpdated();
      setRows((await api.get(`/projects/${projectId}/check-prices`)).data);
      toast.success('Project price updated');
    } catch(e) { toast.error(e.response?.data?.error || e.message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const changedRows = (rows || []).filter(row => row.status === 'Changed');
  const applyAll = async () => {
    if (inFlight.current || locked || !changedRows.length) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await api.post(`/projects/${projectId}/check-prices`, { items: changedRows.map(selection) });
      toast.success(`Updated ${result.data.updated} item prices`);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    } finally {
      try {
        await onUpdated();
        setRows((await api.get(`/projects/${projectId}/check-prices`)).data);
      } catch (e) {
        setRows(null);
        toast.error(`Refresh prices: ${e.response?.data?.error || e.message}`);
      }
      inFlight.current = false;
      setBusy(false);
    }
  };
  const money = value => value == null ? '—' : Number(value).toFixed(4);
  return <>
    <button className="btn btn-secondary" disabled={busy} onClick={check}>Check prices {rows?.some(r=>r.status==='Changed') ? '!' : ''}</button>
    {rows && <div className="modal-overlay" onClick={()=>!busy && setRows(null)}><div className="modal modal-lg price-comparison-modal" role="dialog" aria-modal="true" aria-label="Database price comparison" onClick={e=>e.stopPropagation()}>
      <div className="modal-header"><strong>Database price comparison</strong><button aria-label="Close price comparison" className="btn-icon" disabled={busy} onClick={()=>setRows(null)}>✕</button></div>
      <div className="modal-body"><p>Saved project prices stay unchanged until you apply an update. Discounts and markup stay as saved.</p>
        <button className="btn btn-primary" style={{ marginBottom: 12 }} disabled={busy || locked || !changedRows.length} onClick={applyAll}>
          {busy ? 'Working…' : `Update all changed prices (${changedRows.length})`}
        </button>
        <div className="table-wrap"><table className="table"><thead><tr><th>Item / Panel</th><th>Saved USD / EUR</th><th>Database USD / EUR</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {rows.map(row=><tr key={row.id}><td>{row.reference}<br/>{row.panel_name}</td><td>{money(row.saved_usd)} / {money(row.saved_euro)}</td><td>{money(row.current_usd)} / {money(row.current_euro)}</td><td>{row.status==='Changed' && <strong style={{color:'var(--danger)'}}>! </strong>}{row.status}</td><td>{row.status==='Changed' && <button className="btn btn-sm btn-primary" disabled={busy || locked} onClick={()=>apply(row)}>Apply price</button>}</td></tr>)}
        </tbody></table></div>{!rows.length && <p>No project items.</p>}
      </div></div></div>}
  </>;
}
