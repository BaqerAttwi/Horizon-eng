import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/client';

function loadPng(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function addFooter(doc, pw, totalPages) {
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Generated on ${today}  |  HORIZON Engineering & Contracting  |  Page ${i} of ${totalPages}`, pw / 2, 285, { align: 'center' });
  }
}

function addSubpageHeader(doc, pw, logoPng, project) {
  if (logoPng) {
    doc.addImage(logoPng, 'PNG', 14, 8, 12, 12);
  }
  doc.setFontSize(8);
  doc.setTextColor(26, 95, 168);
  doc.text('HORIZON Engineering & Contracting', pw / 2, 12, { align: 'center' });
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(project.project_name || '', pw / 2, 17, { align: 'center' });
  doc.setDrawColor(200);
  doc.line(14, 22, pw - 14, 22);
}

function finalizeDoc(doc, pw, logoPng, project) {
  const totalPages = doc.internal.getNumberOfPages();
  addFooter(doc, pw, totalPages);
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    addSubpageHeader(doc, pw, logoPng, project);
  }
  return totalPages;
}

const BLUE = [0, 137, 180];
const BORDER = [35, 35, 35];

function clean(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function money(value, currency = '$') {
  return `${currency}${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function activePanels(project) {
  return (project.panels || [])
    .filter(panel => (panel.divisions || []).some(div => (div.items || []).some(item => item.visible_in_client_pdf !== 0)))
    .sort((a, b) => Number(a.panel_number) - Number(b.panel_number));
}

function drawQuotation(project, fields, logoPng) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  // A quotation is a commercial panel summary. Include every priced/named CRM
  // panel even when its individual technical items are hidden from client PDFs.
  const panels = (project.panels || [])
    .filter(panel => panel.panel_name || Number(panel.total_price) !== 0)
    .sort((a, b) => Number(a.panel_number) - Number(b.panel_number));
  const currency = clean(fields.currency, '$');
  const quoteNo = clean(fields.quoteNumber, `Q-${project.id}`);
  const panelTotal = panels.reduce((sum, panel) => sum + (Number(panel.total_price) || 0), 0);
  const discountPct = Number(project.project_discount_pct) || 0;
  const subtotal = panelTotal * (1 - discountPct / 100);
  const vatPct = fields.vatPctOverride !== '' && fields.vatPctOverride !== undefined
    ? Math.max(0, Number(fields.vatPctOverride) || 0)
    : (Number(project.vat_pct) || 0);
  // These values are maintained by Edit Project / server pricing. Prefer the
  // stored amounts so the quotation always agrees with the project screen.
  const storedVat = Number(project.total_vat);
  const overrideVat = fields.vatAmountOverride !== '' && fields.vatAmountOverride !== undefined ? Number(fields.vatAmountOverride) : NaN;
  const vat = Number.isFinite(overrideVat) ? Math.max(0, overrideVat) : Number.isFinite(storedVat) && (storedVat !== 0 || vatPct === 0) && fields.vatPctOverride === undefined
    ? storedVat
    : subtotal * vatPct / 100;
  const storedTotal = Number(project.total_with_vat);
  const overrideTotal = fields.totalOverride !== '' && fields.totalOverride !== undefined ? Number(fields.totalOverride) : NaN;
  const total = Number.isFinite(overrideTotal) ? Math.max(0, overrideTotal) : Number.isFinite(storedTotal) && (storedTotal !== 0 || subtotal === 0) && fields.vatPctOverride === undefined && fields.vatAmountOverride === undefined
    ? storedTotal
    : subtotal + vat;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('QUOTATION', pw / 2, 13, { align: 'center' });
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.25);
  doc.rect(8, 18, 194, 49);
  doc.line(120, 18, 120, 67);
  doc.setFontSize(10); doc.text('Horizon Power Solution', 11, 24);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text(['Verdun - Miraj Center - GF', 'Beirut, Lebanon', '+961 1 741030', 'MOF #: 3890959'], 11, 29, { lineHeightFactor: 1.35 });
  if (logoPng) doc.addImage(logoPng, 'PNG', 73, 25, 36, 31);
  const topRows = [
    ['Quote #', quoteNo, 'Date', clean(fields.quoteDate)],
    ['Project', clean(fields.projectName, project.project_name || '-'), 'Expiry', clean(fields.expiryDate)],
    ['Pages', '1', '', ''],
  ];
  topRows.forEach((row, index) => {
    const y = 24 + index * 12;
    doc.setFont('helvetica', 'bold'); doc.text(row[0], 123, y); doc.text(row[2], 165, y);
    doc.setFont('helvetica', 'normal'); doc.text(row[1], 140, y); doc.text(row[3], 178, y);
  });

  autoTable(doc, {
    startY: 70, margin: { left: 8, right: 8 }, theme: 'grid',
    head: [['BUYER', '', 'PAYMENT TERMS', '']],
    body: [
      ['Name', clean(fields.buyerName, project.client_name || '-'), 'Payment', clean(fields.paymentTerms, project.payment_terms || '-')],
      ['Address', clean(fields.buyerAddress, '-'), 'Validity', clean(fields.validity, '2 weeks')],
      ['Phone', clean(fields.buyerPhone, '-'), 'Delivery', clean(fields.deliveryTime, 'TBD')],
      ['Contact', clean(fields.buyerContact, '-'), 'Currency', clean(fields.currency, 'USD')],
      ['Email', clean(fields.buyerEmail, '-'), 'Incoterms', clean(fields.incoterm, 'Ex-works')],
      ['VAT #', clean(fields.buyerVat, '-'), '', ''],
    ],
    styles: { fontSize: 7, cellPadding: 1.2, lineColor: BORDER, lineWidth: 0.2, textColor: 20 },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 76 }, 2: { cellWidth: 20, fontStyle: 'bold' }, 3: { cellWidth: 80 } },
  });

  const rows = panels.map((panel, index) => {
    const quantity = Math.max(1, Number(panel.quantity || panel.qty) || 1);
    const amount = Number(panel.total_price) || 0;
    return [
      index + 1,
      `Panel #${panel.panel_number}${panel.panel_name ? ` - ${panel.panel_name}` : ''}`,
      String(quantity), 'Nos.', money(amount / quantity, currency), money(amount, currency),
    ];
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 3, margin: { left: 8, right: 8, bottom: 72 }, theme: 'grid',
    head: [['S/N', 'Description', 'Unit Quantity', 'Unit Type', 'Price', 'Amount']],
    body: rows.length ? rows : [['', 'No priced panels', '', '', '', '']],
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: BORDER, lineWidth: 0.2, textColor: 20 },
    headStyles: { fillColor: BLUE, textColor: 255, halign: 'center' },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 82 }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 28, halign: 'right' } },
  });

  let y = Math.min(doc.lastAutoTable.finalY + 3, 207);
  const totals = [['Consignment Total', panelTotal], ...(discountPct ? [[`Discount (${discountPct}%)`, panelTotal - subtotal]] : []), [`VAT (${vatPct}%)`, vat], ['TOTAL', total]];
  totals.forEach(([label, value], index) => {
    doc.setFont('helvetica', index === totals.length - 1 ? 'bold' : 'normal');
    doc.setFontSize(8); doc.text(label, 145, y + index * 5); doc.text(money(value, currency), 199, y + index * 5, { align: 'right' });
  });
  y += totals.length * 5 + 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('Additional Info', 9, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  const notes = clean(fields.additionalInfo, `Offer valid ${clean(fields.validity, '2 weeks')}\nDelivery Time ${clean(fields.deliveryTime, 'TBD')}\nAttachment Technical Offer\n${clean(fields.incoterm, 'Ex-work workshop in Beirut')}`).split('\n').filter(Boolean);
  doc.text(notes.map(note => `- ${note}`), 10, y + 5, { lineHeightFactor: 1.25 });
  const bankY = Math.min(y + 28, 240);
  doc.setFont('helvetica', 'bold'); doc.text('Banking Details', 9, bankY);
  doc.setFont('helvetica', 'normal');
  doc.text([
    clean(fields.signatoryCompany, 'Horizon Power Solution'),
    `A/C No: ${clean(fields.bankAccount, '3254067424002')}`,
    `IBAN: ${clean(fields.bankIban, 'LB93003900000003254067424002')}`,
    `Bank Name: ${clean(fields.bankName, 'BYBLOS BANK')}`,
    `Branch: ${clean(fields.bankBranch, 'Ghobeiry Branch')}`,
    clean(fields.bankAddress, 'Ghobeiry Old Airport Highway - Jawharat El Kasr BLDG - Ground Floor'),
    `Country: ${clean(fields.bankCountry, 'Lebanon')}   Swift Code: ${clean(fields.bankSwift, 'BYBALBBX')}`,
  ], 9, bankY + 5, { lineHeightFactor: 1.2 });
  doc.setFont('helvetica', 'bold'); doc.text(`Incoterms 2020: ${clean(fields.incotermCode, 'EXW Beirut - Workshop')}`, 145, bankY);
  doc.text(`Currency: ${clean(fields.currencyName, 'USD')}`, 145, bankY + 5);
  doc.text('Signatory', 145, bankY + 11);
  doc.setFont('helvetica', 'normal'); doc.text(`Company: ${clean(fields.signatoryCompany, 'Horizon Power Solutions')}`, 145, bankY + 16);
  doc.text(`Name: ${clean(fields.signatoryName, 'Khodor Sharaf')}`, 145, bankY + 21);
  doc.text(clean(fields.signatureText, 'Signature'), 145, bankY + 27);
  doc.line(145, bankY + 33, 198, bankY + 33);
  doc.setDrawColor(0); doc.line(8, 278, 202, 278);
  doc.setFontSize(6.5);
  doc.text(clean(fields.footerLine1, 'www.horizonpowerlb.com'), pw / 2, 282, { align: 'center' });
  doc.text(clean(fields.footerLine2, 'Verdun - Miraj Center - GF, Beirut, Lebanon'), pw / 2, 286, { align: 'center' });
  doc.text(clean(fields.footerLine3, 'Tel: +961 1 741030 | Email: info@horizonpowerlb.com'), pw / 2, 290, { align: 'center' });
  return { doc, filename: `${quoteNo.replace(/[^a-z0-9_-]/gi, '_')}_quotation.pdf` };
}

