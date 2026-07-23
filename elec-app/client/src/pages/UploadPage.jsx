import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function UploadPage() {
  const [file, setFile]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [drag, setDrag]       = useState(false);
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls'].includes(ext)) {
      toast.error('❌ Only .xlsx or .xls files are accepted');
      return;
    }
    setFile(f); setResult(null);
  };

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: () => {},
      });
      setResult(r.data);
      toast.success(`✅ Imported ${r.data.inserted} new, ${r.data.updated} updated`);
    } catch(e) {
      toast.error('❌ ' + e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">⬆️ Import Excel</div>
          <div className="page-subtitle">Upload price list (.xlsx) — sheet must be named "PL"</div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="card"
        style={{
          borderStyle: 'dashed',
          borderColor: drag ? 'var(--accent)' : file ? 'var(--success)' : 'var(--border)',
          background: drag ? 'rgba(26,95,168,.06)' : 'var(--panel)',
          padding: 40, textAlign: 'center', cursor: 'pointer', marginBottom: 20,
        }}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
      >
        <div style={{fontSize:48, marginBottom:12}}>{file ? '📗' : '📂'}</div>
        {file ? (
          <>
            <div style={{fontWeight:700,color:'var(--white)',fontSize:15}}>{file.name}</div>
            <div style={{color:'var(--muted)',fontSize:12,marginTop:4}}>{(file.size/1024).toFixed(1)} KB — click to change</div>
          </>
        ) : (
          <>
            <div style={{fontWeight:600,color:'var(--text)'}}>Drag & drop your Excel file here</div>
            <div style={{color:'var(--muted)',fontSize:12,marginTop:4}}>or click to browse — .xlsx, .xls only</div>
          </>
        )}
        <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}}
          onChange={e=>handleFile(e.target.files[0])} />
      </div>

      {/* Info box */}
      <div className="card card-body" style={{marginBottom:20,background:'rgba(26,95,168,.06)',borderColor:'rgba(26,95,168,.2)'}}>
        <div style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--muted)',lineHeight:1.8}}>
          <strong style={{color:'var(--accent)'}}>Expected format:</strong><br/>
          Sheet: <code style={{color:'var(--accent2)'}}>PL</code> &nbsp;|&nbsp;
          Columns: <code>REFERENCE | DESCRIPTION | Euro | USD | Brand | Smart Code</code><br/>
          • <code>#N/A</code> prices → stored as NULL &nbsp;|&nbsp; Blank rows → skipped automatically<br/>
          • <code>price_cost</code> (purchase cost) must be set manually per product after import
        </div>
      </div>

      <button className="btn btn-primary" style={{minWidth:160}} onClick={upload} disabled={!file||loading}>
        {loading ? <><span className="spinner"/>Importing...</> : '🚀 Import Now'}
      </button>

      {/* Result */}
      {result && (
        <div className="card card-body" style={{marginTop:20}}>
          <div style={{fontWeight:700,color:'var(--white)',marginBottom:12}}>📊 Import Result</div>
          <div className="stats-row">
            <div className="stat-card" style={{borderColor:'var(--success)'}}>
              <div className="stat-value" style={{color:'var(--success)'}}>{result.inserted}</div>
              <div className="stat-label">New Products</div>
            </div>
            <div className="stat-card" style={{borderColor:'var(--accent)'}}>
              <div className="stat-value" style={{color:'var(--accent)'}}>{result.updated}</div>
              <div className="stat-label">Updated</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{color:'var(--muted)'}}>{result.skipped}</div>
              <div className="stat-label">Skipped (blank)</div>
            </div>
            <div className="stat-card" style={{borderColor: result.errors?.length ? 'var(--danger)' : 'var(--border)'}}>
              <div className="stat-value" style={{color: result.errors?.length ? 'var(--danger)' : 'var(--muted)'}}>
                {result.errors?.length || 0}
              </div>
              <div className="stat-label">Errors</div>
            </div>
          </div>

          {result.errors?.length > 0 && (
            <div style={{marginTop:12}}>
              <div style={{fontWeight:600,color:'var(--danger)',marginBottom:8}}>⚠ Errors</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Row</th><th>Reference</th><th>Error</th></tr></thead>
                  <tbody>
                    {result.errors.map((e,i)=>(
                      <tr key={i}>
                        <td className="mono">{e.row}</td>
                        <td className="mono">{e.reference}</td>
                        <td style={{color:'var(--danger)'}}>{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
