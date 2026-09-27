import { useEffect, useState } from 'react';
import { RotateCcw, RefreshCw, Loader2 } from 'lucide-react';
import { fetchSalesForRange, fetchSale, createRefund, londonDate, ukDateTime, blankCustomer } from '../../lib/till';
import { gbp, round2, type VatSettings } from '../../lib/vat';
import { buildSaleReceiptPdf } from '../../lib/receipt';
import { btnGhost, btnDanger, btnPrimary, input, card, label, ReceiptActions, Modal, useStaffPicker } from './shared';
import { PatientPicker, linkSaleToPatient } from './PatientLink';

export default function SalesHistory({ settings, staffEmail }: { settings: VatSettings; staffEmail: string }) {
  const [from, setFrom] = useState(londonDate());
  const [to, setTo] = useState(londonDate());
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [refundFor, setRefundFor] = useState<any>(null);
  const [linkFor, setLinkFor] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try { setSales(await fetchSalesForRange(from, to)); }
    catch (e: any) { alert(`Couldn't load sales: ${e?.message || e}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase();
  const shown = sales.filter(s => !q || (s.receiptNumber || '').toLowerCase().includes(q) || (s.customer?.name || '').toLowerCase().includes(q) || (s.customer?.email || '').toLowerCase().includes(q));

  return (
    <div className={card}>
      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div><span className={label}>From</span><input type="date" className={input} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><span className={label}>To</span><input type="date" className={input} value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="flex-1 min-w-[200px]"><span className={label}>Search</span><input className={input} placeholder="Receipt no, name, email" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <button className={btnGhost} onClick={load}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2">Receipt</th><th>Time</th><th>Customer</th><th>Items</th><th>Paid by</th><th className="text-right">VAT</th><th className="text-right">Total</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(s => {
              const isRefund = s.type === 'refund';
              const fullyRefunded = !isRefund && round2(s.refundedTotal || 0) >= round2(s.totals?.gross || 0);
              return (
                <tr key={s.id} className={`border-t border-slate-100 align-top ${isRefund ? 'bg-red-50/40' : ''}`}>
                  <td className="py-2 font-bold">
                    {s.receiptNumber}
                    {isRefund && <div className="text-[10px] font-black text-red-600">REFUND of {s.refundOfReceipt}</div>}
                    {!isRefund && s.refundedTotal > 0 && <div className="text-[10px] font-black text-amber-600">{fullyRefunded ? 'Fully refunded' : `Refunded ${gbp(s.refundedTotal)}`}</div>}
                  </td>
                  <td className="text-xs text-slate-500">{s.createdAtIso ? ukDateTime(s.createdAtIso) : s.date}<div>{s.staffName}</div></td>
                  <td className="text-xs">
                    {s.customer?.name || <span className="text-slate-400">Walk-in</span>}
                    {s.customer?.patientId ? <div className="text-[10px] font-black text-[#3F9185]">CRM linked</div>
                      : <button className="block text-[10px] font-black text-[#3F9185] underline mt-0.5" onClick={() => setLinkFor(s)}>Link to patient</button>}
                  </td>
                  <td className="text-xs">{(s.lines || []).map((l: any, i: number) => <div key={i}>{Math.abs(l.qty)} × {l.name}</div>)}</td>
                  <td className="text-xs">{(s.payments || []).map((p: any) => <div key={p.id}>{p.method} {gbp(p.amount)}</div>)}</td>
                  <td className="text-right text-xs">{gbp(s.totals?.vat || 0)}</td>
                  <td className="text-right font-black">{gbp(s.totals?.gross || 0)}</td>
                  <td className="pl-3">
                    <div className="flex flex-col gap-1 items-end">
                      <ReceiptActions compact receiptNumber={s.receiptNumber} email={s.customer?.email} patientId={s.customer?.patientId} name={s.customer?.name} isRefund={isRefund}
                        build={async () => ({ doc: await buildSaleReceiptPdf(s, settings), receiptNumber: s.receiptNumber })} />
                      {!isRefund && !fullyRefunded && <button className={btnDanger} onClick={() => setRefundFor(s)}><RotateCcw size={12} /> Refund</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={8} className="text-center text-slate-400 py-8">{loading ? 'Loading…' : 'No sales in this range'}</td></tr>}
          </tbody>
        </table>
      </div>

      {linkFor && (
        <Modal title={`Link ${linkFor.receiptNumber} to a patient`} onClose={() => setLinkFor(null)}>
          <p className="text-xs text-slate-500 mb-3">Search the CRM and pick the patient this sale belongs to.</p>
          <PatientPicker value={blankCustomer()} onClear={() => {}}
            onPick={async p => {
              try { await linkSaleToPatient(linkFor.id, p); setLinkFor(null); load(); }
              catch (e: any) { alert(`Couldn't link: ${e?.message || e}`); }
            }} />
          <div className="mt-3 text-right"><button className={btnGhost} onClick={() => setLinkFor(null)}>Cancel</button></div>
        </Modal>
      )}

      {refundFor && (
        <RefundModal sale={refundFor} settings={settings} staffEmail={staffEmail}
          onClose={() => setRefundFor(null)} onDone={() => { setRefundFor(null); load(); }} />
      )}
    </div>
  );
}