function drawTechnicalQuotation(project, fields, logoPng) {
  // Technical BOMs contain several wide text columns. Landscape prevents
  // autoTable from squeezing/overflowing the requested column widths.
  const doc = new jsPDF('l', 'mm', 'letter');
  const pw = doc.internal.pageSize.getWidth();
  const quoteNo = clean(fields.quoteNumber, `Q-${project.id}`);
  const panels = activePanels(project);
  const drawHeader = () => {
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.25); doc.rect(7, 7, pw - 14, 22);
    doc.line(52, 7, 52, 29); doc.line(pw - 50, 7, pw - 50, 29);
    if (logoPng) doc.addImage(logoPng, 'PNG', 10, 9, 38, 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('HORIZON POWER SOLUTION', pw / 2, 14, { align: 'center' });
    doc.setFontSize(15); doc.text('TECHNICAL OFFER', pw / 2, 23, { align: 'center' });
    doc.setFontSize(6.5); doc.text(clean(fields.documentCode, 'HPS-COM-PR02-L02'), pw - 47, 12);
    doc.text(`Edition ${clean(fields.edition, '1')}`, pw - 47, 18);
    doc.text(`Quote # ${quoteNo}`, pw - 47, 24);
  };
  drawHeader();
  const body = [];
  panels.forEach(panel => {
    body.push([{ content: `Panel #${panel.panel_number} - ${clean(panel.panel_name, 'Panel')}`, colSpan: 6, styles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' } }]);
    let number = 1;
    (panel.divisions || []).forEach(div => {
      // Keep the same database/CRM order and include group-instance items too:
      // the technical offer is the complete bill of materials for each panel.
      (div.items || []).filter(item => item.visible_in_client_pdf !== 0).forEach(item => {
        body.push([
          number++, clean(panel.panel_name, `Panel ${panel.panel_number}`), clean(div.division_type, '-'),
          clean(item.is_manual ? item.custom_name : item.reference, '-'),
          clean(item.custom_desc || item.product_desc || item.description, '-'), clean(item.qty, '1'),
        ]);
      });
    });
  });
  autoTable(doc, {
    startY: 32, margin: { left: 7, right: 7, top: 32, bottom: 10 }, theme: 'grid',
    head: [['#', 'Panel name', 'Division', 'Part number', 'Description', 'QTY']],
    body: body.length ? body : [['', '', '', '', 'No technical items', '']],
    styles: { fontSize: 5.8, cellPadding: 0.8, lineColor: BORDER, lineWidth: 0.15, textColor: 10, overflow: 'linebreak' },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 42 }, 2: { cellWidth: 31 }, 3: { cellWidth: 42 }, 4: { cellWidth: 120 }, 5: { cellWidth: 10, halign: 'center' } },
    didDrawPage: ({ pageNumber }) => { if (pageNumber > 1) drawHeader(); },
  });
  return { doc, filename: `${quoteNo.replace(/[^a-z0-9_-]/gi, '_')}_technical_quotation.pdf` };
}

export async function exportProjectPdf(projectId, type = 'owner', fields = {}) {
  const { data } = await api.get(`/projects/${projectId}/crm`);
  const project = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const logoPng = await loadPng('/LogoHorizonLB.png');
  const panels = project.panels || [];
  let grandTotal = 0;
  let grandCost = 0;

  if (type === 'quotation' || type === 'technical') {
    const output = type === 'quotation'
      ? drawQuotation(project, fields, logoPng)
      : drawTechnicalQuotation(project, fields, logoPng);
    output.doc.save(output.filename);
    return;
  }

  // ────────────────────────────────────────────────────────────────
  // CLIENT PDF — redesigned quotation-style layout
  // ────────────────────────────────────────────────────────────────
  if (type === 'client') {
    // ── Page 1: Header + Project Info ──
    if (logoPng) { doc.addImage(logoPng, 'PNG', 14, 8, 33, 33); }
    doc.setFontSize(18);
    doc.setTextColor(26, 95, 168);
    doc.text('HORIZON Engineering & Contracting', pw / 2, 30, { align: 'center' });

    doc.setDrawColor(26, 95, 168);
    doc.setLineWidth(0.5);
    doc.line(14, 46, pw - 14, 46);

    // Info block
    const infoY = 60;
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, infoY, pw - 28, 38, 2, 2, 'F');
    const lx = 20, rx = pw / 2 + 10;

    const infoCell = (label, val, x, vx, yy) => {
      doc.setFontSize(9); doc.setTextColor(71, 85, 105); doc.text(label, x, yy);
      doc.setFontSize(10); doc.setTextColor(15, 23, 42); doc.text(String(val), vx, yy);
    };

    infoCell('Project Name:', project.project_name || '—', lx, lx + 34, infoY + 7);
    infoCell('Client:', project.client_name || '—', rx, rx + 34, infoY + 7);
    infoCell('Engineer:', project.engineer_id || '—', lx, lx + 34, infoY + 16);
    infoCell('Date:', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), rx, rx + 34, infoY + 16);

    let y = infoY + 48;

    // ── Cover Letter / Message ──
    y += 4;
    const panelGrandNoDisc = panels.filter(p => (p.divisions || []).some(d => (d.items || []).length)).reduce((s, p) => s + (parseFloat(p.total_price) || 0), 0);
    const payTerms = String(project.payment_terms || '70% at order, 30% after inspection');
    const msgH = 60;
    doc.setDrawColor(200);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, y, pw - 28, msgH, 2, 2, 'F');
    const msgX = 20, valX = 90;
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Dear Sirs,', msgX, y + 7);
    doc.text('We are pleased to submit to you enclosed our offer for the above mentioned', msgX, y + 15);
    doc.text('project on the terms stated below:', msgX, y + 22);
    doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text('Total Amount:', msgX, y + 32);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(`$${panelGrandNoDisc.toFixed(2)}`, valX, y + 32);
    doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text('Payment:', msgX, y + 40);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(payTerms, valX, y + 40);
    doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text('Validity:', msgX, y + 50);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text('7 DAYS', valX, y + 50);
    doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text('Attached:', msgX, y + 58);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text('*Technical specifications  *Price List', valX, y + 58);
    y += msgH + 4;

    // ── Page 2: Panel Summary + Totals ──
    doc.addPage();
    y = 30;
    addSubpageHeader(doc, pw, logoPng, project);
    doc.setFontSize(14);
    doc.setTextColor(26, 95, 168);
    doc.text('Panel Summary', 14, y);
    y += 10;

    const activePanels = panels
      .filter(p => (p.divisions || []).some(d => (d.items || []).length))
      .sort((a, b) => a.panel_number - b.panel_number);

    let panelGrand = 0;
    const summaryRows = activePanels.map(p => {
      const price = parseFloat(p.total_price) || 0;
      panelGrand += price;
      const quantity = Math.max(1, Number(p.quantity) || 1);
      return [`Panel #${p.panel_number}${p.panel_name ? ' — ' + p.panel_name : ''}`, String(quantity), `$${(price / quantity).toFixed(2)}`, `$${price.toFixed(2)}`];
    });

    autoTable(doc, {
      startY: y,
      head: [['Panel Name', 'Qty', 'Unit Price', 'Total Price']],
      body: summaryRows,
      foot: [['', '', 'GRAND TOTAL', `$${panelGrand.toFixed(2)}`]],
      theme: 'grid',
      headStyles: { fontSize: 8, fillColor: [26, 95, 168], textColor: 255, halign: 'center' },
      bodyStyles: { fontSize: 8 },
      footStyles: { fontSize: 8, fillColor: [240, 244, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: { 0: {}, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 16, right: 16, top: 28 },
      tableWidth: pw - 32,
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── Totals Section ──
    const clientDiscPct = parseFloat(project.project_discount_pct) || 0;
    const clientDiscAmt = panelGrand * (clientDiscPct / 100);
    const clientNetAfterDisc = panelGrand - clientDiscAmt;
    const clientVatPct = parseFloat(project.vat_pct) || 0;
    const clientVatAmt = clientNetAfterDisc * (clientVatPct / 100);
    const clientGrandWithVat = clientNetAfterDisc + clientVatAmt;
    const totalsX = pw / 2 + 6;
    const totalsW = (pw / 2) - 20;
    const totalsH = clientDiscPct > 0 ? 38 : 28;

    doc.setDrawColor(26, 95, 168);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(totalsX, y, totalsW, totalsH, 2, 2, 'F');

    doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text('Grand Total (excl. VAT):', totalsX + 4, y + 7);
    doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(`$${panelGrand.toFixed(2)}`, totalsX + totalsW - 4, y + 7, { align: 'right' });
    y += 10;

    if (clientDiscPct > 0) {
      doc.setFontSize(9); doc.setTextColor(71, 85, 105);
      doc.text(`Discount (${clientDiscPct}%):`, totalsX + 4, y + 7);
      doc.setFontSize(10); doc.setTextColor(239, 68, 68);
      doc.text(`-$${clientDiscAmt.toFixed(2)}`, totalsX + totalsW - 4, y + 7, { align: 'right' });
      y += 10;
    }

    doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text(`VAT (${clientVatPct}%):`, totalsX + 4, y + 7);
    doc.setFontSize(10); doc.setTextColor(146, 64, 14);
    doc.text(`$${clientVatAmt.toFixed(2)}`, totalsX + totalsW - 4, y + 7, { align: 'right' });
    y += 10;

    doc.setDrawColor(26, 95, 168);
    doc.setFillColor(26, 95, 168);
    doc.roundedRect(totalsX, y, totalsW, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('TOTAL WITH VAT:', totalsX + 4, y + 5.5);
    doc.text(`$${clientGrandWithVat.toFixed(2)}`, totalsX + totalsW - 4, y + 5.5, { align: 'right' });

    // ── Client PDF Note ──
    if (project.client_pdf_note) {
      y += 14;
      const noteLines = doc.splitTextToSize(String(project.client_pdf_note), pw - 36);
      const noteH = Math.max(14, 10 + noteLines.length * 4);
      doc.setDrawColor(200);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(14, y, pw - 28, noteH, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text('Note:', 18, y + 4);
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(noteLines, 18, y + 10);
      y += noteH + 4;
    }

    // ── Page 3+: Technical Details ──
    doc.addPage();
    y = 30;
    addSubpageHeader(doc, pw, logoPng, project);

    doc.setFontSize(14);
    doc.setTextColor(26, 95, 168);
    doc.text('Technical Details', 14, y);
    y += 10;

    for (const panel of activePanels) {
      if (y > 250) {
        doc.addPage(); y = 30;
        addSubpageHeader(doc, pw, logoPng, project);
        doc.setFontSize(14); doc.setTextColor(26, 95, 168);
        doc.text('Technical Details (continued)', 14, y);
        y += 10;
      }

      const allItems = [];
      const groupRows = [];
      for (const div of panel.divisions || []) {
        // Collect individual items (skip group instance items)
        for (const item of div.items || []) {
          if (item.visible_in_client_pdf === 0) continue;
          if (item.source_group_instance_id) continue;
          const ref = item.is_manual ? (item.custom_name || 'Manual') : item.reference;
          allItems.push({ ref: ref || '—', desc: item.custom_desc || item.product_desc || item.description || '—', qty: item.qty ?? 1, division: div.division_type || '' });
        }
        // Collect group instance summaries
        for (const gi of div.group_instances || []) {
          const groupTotal = (gi.items || []).reduce((s, i) => s + (parseFloat(i.totalfinalProduct) || 0), 0);
          groupRows.push({ name: gi.group_name || `Group #${gi.item_group_id}`, qty: gi.quantity || 1, total: groupTotal, division: div.division_type || '' });
        }
      }
      if (!allItems.length && !groupRows.length) continue;

      doc.setFillColor(26, 95, 168);
      doc.roundedRect(14, y, pw - 28, 7, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`PANEL: Panel #${panel.panel_number}${panel.panel_name ? ' — ' + panel.panel_name : ''}`, 18, y + 5);
      y += 10;

      if (panel.show_note_in_client_pdf && panel.note) {
        const noteLines = doc.splitTextToSize(String(panel.note), pw - 56);
        const noteH = Math.max(14, 10 + noteLines.length * 4);
        doc.setDrawColor(200);
        doc.setFillColor(254, 249, 235);
        doc.roundedRect(16, y, pw - 32, noteH, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setTextColor(146, 64, 14);
        doc.text('Note:', 20, y + 4);
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(noteLines, 20, y + 10);
        y += noteH + 4;
      }

      const itemRows = allItems.map((itm, i) => [`${i + 1}`, itm.ref, itm.desc, itm.division, `${itm.qty}`]);
      // Add group rows at the end with distinct style
      const groupStartIdx = itemRows.length + 1;
      for (const gr of groupRows) {
        itemRows.push(['', `Group: ${gr.name}`, '', gr.division, `${gr.qty}`]);
      }

      autoTable(doc, {
        startY: y,
        head: [['#', 'Item', 'Description', 'Division', 'Qty']],
        body: itemRows,
        theme: 'grid',
        headStyles: { fontSize: 7, fillColor: [71, 85, 105], textColor: 255, halign: 'center' },
        bodyStyles: { fontSize: 7 },
        columnStyles: { 0: { halign: 'center' }, 1: { fontStyle: 'bold' }, 2: {}, 3: { halign: 'center' }, 4: { halign: 'center' } },
        margin: { left: 16, right: 16, top: 28 },
        tableWidth: pw - 32,
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index >= groupStartIdx - 1) {
            data.cell.styles.fillColor = [240, 244, 249];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    finalizeDoc(doc, pw, logoPng, project);
    const cSuffix = 'client';
    doc.save(`project_${project.id}_${cSuffix}_${(project.project_name || 'report').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
    return;
  }

  // ────────────────────────────────────────────────────────────────
  // OWNER PDF (unchanged)
  // ────────────────────────────────────────────────────────────────
  // ── Logo + Header ──
  if (logoPng) { doc.addImage(logoPng, 'PNG', 14, 14, 22, 22); }
  doc.setFontSize(18);
  doc.setTextColor(26, 95, 168);
  doc.text('HORIZON Engineering & Contracting', pw / 2, 22, { align: 'center' });
  let y = 40;

  // ── Project header ──
  doc.setDrawColor(26, 95, 168);
  doc.setFillColor(240, 244, 249);
  doc.roundedRect(14, y, pw - 28, 22, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const reportLabel = 'PROJECT REPORT (OWNER)';
  doc.text(reportLabel, 18, y + 4);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`project name: ${project.project_name || ''}`, 18, y + 12);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const infoLine = `ID: ${project.id}  |  Engineer: ${project.engineer_name || '—'}  |  Client: ${project.client_name || '—'}  |  ${project.deadline ? 'Deadline: ' + project.deadline.split('T')[0] : ''}`;
  doc.text(infoLine, 18, y + 18);
  y += 36;

  // ── Status badges ──
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Status: ${project.status || 'draft'}  |  Admin: ${project.admin_approval || 'pending'}  |  Client: ${project.client_approval || 'pending'}`, 14, y);
  y += 6;
  if (project.total_panels > 0) {
    const pct = Math.round((project.completed_panels / project.total_panels) * 100);
    doc.text(`Progress: ${project.completed_panels}/${project.total_panels} panels (${pct}%)`, 14, y);
    y += 6;
  }
  doc.text(`Exchange Rate: 1 EUR = ${project.exchange_rate_eur_usd || 1.18} USD`, 14, y);
  y += 8;

  for (const panel of panels) {
    if (y > 250) { doc.addPage(); y = 30; }
    const divisions = panel.divisions || [];
    let hasItems = divisions.some(d => d.items?.length);
    if (!hasItems) continue;

    doc.setFillColor(26, 95, 168);
    doc.roundedRect(14, y, pw - 28, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    const panelLabel = `Panel #${panel.panel_number}${panel.panel_name ? ' — ' + panel.panel_name : ''}  ${panel.is_completed ? '✓ COMPLETE' : ''}`;
    doc.text(panelLabel, 18, y + 5.5);
    doc.setFontSize(7);
    doc.text(`mkP:${panel.markupP}%  mkM:${panel.markupM}%  Man:${panel.manpower_pct}%`, pw - 18, y + 5.5, { align: 'right' });
    y += 11;

    for (const div of divisions) {
      const items = div.items || [];
      if (!items.length) continue;
      if (y > 260) { doc.addPage(); y = 30; }

      // Separate regular items from group items
      const regularItems = items.filter(i => !i.source_group_instance_id);
      const groupInstances = div.group_instances || [];

      doc.setDrawColor(200);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(16, y, pw - 32, 6, 1, 1, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.text(`${div.division_type}  (${items.length} items)`, 19, y + 4);
      doc.setFontSize(7);
      doc.text(`mkP:${div.markupP}%  mkM:${div.markupM}%  Man:${div.manpower_pct}%`, pw - 19, y + 4, { align: 'right' });
      y += 8;

      // Build body rows: regular items first, then groups
      const body = [];
      const groupRowIndices = [];

      // Regular items
      for (const item of regularItems) {
        const base = parseFloat(item.base_price_usd) || 0;
        const qty = item.qty ?? 1;
        const baseTotal = base * qty;
        const discAmt = baseTotal * (parseFloat(item.discount_pct) / 100);
        const afterDisc = baseTotal - discAmt;
        const mkPAmt = afterDisc * (parseFloat(item.markupP_pct) / 100);
        const tPrice = afterDisc + mkPAmt;
        const manAmt = afterDisc * (parseFloat(item.manpower_pct) / 100);
        const mkMAmt = manAmt * (parseFloat(item.markupM_pct) / 100);
        const finalPrice = tPrice + manAmt + mkMAmt;
        const cost = (parseFloat(item.cost || 0)) * qty;
        const profit = finalPrice - cost;
        const name = item.is_manual ? (item.custom_name || 'Manual') : item.reference;
        grandTotal += finalPrice;
        grandCost += cost;
        body.push([name, `x${qty}`, `$${base.toFixed(2)}`, `${item.markupP_pct}%`, `${item.discount_pct}%`, `${item.manpower_pct}%`, `${item.markupM_pct}%`, `$${finalPrice.toFixed(2)}`, `$${cost.toFixed(2)}`, profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`]);
      }

      // Group instances
      for (const gi of groupInstances) {
        groupRowIndices.push(body.length);
        body.push([`= Group: ${gi.group_name || `Group #${gi.item_group_id}`}`, '', '', '', '', '', '', '', '', '']);
        for (const item of gi.items || []) {
          const base = parseFloat(item.base_price_usd) || 0;
          const qty = item.qty ?? 1;
          const baseTotal = base * qty;
          const discAmt = baseTotal * (parseFloat(item.discount_pct) / 100);
          const afterDisc = baseTotal - discAmt;
          const mkPAmt = afterDisc * (parseFloat(item.markupP_pct) / 100);
          const tPrice = afterDisc + mkPAmt;
          const manAmt = afterDisc * (parseFloat(item.manpower_pct) / 100);
          const mkMAmt = manAmt * (parseFloat(item.markupM_pct) / 100);
          const finalPrice = tPrice + manAmt + mkMAmt;
          const cost = (parseFloat(item.cost || 0)) * qty;
          const profit = finalPrice - cost;
          const name = item.is_manual ? (item.custom_name || 'Manual') : item.reference;
          grandTotal += finalPrice;
          grandCost += cost;
          body.push([name, `x${qty}`, `$${base.toFixed(2)}`, `${item.markupP_pct}%`, `${item.discount_pct}%`, `${item.manpower_pct}%`, `${item.markupM_pct}%`, `$${finalPrice.toFixed(2)}`, `$${cost.toFixed(2)}`, profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`]);
        }
      }

      autoTable(doc, {
        startY: y,
        head: [['Item', 'Qty', 'Base $', 'mkP', 'Disc', 'Man', 'mkM', 'Total $', 'Cost $', 'Profit $']],
        body,
        theme: 'grid',
        headStyles: { fontSize: 6, fillColor: [71, 85, 105], textColor: 255, halign: 'center' },
        bodyStyles: { fontSize: 6 },
        columnStyles: { 0: { cellWidth: 50 }, 7: { halign: 'right', fontStyle: 'bold' }, 8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 16, right: 16, top: 28 },
        tableWidth: pw - 32,
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (groupRowIndices.includes(data.row.index)) {
              data.cell.styles.fillColor = [230, 242, 255];
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fontSize = 7;
            }
            if (data.column.index === 9) {
              const val = data.cell.raw;
              if (typeof val === 'string') {
                if (val.startsWith('+')) data.cell.styles.textColor = [34, 197, 94];
                else if (val.startsWith('-')) data.cell.styles.textColor = [239, 68, 68];
              }
            }
          }
        },
      });
      y = doc.lastAutoTable.finalY + 4;
    }
  }

  // ── Grand total + Cost summary (owner only) ──
  if (y > 260) { doc.addPage(); y = 30; }
  const vatPct = parseFloat(project.vat_pct) || 0;
  const discountPct = parseFloat(project.project_discount_pct) || 0;
  const discountAmt = grandTotal * (discountPct / 100);
  const netAfterDisc = grandTotal - discountAmt;
  const vatAmt = netAfterDisc * (vatPct / 100);
  const grandWithVat = netAfterDisc + vatAmt;
  const netProfit = grandWithVat - grandCost;
  doc.setDrawColor(26, 95, 168);
  doc.setFillColor(26, 95, 168);
  doc.roundedRect(14, y, pw - 28, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(`GRAND TOTAL: $${grandTotal.toFixed(2)}`, pw / 2, y + 7, { align: 'center' });
  y += 12;

  if (discountPct > 0) {
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(14, y, pw - 28, 8, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setTextColor(239, 68, 68);
    doc.text(`Discount (${discountPct}%): -$${discountAmt.toFixed(2)}`, 18, y + 5.5);
    doc.setFontSize(10);
    doc.text(`Net after Discount: $${netAfterDisc.toFixed(2)}`, pw - 18, y + 5.5, { align: 'right' });
    y += 11;
  }

  if (vatPct > 0) {
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(14, y, pw - 28, 8, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setTextColor(146, 64, 14);
    doc.text(`VAT (${vatPct}%): $${vatAmt.toFixed(2)}`, 18, y + 5.5);
    doc.setFontSize(10);
    doc.text(`TOTAL WITH VAT: $${grandWithVat.toFixed(2)}`, pw - 18, y + 5.5, { align: 'right' });
    y += 11;
  }

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pw - 28, 10, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Total Cost: $${grandCost.toFixed(2)}`, 18, y + 7);
  doc.setTextColor(netProfit >= 0 ? '#22c55e' : '#ef4444');
  doc.setFontSize(12);
  doc.text(`Net ${netProfit >= 0 ? 'Profit' : 'Loss'}: ${netProfit >= 0 ? '+' : '-'}$${Math.abs(netProfit).toFixed(2)}`, pw - 18, y + 7, { align: 'right' });
  y += 14;

  // ── Brand Summary (owner) ──
  if (y > 260) { doc.addPage(); y = 30; }
  const brandMap = {};
  for (const panel of panels) {
    for (const div of panel.divisions || []) {
      for (const item of div.items || []) {
        const brand = item.is_manual ? (item.custom_brand || 'Unbranded') : (item.brand_name || 'Unbranded');
        const base = parseFloat(item.base_price_usd) || 0;
        const qty = item.qty ?? 1;
        const baseTotal = base * qty;
        const discAmt = baseTotal * (parseFloat(item.discount_pct) / 100);
        const afterDisc = baseTotal - discAmt;
        const mkPAmt = afterDisc * (parseFloat(item.markupP_pct) / 100);
        const tPrice = afterDisc + mkPAmt;
        const manAmt = afterDisc * (parseFloat(item.manpower_pct) / 100);
        const mkMAmt = manAmt * (parseFloat(item.markupM_pct) / 100);
        const finalPrice = tPrice + manAmt + mkMAmt;
        const cost = (parseFloat(item.cost || 0)) * qty;
        if (!brandMap[brand]) brandMap[brand] = { brand, total_cost: 0, total_price: 0, count: 0 };
        brandMap[brand].total_cost += cost;
        brandMap[brand].total_price += finalPrice;
        brandMap[brand].count++;
      }
    }
  }
  const brandRows = Object.values(brandMap).sort((a, b) => b.total_price - a.total_price);
  const brandGrandCost = brandRows.reduce((s, b) => s + b.total_cost, 0);
  const brandGrandPrice = brandRows.reduce((s, b) => s + b.total_price, 0);

  doc.setFontSize(12);
  doc.setTextColor(26, 95, 168);
  doc.text('Brand Cost / Price Breakdown', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Brand', 'Items', 'Total Cost', 'Total Price', 'Profit / Loss']],
    body: brandRows.map(b => {
      const profit = b.total_price - b.total_cost;
      return [b.brand, `${b.count}`, `$${b.total_cost.toFixed(2)}`, `$${b.total_price.toFixed(2)}`, profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`];
    }),
    foot: [['TOTAL', `${brandRows.reduce((s, b) => s + b.count, 0)}`, `$${brandGrandCost.toFixed(2)}`, `$${brandGrandPrice.toFixed(2)}`,
      (brandGrandPrice - brandGrandCost) >= 0 ? `+$${(brandGrandPrice - brandGrandCost).toFixed(2)}` : `-$${Math.abs(brandGrandPrice - brandGrandCost).toFixed(2)}`
    ]],
    theme: 'grid',
    headStyles: { fontSize: 7, fillColor: [71, 85, 105], textColor: 255 },
    bodyStyles: { fontSize: 7 },
    footStyles: { fontSize: 7, fillColor: [240, 244, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 50 }, 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 16, right: 16, top: 28 },
    tableWidth: pw - 32,
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const val = data.cell.raw;
        if (typeof val === 'string') {
          if (val.startsWith('+')) data.cell.styles.textColor = [34, 197, 94];
          else if (val.startsWith('-')) data.cell.styles.textColor = [239, 68, 68];
        }
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Per-item profit breakdown
  if (y > 270) { doc.addPage(); y = 30; }
  const profitRows = [];
  for (const panel of panels) {
    for (const div of panel.divisions || []) {
      for (const item of div.items || []) {
        const base = parseFloat(item.base_price_usd) || 0;
        const qty = item.qty ?? 1;
        const baseTotal = base * qty;
        const discAmt = baseTotal * (parseFloat(item.discount_pct) / 100);
        const afterDisc = baseTotal - discAmt;
        const mkPAmt = afterDisc * (parseFloat(item.markupP_pct) / 100);
        const tPrice = afterDisc + mkPAmt;
        const manAmt = afterDisc * (parseFloat(item.manpower_pct) / 100);
        const mkMAmt = manAmt * (parseFloat(item.markupM_pct) / 100);
        const finalPrice = tPrice + manAmt + mkMAmt;
        const cost = (parseFloat(item.cost || 0)) * qty;
        const pft = finalPrice - cost;
        const name = item.is_manual ? (item.custom_name || 'Manual') : item.reference;
        profitRows.push([name, `$${finalPrice.toFixed(2)}`, `$${cost.toFixed(2)}`, pft >= 0 ? `+$${pft.toFixed(2)}` : `-$${Math.abs(pft).toFixed(2)}`]);
      }
    }
  }
  autoTable(doc, {
    startY: y,
    head: [['Item', 'Selling Price', 'Cost', 'Profit/Loss']],
    body: profitRows,
    theme: 'grid',
    headStyles: { fontSize: 7, fillColor: [71, 85, 105], textColor: 255 },
    bodyStyles: { fontSize: 7 },
    columnStyles: { 0: { cellWidth: 80 }, 3: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 16, right: 16, top: 28 },
    tableWidth: pw - 32,
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const val = data.cell.raw;
        if (typeof val === 'string') {
          if (val.startsWith('+')) data.cell.styles.textColor = [34, 197, 94];
          else if (val.startsWith('-')) data.cell.styles.textColor = [239, 68, 68];
        }
      }
    },
  });

  // ── C.R Comparison table (owner) ──
  if (y > 270) { doc.addPage(); y = 30; }
  const crRows = [];
  let grandDb = 0, grandCr = 0, grandNp = 0;
  for (const panel of panels) {
    for (const div of panel.divisions || []) {
      for (const item of div.items || []) {
        const base = parseFloat(item.base_price_usd) || 0;
        const qty = item.qty ?? 1;
        const baseTotal = base * qty;
        const discAmt = baseTotal * (parseFloat(item.discount_pct) / 100);
        const afterDisc = baseTotal - discAmt;
        const mkPAmt = afterDisc * (parseFloat(item.markupP_pct) / 100);
        const tPrice = afterDisc + mkPAmt;
        const manAmt = afterDisc * (parseFloat(item.manpower_pct) / 100);
        const mkMAmt = manAmt * (parseFloat(item.markupM_pct) / 100);
        const dbPrice = tPrice + manAmt + mkMAmt;
        const cr = (parseFloat(item.cr_amount) || 0) * qty;
        const np = dbPrice - cr;
        const name = item.is_manual ? (item.custom_name || 'Manual') : item.reference;
        crRows.push([`#${panel.panel_number}`, name, `$${dbPrice.toFixed(2)}`, cr > 0 ? `$${cr.toFixed(2)}` : '—', np >= 0 ? `+$${np.toFixed(2)}` : `-$${Math.abs(np).toFixed(2)}`]);
        grandDb += dbPrice; grandCr += cr; grandNp += np;
      }
      for (const gi of div.group_instances || []) {
        for (const item of gi.items || []) {
          const base = parseFloat(item.base_price_usd) || 0;
          const qty = item.qty ?? 1;
          const baseTotal = base * qty;
          const discAmt = baseTotal * (parseFloat(item.discount_pct) / 100);
          const afterDisc = baseTotal - discAmt;
          const mkPAmt = afterDisc * (parseFloat(item.markupP_pct) / 100);
          const tPrice = afterDisc + mkPAmt;
          const manAmt = afterDisc * (parseFloat(item.manpower_pct) / 100);
          const mkMAmt = manAmt * (parseFloat(item.markupM_pct) / 100);
          const dbPrice = tPrice + manAmt + mkMAmt;
          const cr = (parseFloat(item.cr_amount) || 0) * qty;
          const np = dbPrice - cr;
          const name = item.is_manual ? (item.custom_name || 'Manual') : item.reference;
          crRows.push([`#${panel.panel_number}`, name, `$${dbPrice.toFixed(2)}`, cr > 0 ? `$${cr.toFixed(2)}` : '—', np >= 0 ? `+$${np.toFixed(2)}` : `-$${Math.abs(np).toFixed(2)}`]);
          grandDb += dbPrice; grandCr += cr; grandNp += np;
        }
      }
    }
  }
  doc.setFontSize(12);
  doc.setTextColor(26, 95, 168);
  doc.text('Cost Reduction (C.R) vs DB Price', 14, y);
  y += 6;
  autoTable(doc, {
    startY: y,
    head: [['Panel', 'Item', 'DB Price', 'C.R $', 'N Profit']],
    body: crRows,
    foot: [['', 'TOTAL', `$${grandDb.toFixed(2)}`, `$${grandCr.toFixed(2)}`, grandNp >= 0 ? `+$${grandNp.toFixed(2)}` : `-$${Math.abs(grandNp).toFixed(2)}`]],
    theme: 'grid',
    headStyles: { fontSize: 7, fillColor: [71, 85, 105], textColor: 255 },
    bodyStyles: { fontSize: 7 },
    footStyles: { fontSize: 7, fillColor: [240, 244, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 80 }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 16, right: 16, top: 28 },
    tableWidth: pw - 32,
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3 && data.cell.raw !== '—') data.cell.styles.textColor = [251, 191, 36];
      if (data.section === 'body' && data.column.index === 4) {
        const val = data.cell.raw;
        if (typeof val === 'string' && val.startsWith('-')) data.cell.styles.textColor = [239, 68, 68];
        else if (typeof val === 'string' && val.startsWith('+')) data.cell.styles.textColor = [34, 197, 94];
      }
    },
  });

  finalizeDoc(doc, pw, logoPng, project);
  const oSuffix = 'owner';
  doc.save(`project_${project.id}_${oSuffix}_${(project.project_name || 'report').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
}
