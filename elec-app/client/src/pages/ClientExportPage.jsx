import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const today = () => new Date().toISOString().slice(0, 10);
const expiry = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); };

const defaults = {
  format: 'quotation', quoteNumber: '', quoteDate: today(), expiryDate: expiry(), projectName: '', buyerName: '', buyerAddress: '', buyerPhone: '', buyerContact: '', buyerEmail: '', buyerVat: '',
  paymentTerms: '', validity: '2 weeks', deliveryTime: 'TBD', currency: '$', currencyName: 'USD', incoterm: 'Ex-work our workshop in Beirut', incotermCode: 'EXW Beirut - Workshop',
  additionalInfo: 'Our offer is valid for 2 weeks.\nDelivery Time: TBD\nAttachment: Technical Offer\nOur offer is considered Ex-work our workshop in Beirut',
  bankAccount: '3254067424002', bankIban: 'LB93003900000003254067424002', bankName: 'BYBLOS BANK', bankBranch: 'Ghobeiry Branch',
  bankAddress: 'Ghobeiry Old Airport Highway - Jawharat El Kasr BLDG - Ground Floor', bankCountry: 'Lebanon', bankSwift: 'BYBALBBX',
  signatoryCompany: 'Horizon Power Solutions', signatoryName: 'Khodor Sharaf', signatureText: 'Signature', vatPctOverride: '', vatAmountOverride: '', totalOverride: '',
  footerLine1: 'www.horizonpowerlb.com', footerLine2: 'Verdun - Miraj Center - GF, Beirut, Lebanon', footerLine3: 'Tel: +961 1 741030 | Email: info@horizonpowerlb.com',
  documentCode: 'HPS-COM-PR02-L02', edition: '1',
};

function Field({ label, name, form, setForm, type = 'text', wide = false }) {
  return <div className="form-group" style={wide ? { gridColumn: '1 / -1' } : undefined}><label className="form-label">{label}</label>
    {type === 'textarea' ? <textarea className="form-textarea" rows={4} value={form[name]} onChange={e => setForm(v => ({ ...v, [name]: e.target.value }))} />
      : <input className="form-input" type={type} value={form[name]} onChange={e => setForm(v => ({ ...v, [name]: e.target.value }))} />}
  </div>;
}

