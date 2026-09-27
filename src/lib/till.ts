// ============================================================================
// TILL — products, sales, refunds, stock, cash-up data layer (Firestore)
// ============================================================================
// Collections:
//   products/{id}            catalogue + stock
//   sales/{id}               till sales AND refunds (type: 'sale' | 'refund')
//   stockMovements/{id}      audit trail of every stock change
//   cashups/{YYYY-MM-DD}     opening float + end-of-day cash-up (one per day)
//   counters/receipts        { next: number } sequential receipt numbers
//   settings/vat             VatSettings
// Dispense orders stay in dispenseOrders — their payments are pulled into the
// cash-up and VAT report, and they get receipts, but they're never copied.
// ============================================================================

import { db } from './firebase';
import {
  collection, doc, getDoc, getDocs, query, where, runTransaction, serverTimestamp, setDoc, addDoc, increment
} from 'firebase/firestore';
import {
  analyseLine, analyseDispenseOrder, sumBreakdowns, scaleBreakdown, round2, emptyBreakdown, DEFAULT_VAT_SETTINGS,
  type VatBreakdown, type VatCategory, type DispenseKind, type VatSettings
} from './vat';

export type TillPaymentMethod =
  'Cash' | 'Card' | 'Debit Card' | 'Credit Card' | 'Klarna/Clearpay' | 'GOS1 Voucher' | 'GOS3 Voucher';

// What staff can pick at the till. Debit vs credit is split at cash-up from
// the card terminal's end-of-day report, so the till just records "Card".
export const TILL_TENDERS: TillPaymentMethod[] = ['Cash', 'Card', 'Klarna/Clearpay', 'GOS1 Voucher', 'GOS3 Voucher'];

export const isCardMethod = (m: string) => m === 'Card' || m === 'Debit Card' || m === 'Credit Card';
export const isVoucherMethod = (m: string) => m === 'GOS1 Voucher' || m === 'GOS3 Voucher';

export const PRODUCT_CATEGORIES = [
  'Eye Examinations', 'Clinical Services', 'Contact Lens Fitting', 'Contact Lenses', 'Contact Lens Solutions',
  'Frames', 'Sunglasses', 'Accessories', 'Cases & Cloths', 'Hearing', 'Other'
];

export interface Product {
  id: string;
  name: string;
  category: string;
  sku: string;
  barcode: string;
  price: number;              // VAT-inclusive selling price
  costPrice: number;          // optional, ex-VAT
  vatCategory: VatCategory;
  dispenseKind: DispenseKind; // only used when vatCategory === 'dispensed'
  trackStock: boolean;
  stockQty: number;
  lowStockThreshold: number;
  active: boolean;
  allowPriceOverride: boolean;
}

export const blankProduct = (): Omit<Product, 'id'> => ({
  name: '', category: 'Accessories', sku: '', barcode: '', price: 0, costPrice: 0,
  vatCategory: 'standard', dispenseKind: 'spectacles', trackStock: false, stockQty: 0,
  lowStockThreshold: 0, active: true, allowPriceOverride: true
});

export interface SaleLine {
  productId: string | null;
  name: string;
  category: string;
  qty: number;
  unitPrice: number;       // VAT-inclusive, before discount
  discount: number;        // £ off this line (total, not per unit)
  gross: number;           // qty × unitPrice − discount
  vatCategory: VatCategory;
  dispenseKind: DispenseKind;
  trackStock: boolean;
  breakdown: VatBreakdown;
}

export interface SalePayment {
  id: string;
  method: TillPaymentMethod;
  amount: number;          // amount applied to the sale (cash: after change)
  reference?: string;      // voucher serial etc.
  refundOfPaymentId?: string;
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
  address: string;
  patientId: string | null;
  patientNumber?: string;
}

export const blankCustomer = (): Customer => ({ name: '', email: '', phone: '', address: '', patientId: null });

export const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

