// ============================================================================
// RECEIPTS — A4 VAT receipts (PDF) for till sales, refunds and dispense orders
// ============================================================================
// Meets full VAT invoice requirements (VAT Notice 700/21): sequential number,
// date/time, supplier name + address + VAT number, customer name (+ address
// when captured), description, quantity, unit price, VAT rate per line,
// net/VAT/gross per rate, and total VAT. Dispensed items show the goods and
// the exempt dispensing service as two separately disclosed charges
// (Revenue & Customs Brief 14/2020 — the till slip is the evidence).
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { analyseDispenseOrder, gbp, round2, type VatBreakdown, type VatSettings } from './vat';
import { ukDateTime } from './till';

const GREEN: [number, number, number] = [63, 145, 133];
const DARK: [number, number, number] = [30, 41, 59];
const GREY: [number, number, number] = [100, 116, 139];

let logoCache: string | null | undefined;
const loadLogo = async (): Promise<string | null> => {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
};

const lastY = (doc: jsPDF): number => (doc as any).lastAutoTable?.finalY ?? 60;

const header = async (doc: jsPDF, s: VatSettings, title: string, number: string, dateIso: string, dateLabel = 'Date / tax point') => {
  const logo = await loadLogo();
  if (logo) doc.addImage(logo, 'PNG', 14, 12, 52, 14);
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...GREEN); doc.text('The Eye Centre', 14, 22); }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY);
  const right = [s.companyName, ...s.addressLines, s.phone, s.email].filter(Boolean);
  right.forEach((line, i) => doc.text(line, 196, 14 + i * 4.2, { align: 'right' }));

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...DARK);
  doc.text(title, 14, 44);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
  doc.text(`Receipt no: ${number}`, 14, 50);
  doc.text(`${dateLabel}: ${ukDateTime(dateIso)}`, 14, 54.5);
  doc.text(`VAT reg no: ${s.vatNumber}`, 14, 59);
};

