import { useState } from 'react';
import { Wallet, RotateCcw, Loader2 } from 'lucide-react';
import { doc, setDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { genId, ensureOrderReceiptNumber, ukDateTime, isVoucherMethod } from '../../lib/till';
import { analyseDispenseOrder, gbp, round2, type VatSettings } from '../../lib/vat';
import { buildOrderReceiptPdf } from '../../lib/receipt';
import { btnGhost, btnDanger, btnPrimary, input, card, label, ReceiptActions, Modal, useStaffPicker } from './shared';

// Order payment methods — Debit/Credit kept for compatibility with the
// existing Orders screen; the till itself records "Card".
const ORDER_TENDERS = ['Cash', 'Card', 'GOS3 Voucher', 'GOS1 Voucher', 'Klarna/Clearpay'] as const;

const auditEntry = (event: string, detail = '') => ({ id: genId(), event, detail, timestamp: new Date().toISOString() });

const paidOf = (o: any) => round2((o.payments || []).filter((p: any) => p.status === 'completed').reduce((t: number, p: any) => t + (Number(p.amount) || 0), 0));

export default function OrdersTill({ orders, settings }: { orders: any[]; settings: VatSettings }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'balance' | 'all'>('balance');
  const [payFor, setPayFor] = useState<any>(null);
  const [refundFor, setRefundFor] = useState<any>(null);

  const q = search.trim().toLowerCase();
  const shown = orders.filter(o => {
    if (filter === 'balance' && round2((o.total || 0) - paidOf(o)) <= 0) return false;
    if (!q) return true;
    return (o.patientName || '').toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q)
      || o.id.toLowerCase().startsWith(q) || (o.receiptNumber || '').toLowerCase().includes(q);
  }).slice(0, 100);

  return (
    <div className={card}>
      <p className="text-xs text-slate-500 mb-3">Glasses orders come from the Dispensing → Orders screen. Payments taken here (or there) feed into the cash-up and VAT report automatically.</p>
      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div className="flex-1 min-w-[220px]"><span className={label}>Search</span><input className={input} placeholder="Patient, email, order ref, receipt no" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="flex gap-1">
          <button className={filter === 'balance' ? btnPrimary : btnGhost} onClick={() => setFilter('balance')}>Balance owing</button>
          <button className={filter === 'all' ? btnPrimary : btnGhost} onClick={() => setFilter('all')}>All orders</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2">Order</th><th>Patient</th><th>Items</th><th className="text-right">Total</th><th className="text-right">VAT</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(o => {
              const paid = paidOf(o);
              const bal = round2((o.total || 0) - paid);
              const vat = analyseDispenseOrder(o, settings).total.vat;
              return (
                <tr key={o.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 font-bold">{o.id.slice(0, 8).toUpperCase()}<div className="text-[10px] text-slate-400">{o.receiptNumber || ''}</div></td>
                  <td className="text-xs">{o.patientName}<div className="text-slate-400">{o.email}</div></td>
                  <td className="text-xs">{(o.items || []).length} pair{(o.items || []).length === 1 ? '' : 's'}</td>
                  <td className="text-right">{gbp(o.total || 0)}</td>
                  <td className="text-right text-xs">{gbp(vat)}</td>
                  <td className="text-right">{gbp(paid)}</td>
                  <td className={`text-right font-black ${bal > 0 ? 'text-red-600' : 'text-green-600'}`}>{gbp(bal)}</td>
                  <td className="pl-3">
                    <div className="flex flex-col gap-1 items-end">
                      <div className="flex gap-1">
                        {bal > 0 && <button className={btnPrimary} onClick={() => setPayFor(o)}><Wallet size={12} /> Take payment</button>}
                        {paid > 0 && <button className={btnDanger} onClick={() => setRefundFor(o)}><RotateCcw size={12} /> Refund</button>}
                      </div>
                      <ReceiptActions compact email={o.email} patientId={o.patientId} name={o.patientName}
                        build={async () => {
                          const rn = await ensureOrderReceiptNumber(o.id);
                          return { doc: await buildOrderReceiptPdf({ ...o, receiptNumber: rn }, rn, settings), receiptNumber: rn };
                        }} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={8} className="text-center text-slate-400 py-8">No matching orders</td></tr>}
          </tbody>
        </table>
      </div>

      {payFor && <PayModal order={payFor} staffNames={settings.staffNames} onClose={() => setPayFor(null)} />}
      {refundFor && <OrderRefundModal order={refundFor} staffNames={settings.staffNames} onClose={() => setRefundFor(null)} />}
    </div>
  );
}

function PayModal({ order, staffNames, onClose }: { order: any; staffNames: string[]; onClose: () => void }) {
  const { staffModal, askStaff } = useStaffPicker(staffNames);
  const bal = round2((order.total || 0) - paidOf(order));
  const [method, setMethod] = useState<(typeof ORDER_TENDERS)[number]>('Card');
  const [amount, setAmount] = useState(bal.toFixed(2));
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = round2(Number(amount));
    if (!(amt > 0)) { alert('Enter a valid amount.'); return; }
    if (amt > bal + 0.001) { alert(`That's more than the balance (${gbp(bal)}).`); return; }
    if (isVoucherMethod(method) && !reference.trim()) { alert('Enter the voucher reference/serial.'); return; }
    const staffName = await askStaff(`Who is taking this ${gbp(amt)} payment?`, 'Record payment');
    if (!staffName) return;
    setSaving(true);
    try {
      const record: any = { id: genId(), method, amount: amt, status: 'completed', createdAt: new Date().toISOString(), takenBy: staffName, via: 'till' };
      if (reference.trim()) record.reference = reference.trim();
      await setDoc(doc(db, 'dispenseOrders', order.id), {
        payments: arrayUnion(record),
        updatedAt: serverTimestamp(),
        auditLog: arrayUnion(auditEntry('Payment Recorded', `£${amt.toFixed(2)} via ${method}${reference ? ` (${reference})` : ''} — ${staffName} at till`))
      }, { merge: true });
      onClose();
    } catch (e: any) {
      alert(`Couldn't record payment: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Take payment — ${order.patientName}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-sm">Order total {gbp(order.total || 0)} · balance <b>{gbp(bal)}</b></div>
        <select className={input} value={method} onChange={e => setMethod(e.target.value as any)}>
          {ORDER_TENDERS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {method === 'Klarna/Clearpay' && <p className="text-xs text-amber-700">Only record Klarna/Clearpay here if it was taken outside the Stripe link. Links sent from the Orders screen record themselves.</p>}
        <input className={input} type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
        {isVoucherMethod(method) && <input className={input} placeholder="Voucher reference / serial" value={reference} onChange={e => setReference(e.target.value)} />}
        <button className={btnPrimary} onClick={submit} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />} Record {gbp(Number(amount) || 0)}</button>
        {staffModal}
      </div>
    </Modal>
  );
}

// Refunds go back to the ORIGINAL payment only — staff pick which payment.
function OrderRefundModal({ order, staffNames, onClose }: { order: any; staffNames: string[]; onClose: () => void }) {
  const { staffModal, askStaff } = useStaffPicker(staffNames);
  const payments = (order.payments || []).filter((p: any) => p.status === 'completed');
  const originals = payments.filter((p: any) => (Number(p.amount) || 0) > 0);
  const refundedFor = (id: string) => round2(payments.filter((p: any) => p.refundOfPaymentId === id).reduce((t: number, p: any) => t + Math.abs(Number(p.amount) || 0), 0));
  const [paymentId, setPaymentId] = useState(originals[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const orig = originals.find((p: any) => p.id === paymentId);
  const cap = orig ? round2(orig.amount - refundedFor(orig.id)) : 0;

  const submit = async () => {
    const amt = round2(Number(amount));
    if (!orig) { alert('Pick the original payment.'); return; }
    if (!(amt > 0) || amt > cap + 0.001) { alert(`Refund must be between £0.01 and ${gbp(cap)}.`); return; }
    if (!reason.trim()) { alert('Enter a reason.'); return; }
    const staffName = await askStaff(`Who is processing this ${gbp(amt)} refund?`, 'Record refund');
    if (!staffName) return;
    setSaving(true);
    try {
      const record = { id: genId(), method: orig.method, amount: -amt, status: 'completed', createdAt: new Date().toISOString(), refundOfPaymentId: orig.id, reason: reason.trim(), takenBy: staffName, via: 'till', ...(orig.reference ? { reference: orig.reference } : {}) };
      await setDoc(doc(db, 'dispenseOrders', order.id), {
        payments: arrayUnion(record),
        updatedAt: serverTimestamp(),
        auditLog: arrayUnion(auditEntry('Refund Recorded', `£${amt.toFixed(2)} back to ${orig.method} — ${reason.trim()} (${staffName})`))
      }, { merge: true });
      alert(`Refund recorded. Now refund ${gbp(amt)} to the customer's ${orig.method}${orig.method === 'Cash' ? ' from the till' : orig.method.includes('Card') ? ' on the card terminal' : orig.method === 'Klarna/Clearpay' ? ' in Stripe' : ''}.`);
      onClose();
    } catch (e: any) {
      alert(`Couldn't record refund: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Refund — ${order.patientName}`} onClose={onClose}>
      <div className="space-y-3">
        <span className={label}>Original payment (refund goes back to this method)</span>
        <select className={input} value={paymentId} onChange={e => setPaymentId(e.target.value)}>
          {originals.map((p: any) => <option key={p.id} value={p.id}>{p.method} {gbp(p.amount)} · {p.createdAt ? ukDateTime(p.createdAt) : ''} (refundable {gbp(round2(p.amount - refundedFor(p.id)))})</option>)}
        </select>
        <input className={input} type="number" step="0.01" placeholder={`Up to ${gbp(cap)}`} value={amount} onChange={e => setAmount(e.target.value)} />
        <input className={input} placeholder="Reason (required)" value={reason} onChange={e => setReason(e.target.value)} />
        <button className={btnDanger} onClick={submit} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Record refund</button>
        {staffModal}
      </div>
    </Modal>
  );
}