// Business dates are always Europe/London, regardless of the PC's locale.
export const londonDate = (d: Date | string | number = new Date()): string => {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

export const ukDateTime = (d: Date | string | number): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

export const formatReceiptNumber = (n: number) => `R-${String(n).padStart(6, '0')}`;

// ----------------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------------
export const loadVatSettings = async (): Promise<VatSettings> => {
  const snap = await getDoc(doc(db, 'settings', 'vat'));
  return { ...DEFAULT_VAT_SETTINGS, ...(snap.exists() ? snap.data() as Partial<VatSettings> : {}) };
};

export const saveVatSettings = async (s: VatSettings) => {
  await setDoc(doc(db, 'settings', 'vat'), { ...s, updatedAt: serverTimestamp() }, { merge: true });
};

// ----------------------------------------------------------------------------
// Line building
// ----------------------------------------------------------------------------
export const buildLine = (
  p: { id?: string | null; name: string; category: string; vatCategory: VatCategory; dispenseKind: DispenseKind; trackStock: boolean },
  qty: number, unitPrice: number, discount: number, s: VatSettings
): SaleLine => {
  const gross = round2(Math.max(0, qty * unitPrice - discount));
  return {
    productId: p.id || null,
    name: p.name,
    category: p.category,
    qty, unitPrice: round2(unitPrice), discount: round2(discount), gross,
    vatCategory: p.vatCategory,
    dispenseKind: p.dispenseKind,
    trackStock: !!p.trackStock && !!p.id,
    breakdown: analyseLine(gross, p.vatCategory, s, p.dispenseKind)
  };
};

// ----------------------------------------------------------------------------
// Sales
// ----------------------------------------------------------------------------
export interface NewSaleInput {
  lines: SaleLine[];
  payments: SalePayment[];
  customer: Customer;
  staffName: string;
  staffEmail: string;
  cashTendered: number;
  changeGiven: number;
  notes: string;
}

// Allocates a receipt number, decrements stock and writes the sale atomically.
export const createSale = async (input: NewSaleInput): Promise<{ id: string; receiptNumber: string }> => {
  const totals = sumBreakdowns(input.lines.map(l => l.breakdown));
  const saleRef = doc(collection(db, 'sales'));
  const counterRef = doc(db, 'counters', 'receipts');
  const now = new Date();

  const receiptNumber = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const next = counterSnap.exists() ? Number(counterSnap.data().next) || 1 : 1;

    const stockLines = input.lines.filter(l => l.trackStock && l.productId);
    const productSnaps = await Promise.all(stockLines.map(l => tx.get(doc(db, 'products', l.productId!))));

    const rn = formatReceiptNumber(next);
    tx.set(counterRef, { next: next + 1 }, { merge: true });

    stockLines.forEach((l, i) => {
      if (productSnaps[i].exists()) tx.update(productSnaps[i].ref, { stockQty: increment(-l.qty) });
    });

    tx.set(saleRef, {
      type: 'sale',
      receiptNumber: rn,
      date: londonDate(now),
      createdAtIso: now.toISOString(),
      createdAt: serverTimestamp(),
      staffName: input.staffName,
      staffEmail: input.staffEmail,
      customer: input.customer,
      lines: input.lines,
      totals,
      payments: input.payments,
      cashTendered: round2(input.cashTendered),
      changeGiven: round2(input.changeGiven),
      notes: input.notes,
      refundedTotal: 0
    });
    return rn;
  });

  // Stock audit trail — outside the transaction (non-critical).
  await Promise.all(input.lines.filter(l => l.trackStock && l.productId).map(l =>
    addDoc(collection(db, 'stockMovements'), {
      productId: l.productId, productName: l.name, change: -l.qty, reason: 'Sale',
      reference: receiptNumber, staffName: input.staffName, createdAt: serverTimestamp(), createdAtIso: now.toISOString()
    })
  ));

  return { id: saleRef.id, receiptNumber };
};

export interface RefundInput {
  original: any;                         // the sale doc (with id)
  lineQtys: number[];                    // qty to refund per original line
  allocations: { paymentId: string; amount: number }[]; // how much goes back to each original tender
  restock: boolean;
  reason: string;
  staffName: string;
  staffEmail: string;
}

