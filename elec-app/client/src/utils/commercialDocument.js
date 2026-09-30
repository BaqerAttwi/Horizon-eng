import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const isInvoiceStage = project => ['approval', 'procurement', 'assembly', 'testing', 'delivered'].includes(project?.project_stage);
export const commercialTitle = project => isInvoiceStage(project) ? 'Invoice' : 'Quotation';

export function drawCommercialDocument(project, fields = {}, logoPng) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const invoice = isInvoiceStage(project);
  const title = commercialTitle(project);
  const text = value => String(value ?? '').trim();
  const value = (key, fallback = '') => text(fields[key] ?? fallback);
  const currency = value('currency', '$');
  const money = n => `${currency}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const panels = (project.panels || []).filter(p => p.panel_name || Number(p.total_price)).sort((a,b) => Number(a.panel_number)-Number(b.panel_number));
  const gross = panels.reduce((sum,p) => sum + (Number(p.total_price)||0),0);
  const discount = gross * (Number(project.project_discount_pct)||0)/100;
  const subtotal = gross - discount;
  const has = key => fields[key] !== undefined && fields[key] !== '';
  const vatPct = Math.max(0, Number(has('vatPctOverride') ? fields.vatPctOverride : project.vat_pct)||0);
  const storedVat = Number(project.total_vat);
  const vat = has('vatAmountOverride') ? Math.max(0, Number(fields.vatAmountOverride)||0)
    : fields.vatPctOverride === undefined && Number.isFinite(storedVat) && (storedVat !== 0 || vatPct === 0) ? storedVat : subtotal*vatPct/100;
  const storedTotal = Number(project.total_with_vat);
  const total = has('totalOverride') ? Math.max(0, Number(fields.totalOverride)||0)
    : fields.vatPctOverride === undefined && fields.vatAmountOverride === undefined && Number.isFinite(storedTotal) && (storedTotal !== 0 || subtotal === 0) ? storedTotal : subtotal+vat;
  const quoteNo = value('quoteNumber', project.quote_number || `Q-${project.id}`);
  doc.setDrawColor(0); doc.setLineWidth(0.2); doc.setTextColor(0);
  const box = (x,y,w,h,label,content) => {
    doc.rect(x,y,w,h);
    doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text(label,x+1,y+3);
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(text(content),w-3);
    doc.text(lines,x+1,y+7,{lineHeightFactor:1.15});
  };
  const seller = 'Horizon Power Solution\nVerdun - Miraj Center - GF\nBeirut, Lebanon\n+961 1 741030\nMOF #: 3890959';
  const buyer = [value('buyerName',project.client_name),value('buyerAddress'),value('buyerPhone'),value('buyerContact'),value('buyerEmail'),value('buyerVat') && `VAT #: ${value('buyerVat')}`].filter(Boolean).join('\n');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const metadataHeight = content => Math.max(9, 4 + doc.splitTextToSize(text(content), 42).length * 3.3);
  const numberHeight = metadataHeight(quoteNo);
  const referenceHeight = metadataHeight(value('projectName', project.project_name));
  const sellerHeight = Math.max(27, 9 + numberHeight + referenceHeight);
  const buyerY = 20 + sellerHeight;
  const buyerHeight = Math.max(27, 8 + doc.splitTextToSize(buyer,87).length*3.5);
  const payment = value('paymentTerms',project.payment_terms);
  const paymentHeight = Math.max(16,8+doc.splitTextToSize(payment,87).length*3.5);
  const header = () => {
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text(title.toUpperCase(),105,19,{align:'center'});
    box(15,20,90,sellerHeight,'Seller',seller);
    if (logoPng) doc.addImage(logoPng,'PNG',76,27,24,16);
    box(105,20,90,9,'Pages','');
    box(105,29,45,numberHeight,`${title} Number`,quoteNo);
    box(150,29,45,numberHeight,'Date',value('quoteDate'));
    box(105,29+numberHeight,45,referenceHeight,'Buyer Reference',value('projectName',project.project_name));
    box(150,29+numberHeight,45,referenceHeight,invoice ? 'Delivery Date' : 'Expiry',value(invoice ? 'deliveryDate' : 'expiryDate'));
    box(15,buyerY,90,buyerHeight,'Buyer',buyer);
    box(105,buyerY,90,buyerHeight,'','');
    const y=buyerY+buyerHeight;
    box(15,y,90,paymentHeight,'Delivery / Incoterms',value('incoterm','Ex-work our workshop in Beirut'));
    box(105,y,90,paymentHeight,'Terms / Method of Payment',payment);
    return y+paymentHeight;
  };
  const startY = header();
  autoTable(doc,{
    startY, margin:{left:15,right:15,top:startY,bottom:88},theme:'plain',rowPageBreak:'avoid',
    head:[['S/N','Description of Goods','Unit Quantity','Unit Type','Price','Amount']],
    body: panels.length ? panels.map((p,i)=>{const qty=Math.max(1,Number(p.quantity||p.qty)||1);return [i+1,`Panel #${p.panel_number}${p.panel_name ? ` - ${p.panel_name}` : ''}`,qty,'Nos.',money(Number(p.total_price)/qty),money(p.total_price)];}) : [['','No priced panels','','','','']],
    styles:{font:'helvetica',fontSize:7,cellPadding:1.3,textColor:0,overflow:'linebreak'},
    headStyles:{fontStyle:'normal',halign:'center',lineColor:0,lineWidth:0.2,fillColor:255},
    columnStyles:{0:{cellWidth:20,halign:'center'},1:{cellWidth:70},2:{cellWidth:22,halign:'center'},3:{cellWidth:22,halign:'center'},4:{cellWidth:23,halign:'right'},5:{cellWidth:23,halign:'right'}},
    willDrawPage: data => {if(data.pageNumber>1) header();},
    didDrawPage: () => {doc.setDrawColor(0);doc.rect(15,startY,180,209-startY);},
  });
  const itemPages = doc.internal.getNumberOfPages();
  const summary = [['Consignment Total',money(gross)],...(discount ? [[`Discount (${project.project_discount_pct}%)`,money(discount)]]:[]),[`VAT (${vatPct}%)`,money(vat)],['TOTAL',money(total)]];
  const banking = [value('signatoryCompany','Horizon Power Solutions'),`A/C No: ${value('bankAccount','3254067424002')}`,`IBAN: ${value('bankIban','LB93003900000003254067424002')}`,`Bank Name: ${value('bankName','BYBLOS BANK')}`,`Branch: ${value('bankBranch','Ghobeiry Branch')}`,value('bankAddress','Ghobeiry Old Airport Highway - Jawharat El Kasr BLDG - Ground Floor'),`Country: ${value('bankCountry','Lebanon')}  Swift: ${value('bankSwift','BYBALBBX')}`].join('\n');
  const notes = value('additionalInfo',`${invoice ? '' : `Our offer is valid for ${value('validity','2 weeks')}.\n`}Delivery Time: ${value('deliveryTime','TBD')}\nAttachment: Technical Offer\n${value('incoterm','Ex-work our workshop in Beirut')}`);
  autoTable(doc,{
    startY:209,margin:{left:15,right:15,top:25,bottom:18},theme:'grid',
    body:[...summary.map(([label,amount])=>[{content:label,styles:{halign:'right'}},{content:amount,styles:{halign:'right',fontStyle:'bold'}}]),
      [{content:`Additional Info\n${notes}\n\nBanking Details\n${banking}`},{content:`Incoterms 2020: ${value('incotermCode','EXW Beirut - Workshop')}\nCurrency: ${value('currencyName','USD')}\n\nSignatory Company\n${value('signatoryCompany','Horizon Power Solutions')}\n\nName of Authorized Signatory\n${value('signatoryName','Khodor Sharaf')}\n\n${value('signatureText','Signature')}\n\n________________________`}]],
    styles:{fontSize:7,cellPadding:1.2,lineColor:0,lineWidth:0.2,textColor:0,overflow:'linebreak'},columnStyles:{0:{cellWidth:90},1:{cellWidth:90}},rowPageBreak:'avoid',
  });
  const pages=doc.internal.getNumberOfPages();
  for(let page=1;page<=pages;page++){
    doc.setPage(page);doc.setFont('helvetica','normal');doc.setFontSize(7);
    if(page<=itemPages) doc.text(`${page} of ${pages}`,194,27,{align:'right'});
    else doc.text(`${title} ${quoteNo} - Page ${page} of ${pages}`,15,18);
    doc.setFontSize(6);doc.text([value('footerLine1','www.horizonpowerlb.com'),value('footerLine2','Verdun - Miraj Center - GF, Beirut, Lebanon'),value('footerLine3','Tel: +961 1 741030 | Email: info@horizonpowerlb.com')],105,283,{align:'center',lineHeightFactor:1.2});
  }
  return {doc,filename:`${quoteNo.replace(/[^a-z0-9_-]/gi,'_')}_${title.toLowerCase()}.pdf`};
}