// Returns the y position the items table should start at.
const customerBlock = (doc: jsPDF, c: { name?: string; email?: string; phone?: string; address?: string; patientNumber?: string }): number => {
  if (!c || !(c.name || c.email || c.address)) return 66;
  doc.setFontSize(9); doc.setTextColor(...GREY); doc.setFont('helvetica', 'bold');
  doc.text('Customer', 196, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
  const lines = [c.name, c.patientNumber ? `Patient no. ${c.patientNumber}` : '', ...(c.address ? String(c.address).split(/\n|,\s*/) : []), c.email].filter(Boolean) as string[];
  const shown = lines.slice(0, 6);
  shown.forEach((l, i) => doc.text(l, 196, 49 + i * 4.2, { align: 'right' }));
  return Math.max(66, 49 + shown.length * 4.2 + 3);
};

const rateLabel = (kind: 'standard' | 'exempt' | 'zero', rate: number) =>
  kind === 'standard' ? `${rate}%` : kind === 'zero' ? '0%' : 'Exempt';

// Turns one analysed line into 1–3 printable rows.
const linesToRows = (label: string, qty: number, unit: number | null, b: VatBreakdown, rate: number, dispensed: boolean, isCL = false): any[][] => {
  const rows: any[][] = [];
  if (dispensed) {
    rows.push([{ content: label, styles: { fontStyle: 'bold' } }, String(qty), unit !== null ? gbp(unit) : '', '', '', gbp(b.gross)]);
    if (b.standardGross !== 0) rows.push([isCL ? '    Contact lenses — goods' : '    Optical appliance (frames / lenses) — goods', '', '', rateLabel('standard', rate), gbp(b.vat), gbp(b.standardGross)]);
    if (b.exemptGross !== 0) rows.push(['    Dispensing service by registered optician', '', '', 'Exempt', gbp(0), gbp(b.exemptGross)]);
    return rows;
  }
  const kind = b.standardGross !== 0 ? 'standard' : b.zeroGross !== 0 ? 'zero' : 'exempt';
  rows.push([label, String(qty), unit !== null ? gbp(unit) : '', rateLabel(kind, rate), gbp(b.vat), gbp(b.gross)]);
  return rows;
};

const itemsTable = (doc: jsPDF, rows: any[][], startY: number) => {
  autoTable(doc, {
    startY,
    head: [['Description', 'Qty', 'Unit price', 'VAT rate', 'VAT', 'Total (inc VAT)']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: GREEN, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 1: { halign: 'center', cellWidth: 12 }, 2: { halign: 'right', cellWidth: 24 }, 3: { halign: 'center', cellWidth: 20 }, 4: { halign: 'right', cellWidth: 20 }, 5: { halign: 'right', cellWidth: 30 } }
  });
};

const vatSummaryTable = (doc: jsPDF, t: VatBreakdown, rate: number) => {
  const body: any[][] = [];
  if (t.standardGross !== 0) body.push([`Standard rate ${rate}%`, gbp(t.standardNet), gbp(t.vat), gbp(t.standardGross)]);
  if (t.zeroGross !== 0) body.push(['Zero rate 0%', gbp(t.zeroGross), gbp(0), gbp(t.zeroGross)]);
  if (t.exemptGross !== 0) body.push(['Exempt', gbp(t.exemptGross), gbp(0), gbp(t.exemptGross)]);
  body.push([{ content: 'Total', styles: { fontStyle: 'bold' } }, { content: gbp(round2(t.standardNet + t.zeroGross + t.exemptGross)), styles: { fontStyle: 'bold' } }, { content: gbp(t.vat), styles: { fontStyle: 'bold' } }, { content: gbp(t.gross), styles: { fontStyle: 'bold' } }]);
  autoTable(doc, {
    startY: lastY(doc) + 6,
    margin: { left: 96 },
    head: [['VAT summary', 'Net', 'VAT', 'Gross']],
    body,
    theme: 'plain',
    headStyles: { fillColor: [241, 245, 249], textColor: DARK, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
  });
};

const paymentsTable = (doc: jsPDF, rows: any[][], title = 'Payments') => {
  if (!rows.length) return;
  autoTable(doc, {
    startY: lastY(doc) + 6,
    margin: { left: 96 },
    head: [[title, 'Amount']],
    body: rows,
    theme: 'plain',
    headStyles: { fillColor: [241, 245, 249], textColor: DARK, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 1: { halign: 'right' } }
  });
};

const footer = (doc: jsPDF, s: VatSettings, extra: string[] = []) => {
  const y = Math.max(lastY(doc) + 12, 250);
  doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal');
  const notes = [
    ...extra,
    'Eye examinations, contact lens fitting/aftercare and the dispensing of spectacles and contact lenses by a registered optician are exempt from VAT (VATA 1994, Sch 9, Group 7).',
    'Frames, lenses, contact lenses and accessories are standard-rated goods. Where applicable, the goods and dispensing charges are shown separately above.',
    `${s.companyName} · Registered in England & Wales no. ${s.companyNumber} · VAT reg no. ${s.vatNumber}`
  ];
  let yy = y;
  notes.forEach(n => {
    const wrapped = doc.splitTextToSize(n, 182);
    doc.text(wrapped, 14, yy);
    yy += wrapped.length * 3.4 + 1;
  });
};

const paymentLabel = (p: any) => `${p.method}${p.reference ? ` (${p.reference})` : ''}`;

// ----------------------------------------------------------------------------
export const buildSaleReceiptPdf = async (sale: any, s: VatSettings): Promise<jsPDF> => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const isRefund = sale.type === 'refund';
  await header(doc, s, isRefund ? 'REFUND RECEIPT (VAT CREDIT)' : 'VAT RECEIPT', sale.receiptNumber, sale.createdAtIso);
  const startY = customerBlock(doc, sale.customer || {});

  const rows: any[][] = [];
  for (const l of sale.lines || []) {
    const label = l.discount > 0 ? `${l.name} (discount ${gbp(l.discount)})` : l.name;
    rows.push(...linesToRows(label, l.qty, l.unitPrice, l.breakdown, s.vatRate, l.vatCategory === 'dispensed', l.dispenseKind === 'contactLenses'));
  }
  itemsTable(doc, rows, startY);
  vatSummaryTable(doc, sale.totals, s.vatRate);

  const pay = (sale.payments || []).map((p: any) => [paymentLabel(p), gbp(p.amount)]);
  if (!isRefund && sale.cashTendered > 0) pay.push(['Cash tendered', gbp(sale.cashTendered)], ['Change given', gbp(sale.changeGiven)]);
  paymentsTable(doc, pay, isRefund ? 'Refunded to' : 'Payments');

  footer(doc, s, isRefund
    ? [`Refund of receipt ${sale.refundOfReceipt}. Refunds are made to the original payment method.${sale.reason ? ` Reason: ${sale.reason}` : ''}`]
    : [`Served by ${sale.staffName || '—'}. Thank you for visiting The Eye Centre.`]);
  return doc;
};

export const buildOrderReceiptPdf = async (order: any, receiptNumber: string, s: VatSettings): Promise<jsPDF> => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const createdIso = order.createdAt?.toDate ? order.createdAt.toDate().toISOString() : new Date().toISOString();
  await header(doc, s, 'VAT RECEIPT — SPECTACLE ORDER', receiptNumber, createdIso, 'Order date');
  const startY = customerBlock(doc, { name: order.patientName, email: order.email, patientNumber: order.patientNumber });

  const analysis = analyseDispenseOrder(order, s);
  const rows: any[][] = [];
  (order.items || []).forEach((it: any, i: number) => {
    const discount = it.discountType && it.discountType !== 'none' ? round2((Number(it.subtotal) || 0) - (Number(it.total) || 0)) : 0;
    const label = discount > 0 ? `${analysis.items[i].label} (discount ${gbp(discount)})` : analysis.items[i].label;
    rows.push(...linesToRows(label, 1, Number(it.total) || 0, analysis.items[i].breakdown, s.vatRate, true));
  });
  itemsTable(doc, rows, startY);
  vatSummaryTable(doc, analysis.total, s.vatRate);

  const completed = (order.payments || []).filter((p: any) => p.status === 'completed');
  const paid = round2(completed.reduce((t: number, p: any) => t + (Number(p.amount) || 0), 0));
  const rowsPay = completed.map((p: any) => [`${p.amount < 0 ? 'Refund — ' : ''}${paymentLabel(p)} · ${p.createdAt ? ukDateTime(p.createdAt) : ''}`, gbp(p.amount)]);
  rowsPay.push([{ content: 'Total paid', styles: { fontStyle: 'bold' } }, { content: gbp(paid), styles: { fontStyle: 'bold' } }]);
  rowsPay.push([{ content: 'Balance due', styles: { fontStyle: 'bold' } }, { content: gbp(round2((Number(order.total) || 0) - paid)), styles: { fontStyle: 'bold' } }]);
  paymentsTable(doc, rowsPay);

  footer(doc, s, [`Order ref ${order.id.slice(0, 8).toUpperCase()}. VAT on deposits is accounted for when each payment is received.`]);
  return doc;
};