// Refunds always go back to the ORIGINAL payment method(s).
export const createRefund = async (input: RefundInput, s: VatSettings): Promise<{ id: string; receiptNumber: string }> => {
  const o = input.original;
  const lines: SaleLine[] = (o.lines as SaleLine[]).map((l, i) => {
    const q = input.lineQtys[i] || 0;
    if (q <= 0) return null;
    // Refund the same per-unit amount the customer actually paid (discount pro-rated).
    const perUnitPaid = l.qty > 0 ? l.gross / l.qty : 0;
    const gross = -round2(perUnitPaid * q);
    return { ...l, qty: -q, discount: 0, unitPrice: round2(perUnitPaid), gross, breakdown: analyseLine(gross, l.vatCategory, s, l.dispenseKind) };
  }).filter(Boolean) as SaleLine[];

  const totals = sumBreakdowns(lines.map(l => l.breakdown));
  const origPayments: SalePayment[] = o.payments || [];
  const payments: SalePayment[] = input.allocations
    .filter(a => a.amount > 0)
    .map(a => {
      const op = origPayments.find(p => p.id === a.paymentId)!;
      return { id: genId(), method: op.method, amount: -round2(a.amount), reference: op.reference || '', refundOfPaymentId: op.id };
    });

  const saleRef = doc(collection(db, 'sales'));
  const counterRef = doc(db, 'counters', 'receipts');
  const origRef = doc(db, 'sales', o.id);
  const now = new Date();
  const stockLines = lines.filter(l => input.restock && l.trackStock && l.productId);

  const receiptNumber = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const origSnap = await tx.get(origRef);
    const productSnaps = await Promise.all(stockLines.map(l => tx.get(doc(db, 'products', l.productId!))));
    const next = counterSnap.exists() ? Number(counterSnap.data().next) || 1 : 1;
    const rn = formatReceiptNumber(next);

    const alreadyRefunded = Number(origSnap.data()?.refundedTotal) || 0;
    if (round2(alreadyRefunded + Math.abs(totals.gross)) > round2(Number(origSnap.data()?.totals?.gross) || 0) + 0.001) {
      throw new Error('This would refund more than the original sale total.');
    }

    tx.set(counterRef, { next: next + 1 }, { merge: true });
    stockLines.forEach((l, i) => {
      if (productSnaps[i].exists()) tx.update(productSnaps[i].ref, { stockQty: increment(Math.abs(l.qty)) });
    });

    // Track refunded qty per line on the original so it can't be double-refunded.
    const refundedQtys: number[] = (origSnap.data()?.refundedQtys as number[]) || (o.lines || []).map(() => 0);
    const newRefundedQtys = (o.lines || []).map((_: any, i: number) => (refundedQtys[i] || 0) + (input.lineQtys[i] || 0));

    const refundedByPayment: Record<string, number> = { ...(origSnap.data()?.refundedByPayment || {}) };
    for (const a of input.allocations) {
      if (a.amount <= 0) continue;
      const op = origPayments.find(p => p.id === a.paymentId);
      const already = refundedByPayment[a.paymentId] || 0;
      if (!op || round2(already + a.amount) > round2(op.amount) + 0.001) {
        throw new Error(`Refund to ${op?.method || 'a payment'} exceeds what was originally paid that way.`);
      }
      refundedByPayment[a.paymentId] = round2(already + a.amount);
    }

    tx.update(origRef, {
      refundedByPayment,
      refundedTotal: round2(alreadyRefunded + Math.abs(totals.gross)),
      refundedQtys: newRefundedQtys,
      refundIds: [...(origSnap.data()?.refundIds || []), saleRef.id]
    });

    tx.set(saleRef, {
      type: 'refund',
      refundOf: o.id,
      refundOfReceipt: o.receiptNumber,
      receiptNumber: rn,
      date: londonDate(now),
      createdAtIso: now.toISOString(),
      createdAt: serverTimestamp(),
      staffName: input.staffName,
      staffEmail: input.staffEmail,
      customer: o.customer,
      lines,
      totals,
      payments,
      reason: input.reason,
      restocked: input.restock
    });
    return rn;
  });

  await Promise.all(stockLines.map(l =>
    addDoc(collection(db, 'stockMovements'), {
      productId: l.productId, productName: l.name, change: Math.abs(l.qty), reason: 'Refund (restocked)',
      reference: receiptNumber, staffName: input.staffName, createdAt: serverTimestamp(), createdAtIso: now.toISOString()
    })
  ));

  return { id: saleRef.id, receiptNumber };
};

