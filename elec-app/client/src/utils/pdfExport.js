import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/client';
import { LOGO_SVG } from './logo';

function svgToPng(svgStr, w = 40, h = 40) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = w * 4;
    canvas.height = h * 4;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
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

export async function exportProjectPdf(projectId, type = 'owner') {
  const { data } = await api.get(`/projects/${projectId}/crm`);
  const project = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const logoPng = await svgToPng(LOGO_SVG);
  const panels = project.panels || [];
  let grandTotal = 0;
  let grandCost = 0;

  // ────────────────────────────────────────────────────────────────
  // CLIENT PDF — redesigned quotation-style layout
  // ────────────────────────────────────────────────────────────────
  if (type === 'client') {
    // ── Page 1: Header + Project Info ──
    if (logoPng) { doc.addImage(logoPng, 'PNG', 14, 14, 22, 22); }
    doc.setFontSize(18);
    doc.setTextColor(26, 95, 168);
    doc.text('HORIZON Engineering & Contracting', pw / 2, 22, { align: 'center' });

    doc.setDrawColor(26, 95, 168);
    doc.setLineWidth(0.5);
    doc.line(14, 42, pw - 14, 42);

    // Info block
    const infoY = 56;
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
      return [`Panel #${p.panel_number}${p.panel_name ? ' — ' + p.panel_name : ''}`, '1', `$${price.toFixed(2)}`, `$${price.toFixed(2)}`];
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
      margin: { left: 16, right: 16 },
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
        margin: { left: 16, right: 16 },
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
  doc.text(`Exchange Rate: 1 EUR = ${project.exchange_rate_eur_usd || 1.08} USD`, 14, y);
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
        const cost = parseFloat(item.cost || 0);
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
          const cost = parseFloat(item.cost || 0);
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
        margin: { left: 16, right: 16 },
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
        const cost = parseFloat(item.cost || 0);
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
    margin: { left: 16, right: 16 },
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
        const cost = parseFloat(item.cost || 0);
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
    margin: { left: 16, right: 16 },
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

  finalizeDoc(doc, pw, logoPng, project);
  const oSuffix = 'owner';
  doc.save(`project_${project.id}_${oSuffix}_${(project.project_name || 'report').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
}