function RefundModal({ sale, settings, staffEmail, onClose, onDone }: {
  sale: any; settings: VatSettings; staffEmail: string; onClose: () => void; onDone: () => void;
}) {
  const refundedQtys: number[] = sale.refundedQtys || (sale.lines || []).map(() => 0);
  const refundedByPayment: Record<string, number> = sale.refundedByPayment || {};
  const [qtys, setQtys] = useState<number[]>((sale.lines || []).map(() => 0));
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<any>(null);
  const { staffModal, askStaff } = useStaffPicker(settings.staffNames);

  const refundTotal = round2((sale.lines || []).reduce((t: number, l: any, i: number) => t + (l.qty > 0 ? (l.gross / l.qty) * (qtys[i] || 0) : 0), 0));
  const allocTotal = round2(Object.values(alloc).reduce((t, v) => t + (Number(v) || 0), 0));

  // Pre-fill: allocate back to original tenders in order, capped at what's left on each.
  const autoAllocate = (total: number) => {
    let left = total;
    const next: Record<string, string> = {};
    for (const p of sale.payments || []) {
      const cap = round2((p.amount || 0) - (refundedByPayment[p.id] || 0));
      const take = round2(Math.min(cap, left));
      next[p.id] = take > 0 ? take.toFixed(2) : '';
      left = round2(left - Math.max(0, take));
    }
    setAlloc(next);
  };

  const setQty = (i: number, v: number) => {
    const next = [...qtys];
    next[i] = v;
    setQtys(next);
    const total = round2((sale.lines || []).reduce((t: number, l: any, j: number) => t + (l.qty > 0 ? (l.gross / l.qty) * (next[j] || 0) : 0), 0));
    autoAllocate(total);
  };

  const submit = async () => {
    if (refundTotal <= 0) { alert('Choose at least one item to refund.'); return; }
    if (Math.abs(allocTotal - refundTotal) > 0.009) { alert(`The refund split (${gbp(allocTotal)}) must equal the refund total (${gbp(refundTotal)}).`); return; }
    if (!reason.trim()) { alert('Enter a reason for the refund.'); return; }
    const staffName = await askStaff(`Who is processing this ${gbp(refundTotal)} refund?`, 'Confirm refund');
    if (!staffName) return;
    setSaving(true);
    try {
      const res = await createRefund({
        original: sale, lineQtys: qtys,
        allocations: Object.entries(alloc).map(([paymentId, v]) => ({ paymentId, amount: round2(Number(v) || 0) })),
        restock, reason: reason.trim(), staffName, staffEmail
      }, settings);
      setDone({ ...res, total: refundTotal });
    } catch (e: any) {
      alert(`Refund failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Modal title={`Refund ${done.receiptNumber} recorded`} onClose={onDone}>
        <div className="space-y-4">
          <p className="text-sm">Refund <b>{gbp(done.total)}</b> to the original payment method(s): {Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([id, v]) => `${(sale.payments || []).find((p: any) => p.id === id)?.method} ${gbp(Number(v))}`).join(', ')}.</p>
          <p className="text-xs text-slate-500">Card refunds: process on the card terminal. Klarna/Clearpay: refund in Stripe.</p>
          <ReceiptActions receiptNumber={done.receiptNumber} email={sale.customer?.email} patientId={sale.customer?.patientId} name={sale.customer?.name} isRefund
            build={async () => {
              const refundDoc = await fetchSale(done.id);
              if (!refundDoc) throw new Error('Refund not found yet — try again from Sales history.');
              return { doc: await buildSaleReceiptPdf(refundDoc, settings), receiptNumber: done.receiptNumber };
            }} />
          <button className={`${btnPrimary} w-full justify-center`} onClick={onDone}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Refund ${sale.receiptNumber}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <span className={label}>Items to refund</span>
          {(sale.lines || []).map((l: any, i: number) => {
            const max = l.qty - (refundedQtys[i] || 0);
            return (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-100 text-sm">
                <span className="flex-1">{l.name} <span className="text-slate-400 text-xs">({l.qty} sold, {gbp(l.gross)}{refundedQtys[i] ? `, ${refundedQtys[i]} already refunded` : ''})</span></span>
                <input type="number" min={0} max={max} disabled={max <= 0} className="w-20 p-1.5 rounded-lg border border-slate-200 text-sm font-bold text-center"
                  value={qtys[i] || ''} placeholder="0"
                  onChange={e => setQty(i, Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
              </div>
            );
          })}
          <div className="text-right font-black mt-2">Refund total: {gbp(refundTotal)}</div>
        </div>

        <div>
          <span className={label}>Refund to original payment method</span>
          {(sale.payments || []).map((p: any) => {
            const cap = round2((p.amount || 0) - (refundedByPayment[p.id] || 0));
            return (
              <div key={p.id} className="flex items-center gap-3 py-1 text-sm">
                <span className="flex-1">{p.method}{p.reference ? ` (${p.reference})` : ''} <span className="text-slate-400 text-xs">— paid {gbp(p.amount)}, refundable {gbp(cap)}</span></span>
                <input type="number" step="0.01" min={0} max={cap} disabled={cap <= 0} className="w-28 p-1.5 rounded-lg border border-slate-200 text-sm font-bold text-right"
                  value={alloc[p.id] || ''} onChange={e => setAlloc({ ...alloc, [p.id]: e.target.value })} />
              </div>
            );
          })}
          {Math.abs(allocTotal - refundTotal) > 0.009 && refundTotal > 0 && <p className="text-xs text-red-600 font-bold mt-1">Split {gbp(allocTotal)} ≠ refund {gbp(refundTotal)}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} /> Return items to stock</label>
        <input className={input} placeholder="Reason for refund (required)" value={reason} onChange={e => setReason(e.target.value)} />
        <div className="flex gap-2">
          <button className={btnDanger} onClick={submit} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Confirm refund {gbp(refundTotal)}</button>
          <button className={btnGhost} onClick={onClose}>Cancel</button>
        </div>
      </div>
      {staffModal}
    </Modal>
  );
}