export default function ClientExportPage() {
  const { isRole } = useAuth();
  const isEngineer = isRole('engineer');
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [form, setForm] = useState(defaults);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get(`/projects/${id}/crm`).then(({ data }) => {
      setProject(data);
      setForm(v => ({ ...v, format: isEngineer ? 'technical' : v.format, quoteNumber: data.quote_number || v.quoteNumber, projectName: data.project_name || '', buyerName: data.client_name || '', paymentTerms: data.payment_terms || '', vatPctOverride: String(Number(data.vat_pct) || 0) }));
    }).catch(e => toast.error(e.message));
  }, [id]);

  const totals = useMemo(() => {
    if (!project) return { subtotal: 0, vat: 0, total: 0 };
    const gross = (project.panels || []).reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);
    const subtotal = gross * (1 - (Number(project.project_discount_pct) || 0) / 100);
    const vat = form.vatAmountOverride !== '' ? Number(form.vatAmountOverride) || 0 : subtotal * (Number(form.vatPctOverride) || 0) / 100;
    return { subtotal, vat, total: form.totalOverride !== '' ? Number(form.totalOverride) || 0 : subtotal + vat };
  }, [project, form.vatPctOverride, form.vatAmountOverride, form.totalOverride]);

  const exportPdf = async () => {
    if (!form.quoteNumber.trim()) return toast.error('Quotation number is required');
    setExporting(true);
    try { const { exportProjectPdf } = await import('../utils/pdfExport'); await exportProjectPdf(id, form.format, form); toast.success('PDF exported'); }
    catch (e) { toast.error(`PDF export failed: ${e.message}`); }
    finally { setExporting(false); }
  };

  if (!project) return <div className="page"><div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /> Loading export editor...</div></div>;
  const panels = (project.panels || []).filter(p => p.panel_name || Number(p.total_price));
  const input = (label, name, type = 'text', wide = false) => <Field key={name} label={label} name={name} form={form} setForm={setForm} type={type} wide={wide} />;

  return <div className="page">
    <div className="page-header"><div><button className="btn btn-sm btn-secondary" onClick={() => navigate('/projects')}>← Projects</button><div className="page-title" style={{ marginTop: 8 }}>Client Export Editor</div><div className="page-subtitle">Edit details and see the document update live.</div></div><button className="btn btn-primary" disabled={exporting} onClick={exportPdf}>{exporting ? 'Exporting...' : `Export ${form.format === 'quotation' ? 'Quotation' : 'Technical Quotation'}`}</button></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(330px, 430px) minmax(620px, 1fr)', gap: 18, alignItems: 'start' }}>
      <div className="card"><div className="card-body"><div className="form-grid">
        <div className="form-group"><label className="form-label">Document Type</label><select className="form-input" value={form.format} onChange={e => setForm(v => ({ ...v, format: e.target.value }))}>{!isEngineer && <option value="quotation">Quotation</option>}<option value="technical">Technical Quotation</option></select></div>
        {input('Quotation Number *', 'quoteNumber')}
        {form.format === 'technical' ? <>{input('Document Code', 'documentCode')}{input('Edition', 'edition')}</> : <>
          {input('Quotation Date', 'quoteDate', 'date')}{input('Expiry Date', 'expiryDate', 'date')}{input('Project', 'projectName')}{input('Buyer Name', 'buyerName')}{input('Buyer Address', 'buyerAddress')}{input('Buyer Phone', 'buyerPhone')}{input('Contact Person', 'buyerContact')}{input('Buyer Email', 'buyerEmail', 'email')}{input('Buyer VAT #', 'buyerVat')}{input('Payment Terms', 'paymentTerms', 'textarea', true)}
          {input('Validity', 'validity')}{input('Delivery Time', 'deliveryTime')}{input('Currency Symbol', 'currency')}{input('Currency Name', 'currencyName')}{input('Incoterm Description', 'incoterm')}{input('Incoterms 2020', 'incotermCode')}
          {input('Additional Info', 'additionalInfo', 'textarea', true)}
          {input('VAT %', 'vatPctOverride', 'number')}{input('VAT Amount Override', 'vatAmountOverride', 'number')}{input('Total Override', 'totalOverride', 'number')}
          {input('Bank Account', 'bankAccount')}{input('IBAN', 'bankIban')}{input('Bank Name', 'bankName')}{input('Bank Branch', 'bankBranch')}{input('Bank Address', 'bankAddress', 'textarea', true)}{input('Bank Country', 'bankCountry')}{input('Swift Code', 'bankSwift')}
          {input('Signatory Company', 'signatoryCompany')}{input('Authorized Signatory', 'signatoryName')}{input('Signature Label', 'signatureText')}
          {input('Footer Line 1', 'footerLine1', 'text', true)}{input('Footer Line 2', 'footerLine2', 'text', true)}{input('Footer Line 3', 'footerLine3', 'text', true)}
        </>}
      </div><button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} disabled={exporting} onClick={exportPdf}>{exporting ? 'Exporting...' : 'Export PDF'}</button></div></div>
      <div style={{ position: 'sticky', top: 12, overflow: 'auto', maxHeight: 'calc(100vh - 30px)' }}>
        {form.format === 'quotation' ? <QuotationPreview project={project} panels={panels} form={form} totals={totals} /> : <TechnicalPreview panels={panels} form={form} />}
      </div>
    </div>
  </div>;
}

