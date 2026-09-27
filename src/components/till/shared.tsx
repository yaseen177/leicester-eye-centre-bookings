import { useState, type ReactNode } from 'react';
import { Download, Printer, Mail, Loader2 } from 'lucide-react';
import type { jsPDF } from 'jspdf';
import { downloadPdf, printPdf, emailReceiptPdf } from '../../lib/receipt';
import { gbp, round2 } from '../../lib/vat';

export const btn = 'px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed';
export const btnPrimary = `${btn} bg-[#3F9185] text-white hover:bg-[#357a70]`;
export const btnGhost = `${btn} bg-slate-100 text-slate-600 hover:bg-slate-200`;
export const btnDanger = `${btn} bg-red-50 text-red-600 hover:bg-red-100`;
export const input = 'p-2.5 rounded-xl bg-slate-50 border border-slate-200 outline-none text-sm focus:border-[#3F9185] w-full';
export const card = 'bg-white rounded-2xl shadow-sm border border-slate-100 p-5';
export const label = 'text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block';

// ----------------------------------------------------------------------------
// Receipt actions: download / print / email a receipt PDF built on demand.
// ----------------------------------------------------------------------------
export function ReceiptActions({ build, receiptNumber, email, name, isRefund, compact }: {
  build: () => Promise<{ doc: jsPDF; receiptNumber: string }>;
  receiptNumber?: string;
  email?: string;
  name?: string;
  isRefund?: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<'' | 'dl' | 'print' | 'email'>('');
  const [to, setTo] = useState(email || '');
  const [showEmail, setShowEmail] = useState(false);

  const run = async (kind: 'dl' | 'print' | 'email') => {
    setBusy(kind);
    try {
      const { doc, receiptNumber: rn } = await build();
      if (kind === 'dl') downloadPdf(doc, `${rn || receiptNumber || 'receipt'}.pdf`);
      if (kind === 'print') printPdf(doc);
      if (kind === 'email') {
        if (!to.trim()) { alert('Enter an email address.'); return; }
        await emailReceiptPdf({ to: to.trim(), name: name || '', receiptNumber: rn, doc, isRefund });
        alert(`Receipt ${rn} emailed to ${to.trim()}.`);
        setShowEmail(false);
      }
    } catch (e: any) {
      alert(e?.message || 'Something went wrong producing the receipt.');
    } finally {
      setBusy('');
    }
  };

  const spin = <Loader2 size={14} className="animate-spin" />;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button className={btnGhost} onClick={() => run('dl')} disabled={!!busy}>{busy === 'dl' ? spin : <Download size={14} />}{!compact && 'PDF'}</button>
      <button className={btnGhost} onClick={() => run('print')} disabled={!!busy}>{busy === 'print' ? spin : <Printer size={14} />}{!compact && 'Print'}</button>
      {!showEmail ? (
        <button className={btnGhost} onClick={() => setShowEmail(true)} disabled={!!busy}><Mail size={14} />{!compact && 'Email'}</button>
      ) : (
        <div className="flex items-center gap-1.5">
          <input className={`${input} !w-56 !p-2 text-xs`} placeholder="customer@email.com" value={to} onChange={e => setTo(e.target.value)} />
          <button className={btnPrimary} onClick={() => run('email')} disabled={!!busy}>{busy === 'email' ? spin : <Mail size={14} />}Send</button>
          <button className={btnGhost} onClick={() => setShowEmail(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Cash denomination counter (UK notes + coins). Counts are quantities.
// ----------------------------------------------------------------------------
export const DENOMINATIONS: { key: string; label: string; value: number }[] = [
  { key: 'n50', label: '£50', value: 50 }, { key: 'n20', label: '£20', value: 20 }, { key: 'n10', label: '£10', value: 10 }, { key: 'n5', label: '£5', value: 5 },
  { key: 'c200', label: '£2', value: 2 }, { key: 'c100', label: '£1', value: 1 }, { key: 'c50', label: '50p', value: 0.5 }, { key: 'c20', label: '20p', value: 0.2 },
  { key: 'c10', label: '10p', value: 0.1 }, { key: 'c5', label: '5p', value: 0.05 }, { key: 'c2', label: '2p', value: 0.02 }, { key: 'c1', label: '1p', value: 0.01 }
];

export type DenomCounts = Record<string, number>;
export const blankCounts = (): DenomCounts => Object.fromEntries(DENOMINATIONS.map(d => [d.key, 0]));
export const countTotal = (c: DenomCounts): number => round2(DENOMINATIONS.reduce((t, d) => t + (Number(c[d.key]) || 0) * d.value, 0));

export function DenominationCounter({ counts, onChange, disabled }: { counts: DenomCounts; onChange: (c: DenomCounts) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {DENOMINATIONS.map(d => (
          <div key={d.key} className="bg-slate-50 rounded-xl p-2 border border-slate-100">
            <div className="flex justify-between text-[11px] font-black text-slate-500">
              <span>{d.label}</span>
              <span className="text-slate-400">{gbp((Number(counts[d.key]) || 0) * d.value)}</span>
            </div>
            <input
              type="number" min={0} step={1} disabled={disabled}
              value={counts[d.key] || ''}
              placeholder="0"
              onChange={e => onChange({ ...counts, [d.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              className="w-full mt-1 p-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-center outline-none focus:border-[#3F9185]"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 text-right text-sm font-black text-slate-700">Counted: {gbp(countTotal(counts))}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} mt-10 p-6`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-lg text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-black text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
