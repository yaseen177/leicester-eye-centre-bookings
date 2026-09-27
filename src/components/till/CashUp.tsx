import { useEffect, useMemo, useState } from 'react';
import { Lock, Unlock, Loader2, Plus, Trash2, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { doc, onSnapshot, setDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs, arrayUnion } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../../lib/firebase';
import { fetchSalesForRange, orderPaymentsForRange, salePaymentsAsTakings, totalsByMethod, londonDate, ukDateTime, genId, isCardMethod, isVoucherMethod, type TakingEntry } from '../../lib/till';
import { gbp, round2, type VatSettings } from '../../lib/vat';
import { btnGhost, btnDanger, btnPrimary, input, card, label, DenominationCounter, blankCounts, countTotal, useStaffPicker, type DenomCounts } from './shared';

interface PaidOut { id: string; description: string; amount: number; staffName: string; at: string }

export default function CashUp({ orders, settings, staffEmail }: { orders: any[]; settings: VatSettings; staffEmail: string }) {
  const { staffModal, askStaff } = useStaffPicker(settings.staffNames);
  const [date, setDate] = useState(londonDate());
  const [record, setRecord] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [prevFloat, setPrevFloat] = useState<{ amount: number; counts: DenomCounts } | null>(null);

  const [openCounts, setOpenCounts] = useState<DenomCounts>(blankCounts());
  const [closeCounts, setCloseCounts] = useState<DenomCounts>(blankCounts());
  const [debitTotal, setDebitTotal] = useState('');
  const [creditTotal, setCreditTotal] = useState('');
  const [floatLeft, setFloatLeft] = useState('');
  const [reason, setReason] = useState('');
  const [signOff, setSignOff] = useState('');
  const [vouchersChecked, setVouchersChecked] = useState(false);
  const [po, setPo] = useState({ description: '', amount: '' });
  const [saving, setSaving] = useState(false);
  const [showTx, setShowTx] = useState(false);

  // Live cash-up doc for the day
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cashups', date), snap => setRecord(snap.exists() ? snap.data() : null));
    return () => unsub();
  }, [date]);

  // Previous day's float left in the till (suggested opening float)
  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, 'cashups'), where('date', '<', date), orderBy('date', 'desc'), limit(1));
        const snap = await getDocs(qy);
        const d = snap.docs[0]?.data();
        setPrevFloat(d?.closing ? { amount: Number(d.closing.floatLeft) || 0, counts: d.closing.floatLeftCounts || null } : null);
      } catch { setPrevFloat(null); }
    })();
  }, [date]);

  const loadSales = async () => {
    setLoadingSales(true);
    try { setSales(await fetchSalesForRange(date, date)); } finally { setLoadingSales(false); }
  };
  useEffect(() => { loadSales(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const takings: TakingEntry[] = useMemo(() => [...salePaymentsAsTakings(sales), ...orderPaymentsForRange(orders, date, date)]
    .sort((a, b) => (a.time || '').localeCompare(b.time || '')), [sales, orders, date]);
  const byMethod = totalsByMethod(takings);
  const sumWhere = (fn: (m: string) => boolean) => round2(Object.entries(byMethod).filter(([m]) => fn(m)).reduce((t, [, v]) => t + v, 0));

  const cashTakings = sumWhere(m => m === 'Cash');
  const cardTakings = sumWhere(isCardMethod);
  const bnplTakings = sumWhere(m => m === 'Klarna/Clearpay');
  const gos1 = sumWhere(m => m === 'GOS1 Voucher');
  const gos3 = sumWhere(m => m === 'GOS3 Voucher');
  const otherTakings = sumWhere(m => m !== 'Cash' && !isCardMethod(m) && m !== 'Klarna/Clearpay' && !isVoucherMethod(m));
  const grandTotal = round2(Object.values(byMethod).reduce((t, v) => t + v, 0));

  const opening = record?.opening;
  const closing = record?.closing;
  const isClosed = !!closing;
  const paidOuts: PaidOut[] = record?.paidOuts || [];
  const paidOutTotal = round2(paidOuts.reduce((t, p) => t + p.amount, 0));
  const openingFloat = Number(opening?.amount) || 0;

  const expectedCash = round2(openingFloat + cashTakings - paidOutTotal);
  const countedCash = countTotal(closeCounts);
  const cashVariance = round2(countedCash - expectedCash);
  const terminalCard = round2((Number(debitTotal) || 0) + (Number(creditTotal) || 0));
  const cardVariance = round2(terminalCard - cardTakings);
  const tol = Number(settings.cashVarianceTolerance) || 0;
  const unbalanced = Math.abs(cashVariance) > tol + 0.0001 || Math.abs(cardVariance) > tol + 0.0001;
  const floatLeftNum = floatLeft === '' ? Math.min(openingFloat, countedCash) : round2(Number(floatLeft) || 0);
  const banked = round2(countedCash - floatLeftNum);

  const vouchers = takings.filter(t => isVoucherMethod(t.method));

  // --------------------------------------------------------------------------
  const saveOpening = async () => {
    const amount = countTotal(openCounts);
    if (prevFloat && Math.abs(prevFloat.amount - amount) > 0.001 &&
      !confirm(`Yesterday's cash-up left ${gbp(prevFloat.amount)} as float but you've counted ${gbp(amount)}. Save anyway?`)) return;
    const who = await askStaff(`Who counted the ${gbp(amount)} opening float?`, 'Save float');
    if (!who) return;
    await setDoc(doc(db, 'cashups', date), {
      date,
      opening: { amount, counts: openCounts, staffName: who, staffEmail, at: new Date().toISOString(), expectedFromPrevious: prevFloat?.amount ?? null }
    }, { merge: true });
  };

  const addPaidOut = async () => {
    const amount = round2(Number(po.amount));
    if (!po.description.trim() || !(amount > 0)) { alert('Enter a description and amount for the paid-out.'); return; }
    const staffName = await askStaff(`Who is taking ${gbp(amount)} out of the till?`, 'Record paid-out');
    if (!staffName) return;
    await setDoc(doc(db, 'cashups', date), {
      date,
      paidOuts: arrayUnion({ id: genId(), description: po.description.trim(), amount, staffName, at: new Date().toISOString() })
    }, { merge: true });
    setPo({ description: '', amount: '' });
  };

  const removePaidOut = async (id: string) => {
    if (!confirm('Remove this paid-out?')) return;
    await setDoc(doc(db, 'cashups', date), { paidOuts: paidOuts.filter(p => p.id !== id) }, { merge: true });
  };

  const submitClose = async () => {
    if (!opening) { alert('Record the opening float first (step 1).'); return; }
    if (debitTotal === '' || creditTotal === '') { alert('Enter the debit and credit totals from the card terminal end-of-day report (0 if none).'); return; }
    if (floatLeftNum > countedCash + 0.001) { alert('Float left in the till can\'t be more than the cash counted.'); return; }
    if ((gos1 || gos3) && !vouchersChecked) { alert('Tick to confirm the GOS vouchers have been checked.'); return; }
    if (unbalanced && (!reason.trim() || !signOff.trim())) { alert('The till is unbalanced — enter a reason and pick the colleague signing it off.'); return; }
    const countedBy = await askStaff(`Who counted the till? (Cash variance ${gbp(cashVariance)}, card variance ${gbp(cardVariance)}, banking ${gbp(banked)})`, `Close till for ${date}`);
    if (!countedBy) return;

    setSaving(true);
    try {
      await setDoc(doc(db, 'cashups', date), {
        date,
        closing: {
          countedBy, staffEmail, at: new Date().toISOString(),
          counts: closeCounts, countedCash, expectedCash, cashVariance,
          cashTakings, cardTakings, terminalDebit: round2(Number(debitTotal) || 0), terminalCredit: round2(Number(creditTotal) || 0), cardVariance,
          bnplTakings, gos1, gos3, otherTakings, grandTotal, paidOutTotal,
          byMethod, transactionCount: takings.length,
          floatLeft: floatLeftNum, banked,
          unbalanced, reason: reason.trim(), signedOffBy: unbalanced ? signOff.trim() : '',
          vouchers: vouchers.map(v => ({ method: v.method, amount: v.amount, reference: v.reference || '', receipt: v.receiptNumber, patient: v.label }))
        },
        closedAt: serverTimestamp()
      }, { merge: true });
    } catch (e: any) {
      alert(`Couldn't save cash-up: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const reopen = async () => {
    const why = prompt('Why are you re-opening this cash-up? (logged)');
    if (!why?.trim()) return;
    const staffName = await askStaff('Who is re-opening this cash-up?', 'Re-open');
    if (!staffName) return;
    await setDoc(doc(db, 'cashups', date), {
      closing: null,
      reopenLog: arrayUnion({ at: new Date().toISOString(), staffName, reason: why.trim(), previousClosing: closing })
    }, { merge: true });
  };

  const downloadZ = () => {
    const c = closing;
    const d = new jsPDF({ unit: 'mm', format: 'a4' });
    d.setFont('helvetica', 'bold'); d.setFontSize(16); d.text(`End of day cash-up — ${date}`, 14, 18);
    d.setFontSize(9); d.setFont('helvetica', 'normal');
    d.text(`${settings.companyName} · Counted by ${c.countedBy} at ${ukDateTime(c.at)}${c.signedOffBy ? ` · Signed off by ${c.signedOffBy}` : ''}`, 14, 24);
    autoTable(d, {
      startY: 30, head: [['', 'Expected', 'Actual', 'Variance']],
      body: [
        ['Cash (float + cash takings − paid-outs)', gbp(c.expectedCash), gbp(c.countedCash), gbp(c.cashVariance)],
        ['Card (debit + credit)', gbp(c.cardTakings), gbp(round2(c.terminalDebit + c.terminalCredit)), gbp(c.cardVariance)],
        ['   Debit (terminal)', '', gbp(c.terminalDebit), ''],
        ['   Credit (terminal)', '', gbp(c.terminalCredit), ''],
        ['Klarna / Clearpay', gbp(c.bnplTakings), '', ''],
        ['GOS1 vouchers', gbp(c.gos1), '', ''],
        ['GOS3 vouchers', gbp(c.gos3), '', ''],
        ['Paid-outs', gbp(c.paidOutTotal), '', ''],
        ['Total takings', gbp(c.grandTotal), '', ''],
        ['Opening float', gbp(openingFloat), '', ''],
        ['Float left in till', gbp(c.floatLeft), '', ''],
        ['To bank', gbp(c.banked), '', '']
      ],
      headStyles: { fillColor: [63, 145, 133] }, styles: { fontSize: 9 }
    });
    if (c.reason) { d.text(`Variance reason: ${c.reason}`, 14, ((d as any).lastAutoTable.finalY || 100) + 8); }
    autoTable(d, {
      startY: ((d as any).lastAutoTable.finalY || 100) + 14,
      head: [['Time', 'Receipt', 'Customer', 'Method', 'Amount']],
      body: takings.map(t => [t.time ? ukDateTime(t.time) : '', t.receiptNumber, t.label, `${t.method}${t.reference ? ` (${t.reference})` : ''}`, gbp(t.amount)]),
      headStyles: { fillColor: [63, 145, 133] }, styles: { fontSize: 8 }
    });
    d.save(`cashup-${date}.pdf`);
  };

  // --------------------------------------------------------------------------
  const Row = ({ k, v, bold, tone }: { k: string; v: string; bold?: boolean; tone?: string }) => (
    <div className={`flex justify-between py-1 text-sm ${bold ? 'font-black' : ''} ${tone || ''}`}><span>{k}</span><span>{v}</span></div>
  );

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <div><span className={label}>Business date</span><input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="text-sm font-bold">
          {isClosed ? <span className="text-green-700 flex items-center gap-1"><Lock size={14} /> Closed by {closing.countedBy} at {ukDateTime(closing.at)}</span>
            : opening ? <span className="text-amber-700 flex items-center gap-1"><Unlock size={14} /> Open — float {gbp(openingFloat)} counted by {opening.staffName}</span>
              : <span className="text-slate-500">Not opened yet</span>}
        </div>
        <button className={btnGhost} onClick={loadSales}>{loadingSales ? <Loader2 size={14} className="animate-spin" /> : null} Refresh takings</button>
        {isClosed && <button className={btnGhost} onClick={downloadZ}><Download size={14} /> Cash-up PDF</button>}
        {isClosed && <button className={btnDanger} onClick={reopen}><Unlock size={14} /> Re-open</button>}
      </div>

      {isClosed && closing.transactionCount !== takings.length && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-3 text-sm font-bold flex gap-2"><AlertTriangle size={16} /> {takings.length - closing.transactionCount} transaction(s) have been recorded for this date since it was closed. Re-open and redo the cash-up.</div>
      )}

      {/* 1. Opening float */}
      {!isClosed && (
        <div className={card}>
          <h3 className="font-black mb-1">1. Opening float</h3>
          {opening ? (
            <p className="text-sm text-slate-600">Float of <b>{gbp(openingFloat)}</b> recorded by {opening.staffName} at {ukDateTime(opening.at)}. <button className="underline text-[#3F9185] font-bold" onClick={() => { setOpenCounts(opening.counts || blankCounts()); setDoc(doc(db, 'cashups', date), { opening: null }, { merge: true }); }}>Recount</button></p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">Count the cash in the till before the first sale.{prevFloat ? ` Last cash-up left ${gbp(prevFloat.amount)} as float.` : ''}
                {prevFloat?.counts && <button className="ml-2 underline text-[#3F9185] font-bold" onClick={() => setOpenCounts(prevFloat.counts)}>Pre-fill from last cash-up</button>}</p>
              <DenominationCounter counts={openCounts} onChange={setOpenCounts} />
              <button className={`${btnPrimary} mt-3`} onClick={saveOpening}><CheckCircle2 size={14} /> Save opening float {gbp(countTotal(openCounts))}</button>
            </>
          )}
        </div>
      )}

      {/* 2. Takings */}
      <div className={card}>
        <h3 className="font-black mb-2">{isClosed ? 'Takings' : '2. Takings so far'} <span className="text-xs text-slate-400 font-bold">({takings.length} transactions — till + glasses orders)</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <Row k="Cash" v={gbp(cashTakings)} />
            <Row k="Card (debit + credit)" v={gbp(cardTakings)} />
            <Row k="Klarna / Clearpay" v={gbp(bnplTakings)} />
            {otherTakings !== 0 && <Row k="Other" v={gbp(otherTakings)} />}
          </div>
          <div>
            <Row k="GOS1 vouchers" v={gbp(gos1)} />
            <Row k="GOS3 vouchers" v={gbp(gos3)} />
            <Row k="Paid-outs (petty cash)" v={`−${gbp(paidOutTotal)}`} />
            <Row k="Total takings" v={gbp(grandTotal)} bold />
          </div>
        </div>
        <button className="text-xs underline text-[#3F9185] font-bold mt-2" onClick={() => setShowTx(!showTx)}>{showTx ? 'Hide' : 'Show'} transactions</button>
        {showTx && (
          <table className="w-full text-xs mt-2">
            <tbody>
              {takings.map((t, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1">{t.time ? ukDateTime(t.time) : ''}</td><td>{t.receiptNumber}</td><td>{t.label}</td><td>{t.source === 'order' ? 'Order' : 'Till'}</td>
                  <td>{t.method}{t.reference ? ` (${t.reference})` : ''}</td><td className="text-right font-bold">{gbp(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paid-outs */}
      {!isClosed && (
        <div className={card}>
          <h3 className="font-black mb-2">Paid-outs from the till</h3>
          {paidOuts.map(p => (
            <div key={p.id} className="flex justify-between items-center text-sm py-1 border-b border-slate-100">
              <span>{p.description} <span className="text-xs text-slate-400">— {p.staffName}</span></span>
              <span className="flex items-center gap-2 font-bold">{gbp(p.amount)} <button className="text-red-500" onClick={() => removePaidOut(p.id)}><Trash2 size={12} /></button></span>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input className={input} placeholder="e.g. Milk, postage" value={po.description} onChange={e => setPo({ ...po, description: e.target.value })} />
            <input className={`${input} !w-32`} type="number" step="0.01" placeholder="£" value={po.amount} onChange={e => setPo({ ...po, amount: e.target.value })} />
            <button className={btnGhost} onClick={addPaidOut}><Plus size={14} /> Add</button>
          </div>
        </div>
      )}

      {/* 3. Close */}
      {!isClosed && (
        <div className={card}>
          <h3 className="font-black mb-3">3. End of day count</h3>
          <span className={label}>Cash in the till (count by denomination)</span>
          <DenominationCounter counts={closeCounts} onChange={setCloseCounts} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div><span className={label}>Terminal report — debit total £</span><input className={input} type="number" step="0.01" value={debitTotal} onChange={e => setDebitTotal(e.target.value)} /></div>
            <div><span className={label}>Terminal report — credit total £</span><input className={input} type="number" step="0.01" value={creditTotal} onChange={e => setCreditTotal(e.target.value)} /></div>
            <div><span className={label}>Float to leave in till £</span><input className={input} type="number" step="0.01" placeholder={gbp(Math.min(openingFloat, countedCash))} value={floatLeft} onChange={e => setFloatLeft(e.target.value)} /></div>
          </div>

          {vouchers.length > 0 && (
            <div className="mt-4">
              <span className={label}>GOS vouchers taken today</span>
              {vouchers.map((v, i) => <div key={i} className="text-sm">{v.method} · {v.reference || 'no ref'} · {v.label} · {gbp(v.amount)}</div>)}
              <label className="flex items-center gap-2 text-sm font-bold mt-1"><input type="checkbox" checked={vouchersChecked} onChange={e => setVouchersChecked(e.target.checked)} /> Vouchers checked and filed for claiming</label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 bg-slate-50 rounded-2xl p-4">
            <div>
              <Row k="Opening float" v={gbp(openingFloat)} />
              <Row k="+ Cash takings (net of refunds)" v={gbp(cashTakings)} />
              <Row k="− Paid-outs" v={gbp(paidOutTotal)} />
              <Row k="Expected cash" v={gbp(expectedCash)} bold />
              <Row k="Counted cash" v={gbp(countedCash)} bold />
              <Row k="Cash variance" v={gbp(cashVariance)} bold tone={Math.abs(cashVariance) > tol ? 'text-red-600' : 'text-green-700'} />
            </div>
            <div>
              <Row k="Card per system" v={gbp(cardTakings)} />
              <Row k="Card per terminal" v={gbp(terminalCard)} />
              <Row k="Card variance" v={gbp(cardVariance)} bold tone={Math.abs(cardVariance) > tol ? 'text-red-600' : 'text-green-700'} />
              <Row k="Float left in till" v={gbp(floatLeftNum)} />
              <Row k="Cash to bank" v={gbp(banked)} bold />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {unbalanced && <>
              <div><span className={label}>Reason for variance (required)</span><input className={input} value={reason} onChange={e => setReason(e.target.value)} /></div>
              <div><span className={label}>Signed off by colleague (required)</span>
                {settings.staffNames.length ? (
                  <select className={input} value={signOff} onChange={e => setSignOff(e.target.value)}>
                    <option value="">Select colleague…</option>
                    {settings.staffNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : <input className={input} value={signOff} onChange={e => setSignOff(e.target.value)} />}
              </div>
            </>}
          </div>
          {unbalanced && <p className="text-xs text-red-600 font-bold mt-2 flex items-center gap-1"><AlertTriangle size={12} /> Till is unbalanced{tol ? ` by more than ${gbp(tol)}` : ''} — a reason and sign-off are required.</p>}

          <button className={`${btnPrimary} mt-4 !py-3`} onClick={submitClose} disabled={saving || !opening}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Close till for {date}
          </button>
        </div>
      )}

      {isClosed && (
        <div className={card}>
          <h3 className="font-black mb-2">Cash-up summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <Row k="Expected cash" v={gbp(closing.expectedCash)} />
              <Row k="Counted cash" v={gbp(closing.countedCash)} />
              <Row k="Cash variance" v={gbp(closing.cashVariance)} bold tone={closing.cashVariance ? 'text-red-600' : 'text-green-700'} />
              <Row k="Terminal debit / credit" v={`${gbp(closing.terminalDebit)} / ${gbp(closing.terminalCredit)}`} />
              <Row k="Card variance" v={gbp(closing.cardVariance)} bold tone={closing.cardVariance ? 'text-red-600' : 'text-green-700'} />
            </div>
            <div>
              <Row k="Float left" v={gbp(closing.floatLeft)} />
              <Row k="Banked" v={gbp(closing.banked)} bold />
              <Row k="Total takings" v={gbp(closing.grandTotal)} />
              {closing.unbalanced && <Row k="Reason / signed off" v={`${closing.reason} — ${closing.signedOffBy}`} />}
            </div>
          </div>
        </div>
      )}

      {staffModal}
    </div>
  );
}