const cell = { border: '1px solid #222', padding: '5px 7px' };
function QuotationPreview({ panels, form, totals }) {
  return <div style={{ width: 794, minHeight: 1123, background: '#fff', color: '#111', padding: 28, margin: '0 auto', fontFamily: 'Arial, sans-serif', fontSize: 11, boxShadow: '0 5px 25px rgba(0,0,0,.35)' }}>
    <h1 style={{ textAlign: 'center', fontSize: 25, margin: '0 0 10px' }}>QUOTATION</h1>
    <div style={{ display: 'grid', gridTemplateColumns: '58% 42%', border: '1px solid #222' }}><div style={{ padding: 10, minHeight: 110 }}><b style={{ fontSize: 14 }}>Horizon Power Solution</b><div>Verdun - Miraj Center - GF<br/>Beirut, Lebanon<br/>+961 1 741030<br/>MOF #: 3890959</div></div><div style={{ borderLeft: '1px solid #222', padding: 10, lineHeight: 2 }}><b>Quote #:</b> {form.quoteNumber}<br/><b>Date:</b> {form.quoteDate}<br/><b>Project:</b> {form.projectName}<br/><b>Expiry:</b> {form.expiryDate}</div></div>
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}><thead><tr style={{ background: '#0089b4', color: '#fff' }}><th style={cell} colSpan="2">BUYER</th><th style={cell} colSpan="2">PAYMENT TERMS</th></tr></thead><tbody>{[['Name',form.buyerName,'Payment',form.paymentTerms],['Address',form.buyerAddress,'Validity',form.validity],['Phone',form.buyerPhone,'Delivery',form.deliveryTime],['Contact',form.buyerContact,'Currency',form.currencyName],['Email',form.buyerEmail,'Incoterms',form.incoterm],['VAT #',form.buyerVat,'','']].map((r,i)=><tr key={i}>{r.map((v,j)=><td style={{...cell,fontWeight:j%2===0?'bold':'normal'}} key={j}>{v}</td>)}</tr>)}</tbody></table>
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}><thead><tr style={{ background: '#0089b4', color: '#fff' }}>{['S/N','Description','Unit Quantity','Unit Type','Price','Amount'].map(h=><th style={cell} key={h}>{h}</th>)}</tr></thead><tbody>{panels.map((p,i)=>{const qty=Math.max(1,Number(p.quantity)||1);const amount=Number(p.total_price)||0;return <tr key={p.id}><td style={cell}>{i+1}</td><td style={cell}>Panel #{p.panel_number} - {p.panel_name}</td><td style={{...cell,textAlign:'center'}}>{qty}</td><td style={cell}>Nos.</td><td style={{...cell,textAlign:'right'}}>{form.currency}{(amount/qty).toFixed(2)}</td><td style={{...cell,textAlign:'right'}}>{form.currency}{amount.toFixed(2)}</td></tr>;})}</tbody></table>
    <div style={{ marginLeft: '58%', marginTop: 8, lineHeight: 1.8 }}><div>Consignment Total <b style={{float:'right'}}>{form.currency}{totals.subtotal.toFixed(2)}</b></div><div>VAT ({form.vatPctOverride || 0}%) <b style={{float:'right'}}>{form.currency}{totals.vat.toFixed(2)}</b></div><div style={{borderTop:'1px solid #222',fontSize:14}}>TOTAL <b style={{float:'right'}}>{form.currency}{totals.total.toFixed(2)}</b></div></div>
    <div style={{ marginTop: 14 }}><b>Additional Info</b><div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{form.additionalInfo}</div></div>
    <div style={{ display:'grid',gridTemplateColumns:'58% 42%',gap:18,marginTop:18 }}><div><b>Banking Details</b><div style={{whiteSpace:'pre-line',lineHeight:1.5}}>{form.signatoryCompany}{'\n'}A/C No: {form.bankAccount}{'\n'}IBAN: {form.bankIban}{'\n'}Bank Name: {form.bankName}{'\n'}Branch: {form.bankBranch}{'\n'}{form.bankAddress}{'\n'}Country: {form.bankCountry}{'\n'}Swift Code: {form.bankSwift}</div></div><div><b>Incoterms® 2020</b><div>{form.incotermCode}</div><b>Currency</b><div>{form.currencyName}</div><br/><b>Signatory</b><div>Company: {form.signatoryCompany}<br/>Name: {form.signatoryName}</div><div style={{borderBottom:'1px solid #222',height:45,paddingTop:8}}>{form.signatureText}</div></div></div>
    <div style={{ borderTop:'1px solid #222',textAlign:'center',lineHeight:1.5,marginTop:24,paddingTop:5,fontSize:9 }}>{form.footerLine1}<br/>{form.footerLine2}<br/>{form.footerLine3}</div>
  </div>;
}

function TechnicalPreview({ panels, form }) {
  const items = panels.flatMap(p => (p.divisions || []).flatMap(d => (d.items || []).filter(i => i.visible_in_client_pdf !== 0).map(i => ({ p, d, i }))));
  return <div style={{ width: 816, minHeight: 1056, background:'#fff',color:'#111',padding:26,margin:'0 auto',fontFamily:'Arial',fontSize:10,boxShadow:'0 5px 25px rgba(0,0,0,.35)' }}><div style={{display:'grid',gridTemplateColumns:'22% 56% 22%',border:'1px solid #222',textAlign:'center',alignItems:'center'}}><b>HORIZON</b><div style={{borderLeft:'1px solid #222',borderRight:'1px solid #222',padding:8}}><b>HORIZON POWER SOLUTION</b><div style={{fontSize:20,fontWeight:800}}>TECHNICAL OFFER</div></div><div>{form.documentCode}<br/>Edition {form.edition}<br/>Quote # {form.quoteNumber}</div></div><table style={{width:'100%',borderCollapse:'collapse',marginTop:8}}><thead><tr style={{background:'#0089b4',color:'#fff'}}>{['#','Panel name','Division','Part number','Description','QTY'].map(h=><th style={cell} key={h}>{h}</th>)}</tr></thead><tbody>{items.map(({p,d,i},index)=><tr key={i.id}><td style={cell}>{index+1}</td><td style={cell}>{p.panel_name}</td><td style={cell}>{d.division_type}</td><td style={cell}>{i.is_manual?i.custom_name:i.reference}</td><td style={cell}>{i.custom_desc||i.product_desc||i.description}</td><td style={cell}>{i.qty}</td></tr>)}</tbody></table></div>;
}
