import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { saveVatSettings } from '../../lib/till';
import { analyseLine, gbp, type VatSettings } from '../../lib/vat';
import { btnPrimary, input, card, label } from './shared';

export default function TillSettings({ settings, onSaved }: { settings: VatSettings; onSaved: (s: VatSettings) => void }) {
  const [s, setS] = useState<VatSettings>(settings);
  const [staffText, setStaffText] = useState(settings.staffNames.join('\n'));
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<VatSettings>) => setS({ ...s, ...patch });

  const save = async () => {
    const pctBad = [s.spectaclesExemptPercent, s.contactLensExemptPercent].some(v => v < 0 || v > 100);
    if (pctBad) { alert('Percentages must be between 0 and 100.'); return; }
    const next = { ...s, staffNames: staffText.split('\n').map(x => x.trim()).filter(Boolean) };
    setSaving(true);
    try { await saveVatSettings(next); onSaved(next); alert('Settings saved.'); }
    catch (e: any) { alert(`Save failed: ${e?.message || e}`); }
    finally { setSaving(false); }
  };

  const example = analyseLine(250, 'dispensed', s, 'spectacles');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={card}>
        <h3 className="font-black mb-1">Dispensing VAT split</h3>
        <p className="text-xs text-slate-500 mb-3">
          Dispensed glasses and contact lenses are two supplies: the goods (20%) and the dispensing service (exempt). Receipts show both as separate charges
          (the "separately disclosed charges" method — HMRC Revenue &amp; Customs Brief 14/2020). The split must be fair and reasonable for this practice — agree the figure with your accountant.
        </p>
        <span className={label}>Method</span>
        <select className={input} value={s.splitMethod} onChange={e => set({ splitMethod: e.target.value as VatSettings['splitMethod'] })}>
          <option value="percent">Percentage of the price is dispensing (exempt)</option>
          <option value="fixed">Fixed dispensing fee per pair / supply</option>
        </select>
        {s.splitMethod === 'percent' ? (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div><span className={label}>Spectacles — exempt %</span><input className={input} type="number" step="0.1" value={s.spectaclesExemptPercent} onChange={e => set({ spectaclesExemptPercent: Number(e.target.value) || 0 })} /></div>
            <div><span className={label}>Contact lenses — exempt %</span><input className={input} type="number" step="0.1" value={s.contactLensExemptPercent} onChange={e => set({ contactLensExemptPercent: Number(e.target.value) || 0 })} /></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div><span className={label}>Spectacles — fee per pair £</span><input className={input} type="number" step="0.01" value={s.spectaclesFixedFee} onChange={e => set({ spectaclesFixedFee: Number(e.target.value) || 0 })} /></div>
            <div><span className={label}>Contact lenses — fee per supply £</span><input className={input} type="number" step="0.01" value={s.contactLensFixedFee} onChange={e => set({ contactLensFixedFee: Number(e.target.value) || 0 })} /></div>
          </div>
        )}
        <div className="mt-3"><span className={label}>Split confirmed by (accountant / date)</span><input className={input} value={s.splitConfirmedBy} onChange={e => set({ splitConfirmedBy: e.target.value })} /></div>
        <div className="mt-3 bg-slate-50 rounded-xl p-3 text-xs">
          <b>Example — £250.00 pair of glasses:</b> goods {gbp(example.standardGross)} (of which VAT {gbp(example.vat)}) + dispensing {gbp(example.exemptGross)} exempt.
        </div>
        <div className="mt-3"><span className={label}>VAT rate %</span><input className={input} type="number" value={s.vatRate} onChange={e => set({ vatRate: Number(e.target.value) || 0 })} /></div>
      </div>

      <div className={card}>
        <h3 className="font-black mb-3">Receipt details &amp; till</h3>
        <div className="space-y-3">
          <div><span className={label}>Company name</span><input className={input} value={s.companyName} onChange={e => set({ companyName: e.target.value })} /></div>
          <div><span className={label}>Address (one line per row)</span><textarea className={input} rows={3} value={s.addressLines.join('\n')} onChange={e => set({ addressLines: e.target.value.split('\n') })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={label}>Phone</span><input className={input} value={s.phone} onChange={e => set({ phone: e.target.value })} /></div>
            <div><span className={label}>Email</span><input className={input} value={s.email} onChange={e => set({ email: e.target.value })} /></div>
            <div><span className={label}>VAT number</span><input className={input} value={s.vatNumber} onChange={e => set({ vatNumber: e.target.value })} /></div>
            <div><span className={label}>Company number</span><input className={input} value={s.companyNumber} onChange={e => set({ companyNumber: e.target.value })} /></div>
          </div>
          <div><span className={label}>Cash-up tolerance £ (variance above this needs reason + sign-off)</span><input className={input} type="number" step="0.01" value={s.cashVarianceTolerance} onChange={e => set({ cashVarianceTolerance: Number(e.target.value) || 0 })} /></div>
          <div><span className={label}>Staff names (one per line)</span><textarea className={input} rows={4} value={staffText} onChange={e => setStaffText(e.target.value)} /></div>
        </div>
      </div>

      <div className="lg:col-span-2">
        <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save settings</button>
      </div>
    </div>
  );
}
