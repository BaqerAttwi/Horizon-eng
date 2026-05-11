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

export async function exportProjectPdf(projectId) {
  const { data } = await api.get(`/projects/${projectId}/crm`);
  const project = data;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;

  // ── Logo ──
  const logoPng = await svgToPng(LOGO_SVG);
  if (logoPng) {
    doc.addImage(logoPng, 'PNG', 14, y, 22, 22);
  }
  doc.setFontSize(18);
  doc.setTextColor(26, 95, 168);
  doc.text('HORIZON Engineering & Contracting', pw / 2, y + 8, { align: 'center' });
  y += 16;

  // ── Project header ──
  doc.setDrawColor(26, 95, 168);
  doc.setFillColor(240, 244, 249);
  doc.roundedRect(14, y, pw - 28, 22, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('PROJECT REPORT', 18, y + 4);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(project.project_name || '', 18, y + 12);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const infoLine = `ID: ${project.id}  |  Engineer: ${project.engineer_name || '—'}  |  Client: ${project.client_name || '—'}  |  ${project.deadline ? 'Deadline: ' + project.deadline.split('T')[0] : ''}`;
  doc.text(infoLine, 18, y + 18);
  y += 30;

  // ── Status badges as text ──
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

  // ── Panels ──
  const panels = project.panels || [];
  let grandTotal = 0;

  for (const panel of panels) {
    if (y > 250) { doc.addPage(); y = 14; }

    // Panel header
    doc.setFillColor(26, 95, 168);
    doc.roundedRect(14, y, pw - 28, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    const panelLabel = `Panel #${panel.panel_number}${panel.panel_name ? ' — ' + panel.panel_name : ''}  ${panel.is_completed ? '✓ COMPLETE' : ''}`;
    doc.text(panelLabel, 18, y + 5.5);
    doc.setFontSize(7);
    doc.text(`mkP:${panel.markupP}%  mkM:${panel.markupM}%  Man:${panel.manpower_pct}%`, pw - 18, y + 5.5, { align: 'right' });
    y += 11;

    const divisions = panel.divisions || [];
    for (const div of divisions) {
      const items = div.items || [];
      if (!items.length) continue;

      if (y > 260) { doc.addPage(); y = 14; }

      // Division header
      doc.setDrawColor(200);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(16, y, pw - 32, 6, 1, 1, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.text(`${div.division_type}  (${items.length} items)  mkP:${div.markupP}%  mkM:${div.markupM}%  Man:${div.manpower_pct}%`, 19, y + 4);
      y += 8;

      // Items table
      const body = items.map(item => {
        const base = parseFloat(item.base_price_usd) || 0;
        const mkPAmt = base * (parseFloat(item.markupP_pct) / 100);
        const afterMkP = base + mkPAmt;
        const discAmt = afterMkP * (parseFloat(item.discount_pct) / 100);
        const tPrice = afterMkP - discAmt;
        const manAmt = base * (parseFloat(item.manpower_pct) / 100);
        const mkMAmt = tPrice * (parseFloat(item.markupM_pct) / 100);
        const finalPrice = (tPrice + manAmt + mkMAmt) * (item.qty || 1);
        const name = item.is_manual ? (item.custom_name || 'Manual') : item.reference;
        const qty = item.qty || 1;
        grandTotal += finalPrice;
        return [name, `x${qty}`, `$${base.toFixed(2)}`, `${item.markupP_pct}%`, `${item.discount_pct}%`, `${item.manpower_pct}%`, `${item.markupM_pct}%`, `$${finalPrice.toFixed(2)}`];
      });

      autoTable(doc, {
        startY: y,
        head: [['Item', 'Qty', 'Base $', 'mkP', 'Disc', 'Man', 'mkM', 'Total $']],
        body,
        theme: 'grid',
        headStyles: { fontSize: 7, fillColor: [71, 85, 105], textColor: 255, halign: 'center' },
        bodyStyles: { fontSize: 7 },
        columnStyles: { 0: { cellWidth: 60 }, 7: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 16, right: 16 },
        tableWidth: pw - 32,
      });
      y = doc.lastAutoTable.finalY + 4;
    }
  }

  // ── Grand total ──
  if (y > 270) { doc.addPage(); y = 14; }
  doc.setDrawColor(26, 95, 168);
  doc.setFillColor(26, 95, 168);
  doc.roundedRect(14, y, pw - 28, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`GRAND TOTAL: $${grandTotal.toFixed(2)}`, pw / 2, y + 7, { align: 'center' });
  y += 16;

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Generated on ${today}  |  HORIZON Engineering & Contracting`, pw / 2, 285, { align: 'center' });

  doc.save(`project_${project.id}_${(project.project_name || 'report').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
}