export const fetchSale = async (id: string): Promise<any | null> => {
  const snap = await getDoc(doc(db, 'sales', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const fetchSalesForRange = async (from: string, to: string): Promise<any[]> => {
  const q = query(collection(db, 'sales'), where('date', '>=', from), where('date', '<=', to));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAtIso || '').localeCompare(a.createdAtIso || ''));
};

// ----------------------------------------------------------------------------
// Stock adjustments
// ----------------------------------------------------------------------------
export const adjustStock = async (product: Product, change: number, reason: string, staffName: string) => {
  const now = new Date();
  await setDoc(doc(db, 'products', product.id), { stockQty: increment(change), updatedAt: serverTimestamp() }, { merge: true });
  await addDoc(collection(db, 'stockMovements'), {
    productId: product.id, productName: product.name, change, reason, reference: '', staffName,
    createdAt: serverTimestamp(), createdAtIso: now.toISOString()
  });
};

// ----------------------------------------------------------------------------
// Dispense orders — payments + receipt numbers
// ----------------------------------------------------------------------------
// Payment date = when the money actually landed (completedAt for Klarna links
// that complete later, otherwise createdAt).
const paymentDate = (p: any): string => {
  const raw = p.completedAt?.toDate ? p.completedAt.toDate() : (p.completedAt || p.createdAt);
  return raw ? londonDate(raw) : '';
};

export interface TakingEntry {
  source: 'till' | 'order';
  refId: string;
  receiptNumber: string;
  label: string;
  method: string;
  amount: number;
  date: string;
  time: string;
  reference?: string;
}

export const orderPaymentsForRange = (orders: any[], from: string, to: string): TakingEntry[] => {
  const out: TakingEntry[] = [];
  for (const o of orders) {
    for (const p of (o.payments || [])) {
      if (p.status !== 'completed') continue;
      const d = paymentDate(p);
      if (!d || d < from || d > to) continue;
      out.push({
        source: 'order', refId: o.id, receiptNumber: o.receiptNumber || `ORD-${o.id.slice(0, 8).toUpperCase()}`,
        label: o.patientName || 'Order', method: p.method, amount: round2(Number(p.amount) || 0),
        date: d, time: p.createdAt || '', reference: p.reference || ''
      });
    }
  }
  return out;
};

export const salePaymentsAsTakings = (sales: any[]): TakingEntry[] =>
  sales.flatMap(s => (s.payments || []).map((p: any) => ({
    source: 'till' as const, refId: s.id, receiptNumber: s.receiptNumber,
    label: s.type === 'refund' ? `Refund of ${s.refundOfReceipt}` : (s.customer?.name || 'Walk-in'),
    method: p.method, amount: round2(Number(p.amount) || 0), date: s.date, time: s.createdAtIso || '', reference: p.reference || ''
  })));

export const totalsByMethod = (entries: TakingEntry[]): Record<string, number> => {
  const t: Record<string, number> = {};
  for (const e of entries) t[e.method] = round2((t[e.method] || 0) + e.amount);
  return t;
};

// Gives an order a permanent sequential receipt number the first time a
// receipt is produced for it.
export const ensureOrderReceiptNumber = async (orderId: string): Promise<string> => {
  const orderRef = doc(db, 'dispenseOrders', orderId);
  const counterRef = doc(db, 'counters', 'receipts');
  return runTransaction(db, async (tx) => {
    const os = await tx.get(orderRef);
    const cs = await tx.get(counterRef);
    const existing = os.data()?.receiptNumber;
    if (existing) return existing as string;
    const next = cs.exists() ? Number(cs.data().next) || 1 : 1;
    const rn = formatReceiptNumber(next);
    tx.set(counterRef, { next: next + 1 }, { merge: true });
    tx.update(orderRef, { receiptNumber: rn });
    return rn;
  });
};

// ----------------------------------------------------------------------------
// VAT report — tax point = date of payment (deposits are taxed when paid).
// Till sales are paid in full at the sale, so their stored breakdown is used
// as-is. Order payments are analysed in proportion to the order's VAT mix.
// ----------------------------------------------------------------------------
export interface VatDayRow { date: string; till: VatBreakdown; orders: VatBreakdown; total: VatBreakdown }

export const buildVatReport = (sales: any[], orders: any[], from: string, to: string, s: VatSettings): VatDayRow[] => {
  const byDate: Record<string, { till: VatBreakdown[]; orders: VatBreakdown[] }> = {};
  const bucket = (d: string) => (byDate[d] ||= { till: [], orders: [] });

  for (const sale of sales) {
    if (sale.date < from || sale.date > to) continue;
    // Only count the paid element. Vouchers ARE consideration (paid by the NHS), so they count.
    bucket(sale.date).till.push(sale.totals || emptyBreakdown());
  }

  for (const o of orders) {
    const orderTotal = Number(o.total) || 0;
    if (orderTotal <= 0) continue;
    const analysis = analyseDispenseOrder(o, s).total;
    for (const p of (o.payments || [])) {
      if (p.status !== 'completed') continue;
      const d = paymentDate(p);
      if (!d || d < from || d > to) continue;
      bucket(d).orders.push(scaleBreakdown(analysis, (Number(p.amount) || 0) / orderTotal));
    }
  }

  return Object.keys(byDate).sort().map(date => {
    const till = sumBreakdowns(byDate[date].till);
    const ord = sumBreakdowns(byDate[date].orders);
    return { date, till, orders: ord, total: sumBreakdowns([till, ord]) };
  });
};

export { emptyBreakdown };
