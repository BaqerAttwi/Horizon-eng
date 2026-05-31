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

export async function exportProjectPdf(projectId, type = 'owner') {
  const { data } = await api.get(`/projects/${projectId}/crm`);
  const project = data;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;

  // ── Logo + Header ──
  const logoPng = await svgToPng(LOGO_SVG);
  if (logoPng) {
    doc.addImage(logoPng, 'PNG', 14, y, 22, 22);
  }
  doc.setFontSize(18);
  doc.setTextColor(26, 95, 168);
  doc.text('HORIZON Engineering & Contracting', pw / 2, y + 8, { align: 'center' });
  y += 26;

  // ── Project header ──
  doc.setDrawColor(26, 95, 168);
  doc.setFillColor(240, 244, 249);
  doc.roundedRect(14, y, pw - 28, 22, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const reportLabel = type === 'owner' ? 'PROJECT REPORT (OWNER)' : 'PROJECT REPORT (CLIENT)';
  doc.text(reportLabel, 18, y + 4);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`project name: ${project.project_name || ''}`, 18, y + 12);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const infoLine = type === 'client'
    ? `Engineer: ${project.engineer_id || '—'} | Client: ${project.client_name || '—'}`
    : `ID: ${project.id}  |  Engineer: ${project.engineer_name || '—'}  |  Client: ${project.client_name || '—'}  |  ${project.deadline ? 'Deadline: ' + project.deadline.split('T')[0] : ''}`;
  doc.text(infoLine, 18, y + 18);
  y += 30;

  if (type === 'owner') {
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
  }

  // ── Panels ──
  const panels = project.panels || [];
  let grandTotal = 0;
  let grandCost = 0;

  // ── Client: Panel Summary (Page 1) ──
  if (type === 'client') {
    const panelRows = panels
      .filter(p => (p.divisions || []).some(d => (d.items || []).length))
      .sort((a, b) => a.panel_number - b.panel_number)
      .map(p => {
        const price = parseFloat(p.total_price) || 0;
        return [`Panel #${p.panel_number}`, p.panel_name || '—', `$${price.toFixed(2)}`];
      });
    const panelGrand = panelRows.reduce((s, r) => s + (parseFloat(r[2].replace('$', '')) || 0), 0);

    autoTable(doc, {
      startY: y,
      head: [['Panel', 'Name', 'Price']],
      body: panelRows,
      theme: 'grid',
      headStyles: { fontSize: 8, fillColor: [26, 95, 168], textColor: 255, halign: 'center' },
      bodyStyles: { fontSize: 8, halign: 'center' },
      columnStyles: { 2: { fontStyle: 'bold' } },
      margin: { left: 16, right: 16 },
      tableWidth: pw - 32,
    });
    y = doc.lastAutoTable.finalY + 6;

    doc.setDrawColor(26, 95, 168);
    doc.setFillColor(26, 95, 168);
    doc.roundedRect(14, y, pw - 28, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(`GRAND TOTAL: $${panelGrand.toFixed(2)}`, pw / 2, y + 5.5, { align: 'center' });
    y += 14;

    // If there's room on page 1, items flow naturally; otherwise new page with header
    if (y > 200) {
      doc.addPage();
      y = 14;
      if (logoPng) {
        doc.addImage(logoPng, 'PNG', 14, y, 22, 22);
      }
      doc.setFontSize(14);
      doc.setTextColor(26, 95, 168);
      doc.text('Items by Panel', pw / 2, y + 8, { align: 'center' });
      y += 24;
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${project.project_name} — ID: ${project.id}`, 14, y);
      y += 8;
    }
  }

  for (const panel of panels) {
    if (y > 250) { doc.addPage(); y = 14; }

    const divisions = panel.divisions || [];
    let hasItems = divisions.some(d => {
      if (type === 'client') return (d.items || []).some(i => i.visible_in_client_pdf !== 0);
      return d.items?.length;
    });
    if (!hasItems) continue;

    // Panel header
    doc.setFillColor(26, 95, 168);
    doc.roundedRect(14, y, pw - 28, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    const panelLabel = `Panel #${panel.panel_number}${panel.panel_name ? ' — ' + panel.panel_name : ''}  ${panel.is_completed ? '✓ COMPLETE' : ''}`;
    doc.text(panelLabel, 18, y + 5.5);
    if (type === 'owner') {
      doc.setFontSize(7);
      doc.text(`mkP:${panel.markupP}%  mkM:${panel.markupM}%  Man:${panel.manpower_pct}%`, pw - 18, y + 5.5, { align: 'right' });
    }
    y += 11;

    for (const div of divisions) {
      const items = div.items || [];
      const visibleItems = type === 'client' ? items.filter(i => i.visible_in_client_pdf !== 0) : items;
      if (!visibleItems.length) continue;

      if (y > 260) { doc.addPage(); y = 14; }

      // Division header
      doc.setDrawColor(200);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(16, y, pw - 32, 6, 1, 1, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.text(`${div.division_type}  (${visibleItems.length} items)`, 19, y + 4);
      if (type === 'owner') {
        doc.setFontSize(7);
        doc.text(`mkP:${div.markupP}%  mkM:${div.markupM}%  Man:${div.manpower_pct}%`, pw - 19, y + 4, { align: 'right' });
      }
      y += 8;

      // Items table
      const body = visibleItems.map(item => {
        const base = parseFloat(item.base_price_usd) || 0;
        const qty = item.qty || 1;
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

        if (type === 'owner') {
          grandTotal += finalPrice;
          grandCost += cost;
          return [name, `x${qty}`, `$${base.toFixed(2)}`, `${item.markupP_pct}%`, `${item.discount_pct}%`, `${item.manpower_pct}%`, `${item.markupM_pct}%`, `$${finalPrice.toFixed(2)}`, `$${cost.toFixed(2)}`, profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`];
        } else {
          return [name, `x${qty}`];
        }
      });

      if (type === 'owner') {
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
            if (data.section === 'body' && data.column.index === 9) {
              const val = data.cell.raw;
              if (typeof val === 'string') {
                if (val.startsWith('+')) data.cell.styles.textColor = [34, 197, 94];
                else if (val.startsWith('-')) data.cell.styles.textColor = [239, 68, 68];
              }
            }
          },
        });
      } else {
        autoTable(doc, {
          startY: y,
          head: [['Item', 'Qty']],
          body,
          theme: 'grid',
          headStyles: { fontSize: 7, fillColor: [71, 85, 105], textColor: 255, halign: 'center' },
          bodyStyles: { fontSize: 7 },
          columnStyles: { 0: { cellWidth: 100 } },
          margin: { left: 16, right: 16 },
          tableWidth: pw - 32,
        });
      }
      y = doc.lastAutoTable.finalY + 4;
    }
  }

  // ── Grand total + Cost summary (owner only) ──
  if (type === 'owner') {
    if (y > 260) { doc.addPage(); y = 14; }
    const netProfit = grandTotal - grandCost;
    doc.setDrawColor(26, 95, 168);
    doc.setFillColor(26, 95, 168);
    doc.roundedRect(14, y, pw - 28, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(`GRAND TOTAL: $${grandTotal.toFixed(2)}`, pw / 2, y + 7, { align: 'center' });
    y += 12;

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
    if (y > 260) { doc.addPage(); y = 14; }
    // Build brand aggregates
    const brandMap = {};
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          const brand = item.is_manual ? (item.custom_brand || 'Unbranded') : (item.brand_name || 'Unbranded');
          const base = parseFloat(item.base_price_usd) || 0;
          const qty = item.qty || 1;
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

    // Per-item profit breakdown for owner
    if (y > 270) { doc.addPage(); y = 14; }
    const profitRows = [];
    for (const panel of panels) {
      for (const div of panel.divisions || []) {
        for (const item of div.items || []) {
          const base = parseFloat(item.base_price_usd) || 0;
          const qty = item.qty || 1;
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
  }

  // ── Footer with page numbers ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Generated on ${today}  |  HORIZON Engineering & Contracting  |  Page ${i} of ${totalPages}`, pw / 2, 285, { align: 'center' });
  }

  const suffix = type === 'owner' ? 'owner' : 'client';
  doc.save(`project_${project.id}_${suffix}_${(project.project_name || 'report').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
}
