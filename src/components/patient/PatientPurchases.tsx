import { useMemo, useState } from 'react';
import { ShoppingBag, Wallet, RefreshCw, Loader2, ChevronRight } from 'lucide-react';
import { gbp, round2, type VatSettings } from '../../lib/vat';
import { buildSaleReceiptPdf, buildOrderReceiptPdf } from '../../lib/receipt';
import { ensureOrderReceiptNumber } from '../../lib/till';
import { ReceiptActions } from '../till/shared';

// ============================================================================
// PURCHASES — glasses orders, till sales/refunds and CL plans in one timeline.
// ============================================================================

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

type Row = { kind: 'order' | 'sale' | 'refund' | 'cl'; id: string; at: Date | null; title: string; detail: string; total: number; balance?: number; status: string; statusClass: string; raw: any };

export default function PatientPurchases({ patient, orders, sales, settings, clPlans, orderStatusStyles, clStatusStyles, onOpenOrder, onNewSale }: {
  patient: any;
  orders: any[];                          // each with _status and _balance
  sales: any[] | null;
  settings: VatSettings | null;
  clPlans: any[];
  orderStatusStyles: Record<string, string>;
  clStatusStyles: Record<string, string>;
  onOpenOrder: (id: string) => void;
  onNewSale?: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'order' | 'sale' | 'cl'>('all');

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];
    orders.forEach(o => r.push({
      kind: 'order', id: o.id, at: toDate(o.createdAt), title: 'Glasses order',
      detail: (o.items || []).map((it: any) => it.frameSource === 'Own' ? 'Own frame' : `${it.frameMake || ''} ${it.frameModel || ''}`.trim()).filter(Boolean).join(', ') || `${(o.items || []).length} pair(s)`,
      total: Number(o.total) || 0, balance: Number(o._balance) || 0, status: o._status, statusClass: orderStatusStyles[o._status] || 'bg-slate-100 text-slate-600 border-slate-200', raw: o
    }));
    (sales || []).forEach(s => r.push({
      kind: s.type === 'refund' ? 'refund' : 'sale', id: s.id, at: toDate(s.createdAtIso), title: s.type === 'refund' ? `Refund ${s.receiptNumber}` : `Till sale ${s.receiptNumber}`,
      detail: (s.lines || []).map((l: any) => `${Math.abs(l.qty)} × ${l.name}`).join(', '),
      total: Number(s.totals?.gross) || 0, status: s.type === 'refund' ? 'Refunded' : (s.refundedTotal > 0 ? 'Part refunded' : 'Paid'),
      statusClass: s.type === 'refund' ? 'bg-red-50 text-red-600 border-red-200' : s.refundedTotal > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200', raw: s
    }));
    clPlans.forEach(c => r.push({
      kind: 'cl', id: c.id, at: toDate(c.createdAt), title: 'Contact lens plan', detail: `${c.lensType || 'Contact lenses'} · ${c.deliveryMethod || ''}`.replace(/ · $/, ''),
      total: Number(c.monthlyAmount) || 0, status: c.status, statusClass: clStatusStyles[c.status] || 'bg-slate-100 text-slate-600 border-slate-200', raw: c
    }));
    return r.sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
  }, [orders, sales, clPlans, orderStatusStyles, clStatusStyles]);

  const shown = rows.filter(r => filter === 'all' || r.kind === filter || (filter === 'sale' && r.kind === 'refund'));
  const owing = round2(orders.reduce((t, o) => t + Math.max(0, Number(o._balance) || 0), 0));
  const ordersPaid = round2(orders.reduce((t, o) => t + (Number(o.total) || 0) - (Number(o._balance) || 0), 0));
  const tillNet = round2((sales || []).reduce((t, s) => t + (Number(s.totals?.gross) || 0), 0));
  const monthly = round2(clPlans.filter(c => c.status === 'Active').reduce((t, c) => t + (Number(c.monthlyAmount) || 0), 0));

  const Summary = ({ label, value, tone = 'text-slate-800' }: any) => (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
      <div className={`text-xl font-black mt-1 ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="flex-1 bg-[#f8fafc] p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Summary label="Balance owing" value={gbp(owing)} tone={owing > 0 ? 'text-amber-600' : 'text-green-600'} />
          <Summary label="Glasses (paid)" value={gbp(ordersPaid)} />
          <Summary label="Till (net of refunds)" value={sales === null ? '…' : gbp(tillNet)} />
          <Summary label="CL plans" value={monthly > 0 ? `${gbp(monthly)}/mo` : '—'} />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1.5">
            {([['all', 'All'], ['order', 'Glasses orders'], ['sale', 'Till sales'], ['cl', 'CL plans']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${filter === k ? 'bg-[#3F9185] text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {onNewSale && <button onClick={onNewSale} className="px-3 py-2 rounded-xl text-xs font-black bg-[#3F9185] text-white flex items-center gap-1.5"><Wallet size={14} /> New sale</button>}
        </div>

        {sales === null && <div className="text-xs font-bold text-slate-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading till sales…</div>}

        {shown.length === 0 ? (
          <div className="p-10 text-center bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-400 font-bold">No purchases yet.</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
            {shown.map(r => {
              const Icon = r.kind === 'order' ? ShoppingBag : r.kind === 'cl' ? RefreshCw : Wallet;
              return (
                <div key={`${r.kind}-${r.id}`} className="flex items-center gap-4 p-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.kind === 'order' ? 'bg-indigo-50 text-indigo-600' : r.kind === 'cl' ? 'bg-sky-50 text-sky-600' : r.kind === 'refund' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}><Icon size={18} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800">{r.title}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${r.statusClass}`}>{r.status}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">{r.detail}</div>
                    <div className="text-[11px] font-bold text-slate-400">{r.at ? r.at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-black ${r.kind === 'refund' ? 'text-red-600' : 'text-slate-800'}`}>{r.kind === 'cl' ? `${gbp(r.total)}/mo` : gbp(r.total)}</div>
                    {r.kind === 'order' && <div className={`text-[11px] font-bold ${(r.balance || 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>{(r.balance || 0) > 0 ? `${gbp(r.balance || 0)} owing` : 'Paid'}</div>}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {(r.kind === 'sale' || r.kind === 'refund') && settings && (
                      <ReceiptActions compact receiptNumber={r.raw.receiptNumber} email={r.raw.customer?.email || patient.email} patientId={r.raw.customer?.patientId || patient.id} name={r.raw.customer?.name || patient.patientName} isRefund={r.kind === 'refund'}
                        build={async () => ({ doc: await buildSaleReceiptPdf(r.raw, settings), receiptNumber: r.raw.receiptNumber })} />
                    )}
                    {r.kind === 'order' && settings && (
                      <ReceiptActions compact email={r.raw.email || patient.email} patientId={r.raw.patientId || patient.id} name={r.raw.patientName || patient.patientName}
                        build={async () => {
                          const rn = await ensureOrderReceiptNumber(r.raw.id);
                          return { doc: await buildOrderReceiptPdf({ ...r.raw, receiptNumber: rn, patientNumber: patient.patientNumber }, rn, settings), receiptNumber: rn };
                        }} />
                    )}
                    {r.kind === 'order' && <button onClick={() => onOpenOrder(r.id)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600" title="Open order"><ChevronRight size={14} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