// ----------------------------------------------------------------------------
export const downloadPdf = (doc: jsPDF, filename: string) => doc.save(filename);

export const printPdf = (doc: jsPDF) => {
  const url = URL.createObjectURL(doc.output('blob'));
  const w = window.open(url, '_blank');
  if (w) w.addEventListener('load', () => { try { w.print(); } catch { /* user can print from viewer */ } });
};

export const pdfBase64 = (doc: jsPDF): string => doc.output('datauristring').split(',')[1];

// Sends the PDF as an attachment via the messaging Worker's
// "send_email_attachment" handler (see worker snippet in the deploy notes).
export const emailReceiptPdf = async (opts: { to: string; name: string; receiptNumber: string; doc: jsPDF; isRefund?: boolean }) => {
  const first = (opts.name || '').split(' ')[0] || 'there';
  const subject = `${opts.isRefund ? 'Your refund receipt' : 'Your receipt'} from The Eye Centre (${opts.receiptNumber})`;
  const html = `<p>Hi ${first},</p><p>Thank you for visiting The Eye Centre. Your ${opts.isRefund ? 'refund receipt' : 'VAT receipt'} <strong>${opts.receiptNumber}</strong> is attached as a PDF.</p><p>If you have any questions, call us on 0116 253 2788.</p><p>Kind regards,<br/>The Eye Centre</p>`;
  const res = await fetch('https://twilio.yaseen-hussain18.workers.dev/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'send_email',
      to_email: opts.to,
      patient_name: opts.name,
      subject,
      htmlContent: html,
      attachment: [{ name: `${opts.receiptNumber}.pdf`, content: pdfBase64(opts.doc) }]
    })
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text().catch(() => '')}`);
};
