import { useEffect, useState } from 'react';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { fetchSalesForRange, buildVatReport, londonDate, type VatDayRow } from '../../lib/till';
import { gbp, sumBreakdowns, isSplitConfigured, type VatSettings, type VatBreakdown } from '../../lib/vat';
import { btnGhost, input, card, label } from './shared';

const quarterStart = () => {
  const [y, m] = londonDate().split('-').map(Number);
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qm).padStart(2, '0')}-01`;
};

export default function VatReport({ orders, settings }: { orders: any[]; settings: VatSettings }) {
  const [from, setFrom] = useState(quarterStart());
  const [to, setTo] = useState(londonDate());
  const [rows, setRows] = useState<VatDayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const sales = await fetchSalesForRange(from, to);
      setRows(buildVatReport(sales, orders, from, to, settings));
    } catch (e: any) { alert(`Report failed: ${e?.message || e}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { run(); }, [from, to, orders, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = sumBreakdowns(rows.map(r => r.total));
  const till = sumBreakdowns(rows.map(r => r.till));
  const ord = sumBreakdowns(rows.map(r => r.orders));

  const csv = () => {
    const head = ['Date', 'Gross takings', 'Standard-rated gross', 'Standard-rated net', 'Output VAT', 'Zero-rated', 'Exempt', 'Till gross', 'Orders gross'];
    const line = (d: string, b: VatBreakdown, t: VatBreakdown, o: VatBreakdown) => [d, b.gross, b.standardGross, b.standardNet, b.vat, b.zeroGross, b.exemptGross, t.gross, o.gross].map(String).join(',');
    const body = [head.join(','), ...rows.map(r => line(r.date, r.total, r.till, r.orders)), line('TOTAL', total, till, ord)].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    a.download = `vat-${from}-to-${to}.csv`;
    a.click();
  };

  const Cell = ({ v, bold }: { v: number; bold?: boolean }) => <td className={`text-right ${bold ? 'font-black' : ''}`}>{gbp(v)}</td>;

  return (
    <div className="space-y-4">
      {!isSplitConfigured(settings) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-3 text-sm font-bold flex gap-2">
          <AlertTriangle size={16} className="shrink-0" /> The dispensing split isn't set, so dispensed glasses/CLs are being treated as 100% standard-rated goods. Set it in VAT Settings once your accountant confirms the figure.
        </div>
      )}
      <div className={card}>
        <div className="flex flex-wrap gap-2 items-end mb-4">
          <div><span className={label}>From</span><input type="date" className={input} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><span className={label}>To</span><input type="date" className={input} value={to} onChange={e => setTo(e.target.value)} /></div>
          <button className={btnGhost} onClick={run}>{loading && <Loader2 size={14} className="animate-spin" />} Run</button>
          <button className={btnGhost} onClick={csv} disabled={!rows.length}><Download size={14} /> CSV for accountant</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {[['Gross takings', total.gross], ['Output VAT (Box 1)', total.vat], ['Standard-rated net', total.standardNet], ['Exempt', total.exemptGross], ['Zero-rated', total.zeroGross]].map(([k, v]) => (
            <div key={k as string} className="bg-slate-50 rounded-2xl p-3">
              <div className="text-[10px] font-black uppercase text-slate-400">{k}</div>
              <div className="text-xl font-black">{gbp(v as number)}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Box 6 (total sales ex VAT) = standard-rated net + zero-rated + exempt = <b>{gbp(total.standardNet + total.zeroGross + total.exemptGross)}</b>.
          Tax point is the date each payment was received, so order deposits are taxed when paid. Covers the till and glasses orders only — not online (Shopify) sales or GOS claims paid by NHSBSA.
          Order VAT uses the current split setting.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-[10px] uppercase tracking-wider text-slate-400">
                <th className="text-left py-2">Date</th><th>Gross</th><th>Std gross</th><th>Std net</th><th>VAT</th><th>Zero</th><th>Exempt</th><th>Till</th><th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.date} className="border-t border-slate-100">
                  <td className="py-1.5">{r.date}</td>
                  <Cell v={r.total.gross} /><Cell v={r.total.standardGross} /><Cell v={r.total.standardNet} /><Cell v={r.total.vat} bold />
                  <Cell v={r.total.zeroGross} /><Cell v={r.total.exemptGross} /><Cell v={r.till.gross} /><Cell v={r.orders.gross} />
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="border-t-2 border-slate-300 font-black">
                  <td className="py-2">Total</td>
                  <Cell v={total.gross} bold /><Cell v={total.standardGross} bold /><Cell v={total.standardNet} bold /><Cell v={total.vat} bold />
                  <Cell v={total.zeroGross} bold /><Cell v={total.exemptGross} bold /><Cell v={till.gross} bold /><Cell v={ord.gross} bold />
                </tr>
              )}
              {!rows.length && <tr><td colSpan={9} className="text-center text-slate-400 py-8">{loading ? 'Loading…' : 'No takings in this range'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
