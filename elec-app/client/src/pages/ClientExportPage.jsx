import { commercialTitle, isInvoiceStage, drawCommercialDocument } from '../utils/commercialDocument';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const today = () => new Date().toISOString().slice(0, 10);
const expiry = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); };

const defaults = {
  format: 'quotation', quoteNumber: '', quoteDate: today(), expiryDate: expiry(), deliveryDate: '', projectName: '', buyerName: '', buyerAddress: '', buyerPhone: '', buyerContact: '', buyerEmail: '', buyerVat: '',
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
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setLoadError('');
    api.get(`/projects/${id}/crm`).then(({ data }) => {
      if (cancelled) return;
      setProject(data);
      setForm(v => ({ ...v, format: isEngineer ? 'technical' : v.format, additionalInfo: isInvoiceStage(data) ? defaults.additionalInfo.replace('Our offer is valid for 2 weeks.\n', '') : defaults.additionalInfo, quoteNumber: data.quote_number || v.quoteNumber, projectName: data.project_name || '', buyerName: data.client_name || '', paymentTerms: data.payment_terms || '', vatPctOverride: String(Number(data.vat_pct) || 0) }));
    }).catch(e => {
      if (!cancelled) setLoadError(e.message);
    });
    return () => { cancelled = true; };
  }, [id, isEngineer, loadAttempt]);

  const invoice = isInvoiceStage(project);
  const documentTitle = commercialTitle(project);

  const exportPdf = async () => {
    if (!form.quoteNumber.trim()) return toast.error(`${documentTitle} number is required`);
    if (form.format === 'quotation' && invoice && !form.deliveryDate) return toast.error('Enter a delivery date');
    setExporting(true);
    try { const { exportProjectPdf } = await import('../utils/pdfExport'); await exportProjectPdf(id, form.format, form); toast.success('PDF exported'); }
    catch (e) { toast.error(`PDF export failed: ${e.message}`); }
    finally { setExporting(false); }
  };

  if (loadError) return <div className="page"><div className="empty" role="alert"><p>{loadError}</p><button className="btn btn-primary" onClick={() => setLoadAttempt(value => value + 1)}>Retry</button> <button className="btn btn-secondary" onClick={() => navigate('/projects')}>Back to projects</button></div></div>;
  if (!project) return <div className="page"><div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /> Loading export editor...</div></div>;
  const input = (label, name, type = 'text', wide = false) => <Field key={name} label={label} name={name} form={form} setForm={setForm} type={type} wide={wide} />;

  return <div className="page">
    <div className="page-header"><div><button className="btn btn-sm btn-secondary" onClick={() => navigate('/projects')}>← Projects</button><div className="page-title" style={{ marginTop: 8 }}>Client Export Editor</div><div className="page-subtitle">Edit details and see the document update live.</div></div><button className="btn btn-primary" disabled={exporting} onClick={exportPdf}>{exporting ? 'Exporting...' : `Export ${form.format === 'quotation' ? documentTitle : 'Technical Quotation'}`}</button></div>
    <div className="client-export-layout">
      <div className="card"><div className="card-body"><div className="form-grid">
        <div className="form-group"><label className="form-label">Document Type</label><select className="form-input" value={form.format} onChange={e => setForm(v => ({ ...v, format: e.target.value }))}>{!isEngineer && <option value="quotation">{documentTitle}</option>}<option value="technical">Technical Quotation</option></select></div>
        {input(`${form.format === 'technical' ? 'Quotation' : documentTitle} Number *`, 'quoteNumber')}
        {form.format === 'technical' ? <>{input('Document Code', 'documentCode')}{input('Edition', 'edition')}</> : <>
          {input(`${documentTitle} Date`, 'quoteDate', 'date')}{input(invoice ? 'Delivery Date *' : 'Expiry Date', invoice ? 'deliveryDate' : 'expiryDate', 'date')}{input('Project', 'projectName')}{input('Buyer Name', 'buyerName')}{input('Buyer Address', 'buyerAddress')}{input('Buyer Phone', 'buyerPhone')}{input('Contact Person', 'buyerContact')}{input('Buyer Email', 'buyerEmail', 'email')}{input('Buyer VAT #', 'buyerVat')}{input('Payment Terms', 'paymentTerms', 'textarea', true)}
          {input('Validity', 'validity')}{input('Delivery Time', 'deliveryTime')}{input('Currency Symbol', 'currency')}{input('Currency Name', 'currencyName')}{input('Incoterm Description', 'incoterm')}{input('Incoterms 2020', 'incotermCode')}
          {input('Additional Info', 'additionalInfo', 'textarea', true)}
          {input('VAT %', 'vatPctOverride', 'number')}{input('VAT Amount Override', 'vatAmountOverride', 'number')}{input('Total Override', 'totalOverride', 'number')}
          {input('Bank Account', 'bankAccount')}{input('IBAN', 'bankIban')}{input('Bank Name', 'bankName')}{input('Bank Branch', 'bankBranch')}{input('Bank Address', 'bankAddress', 'textarea', true)}{input('Bank Country', 'bankCountry')}{input('Swift Code', 'bankSwift')}
          {input('Signatory Company', 'signatoryCompany')}{input('Authorized Signatory', 'signatoryName')}{input('Signature Label', 'signatureText')}
          {input('Footer Line 1', 'footerLine1', 'text', true)}{input('Footer Line 2', 'footerLine2', 'text', true)}{input('Footer Line 3', 'footerLine3', 'text', true)}
        </>}
      </div><button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} disabled={exporting} onClick={exportPdf}>{exporting ? 'Exporting...' : 'Export PDF'}</button></div></div>
      <div className="client-export-preview">
        <PdfPreview project={project} form={form} />
      </div>
    </div>
  </div>;
}

function PdfPreview({ project, form }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    const timer = setTimeout(async () => {
      try {
        const { loadPng, drawTechnicalQuotation } = await import('../utils/pdfExport');
        const logo = await loadPng('/LogoHorizonLB.png');
        if (cancelled) return;
        const drawDocument = form.format === 'technical' ? drawTechnicalQuotation : drawCommercialDocument;
        const { doc } = drawDocument(project, form, logo);
        objectUrl = URL.createObjectURL(doc.output('blob'));
        setUrl(objectUrl);
      } catch (error) { if (!cancelled) toast.error(`Preview failed: ${error.message}`); }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [project, form]);
  return url ? <iframe title="Client PDF preview" src={url} style={{ width: '100%', height: 'calc(100vh - 60px)', minHeight: 700, border: 0, background: '#fff' }} /> : <div>Preparing PDF preview...</div>;
}

