import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Minus, Trash2, CheckCircle2, Loader2, PackagePlus } from 'lucide-react';
import { buildLine, createSale, genId, blankCustomer, TILL_TENDERS, isVoucherMethod, type Product, type Customer, type TillPaymentMethod, type SalePayment } from '../../lib/till';
import { gbp, round2, sumBreakdowns, VAT_CATEGORY_LABELS, type VatCategory, type VatSettings, type DispenseKind } from '../../lib/vat';
import { buildSaleReceiptPdf } from '../../lib/receipt';
import { btnPrimary, btnGhost, btnDanger, input, card, label, ReceiptActions, Modal, useStaffPicker } from './shared';
import { PatientPicker, patientToCustomer, ensurePatientForCustomer, formatUkPhone } from './PatientLink';

interface CartLine {
  key: string;
  product: { id: string | null; name: string; category: string; vatCategory: VatCategory; dispenseKind: DispenseKind; trackStock: boolean; stockQty: number; allowPriceOverride: boolean };
  qty: number;
  unitPrice: number;
  discount: number;
}

interface TenderDraft { id: string; method: TillPaymentMethod; amount: string; reference: string }

export default function NewSale({ products, settings, staffEmail, initialPatient, onInitialPatientUsed }: {
  products: Product[]; settings: VatSettings; staffEmail: string;
  initialPatient?: any; onInitialPatientUsed?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer>(() => initialPatient ? patientToCustomer(initialPatient) : blankCustomer());
  const [pickedPatient, setPickedPatient] = useState<any>(initialPatient || null);
  const [addToCrm, setAddToCrm] = useState(true);
  const [tenders, setTenders] = useState<TenderDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState<any>(null);
  const [miscOpen, setMiscOpen] = useState(false);
  const [misc, setMisc] = useState({ name: '', price: '', vatCategory: 'standard' as VatCategory, dispenseKind: 'spectacles' as DispenseKind });
  const searchRef = useRef<HTMLInputElement>(null);
  const { staffModal, askStaff } = useStaffPicker(settings.staffNames);

  const active = products.filter(p => p.active);
  const categories = ['All', ...Array.from(new Set(active.map(p => p.category))).sort()];
  const shown = active.filter(p => {
    if (catFilter !== 'All' && p.category !== catFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '') === q;
  });

  const lines = useMemo(() => cart.map(c => buildLine(c.product, c.qty, c.unitPrice, c.discount, settings)), [cart, settings]);
  const totals = useMemo(() => sumBreakdowns(lines.map(l => l.breakdown)), [lines]);
  const due = totals.gross;

  const tendered = round2(tenders.reduce((t, x) => t + (Number(x.amount) || 0), 0));
  const cashTendered = round2(tenders.filter(t => t.method === 'Cash').reduce((t, x) => t + (Number(x.amount) || 0), 0));
  const over = round2(tendered - due);
  const change = over > 0 ? Math.min(over, cashTendered) : 0;
  const remaining = round2(due - tendered);
  const overpaidNonCash = over > 0 && over > cashTendered;

  const addProduct = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === p.id && c.discount === 0 && c.unitPrice === p.price);
      if (existing) return prev.map(c => c === existing ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { key: genId(), product: { ...p, id: p.id }, qty: 1, unitPrice: p.price, discount: 0 }];
    });
  };

  const onSearchEnter = () => {
    const q = search.trim();
    if (!q) return;
    const exact = active.find(p => p.barcode === q || (p.sku || '').toLowerCase() === q.toLowerCase());
    const pick = exact || (shown.length === 1 ? shown[0] : null);
    if (pick) { addProduct(pick); setSearch(''); }
  };

  const updateLine = (key: string, patch: Partial<CartLine>) => setCart(prev => prev.map(c => c.key === key ? { ...c, ...patch } : c));

  const addMisc = () => {
    const price = Number(misc.price);
    if (!misc.name.trim() || !(price > 0)) { alert('Enter a description and price.'); return; }
    setCart(prev => [...prev, {
      key: genId(),
      product: { id: null, name: misc.name.trim(), category: 'Other', vatCategory: misc.vatCategory, dispenseKind: misc.dispenseKind, trackStock: false, stockQty: 0, allowPriceOverride: true },
      qty: 1, unitPrice: round2(price), discount: 0
    }]);
    setMisc({ name: '', price: '', vatCategory: 'standard', dispenseKind: 'spectacles' });
    setMiscOpen(false);
  };

  const addTender = (method: TillPaymentMethod, amount?: number) => {
    const amt = amount ?? Math.max(0, remaining);
    setTenders(prev => [...prev, { id: genId(), method, amount: amt ? amt.toFixed(2) : '', reference: '' }]);
  };

  // Patient handed over from the CRM "New sale" button — used once.
  useEffect(() => {
    if (initialPatient) {
      setCustomer(patientToCustomer(initialPatient));
      setPickedPatient(initialPatient);
      onInitialPatientUsed?.();
    }
  }, [initialPatient]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setCart([]); setTenders([]); setCustomer(blankCustomer()); setPickedPatient(null); setAddToCrm(true); setNotes(''); setSearch(''); };

  const complete = async () => {
    if (!cart.length) { alert('Add at least one item.'); return; }
    if (remaining > 0.001) { alert(`There's still ${gbp(remaining)} to pay.`); return; }
    if (overpaidNonCash) { alert('Only cash can be over-tendered (to give change). Reduce the card/voucher amount.'); return; }
    for (const t of tenders) {
      if (!(Number(t.amount) > 0)) { alert('Remove any payment lines with no amount.'); return; }
      if (isVoucherMethod(t.method) && !t.reference.trim()) { alert(`Enter the ${t.method} reference/serial so it can be matched to the GOS claim.`); return; }
    }
    const shortStock = cart.filter(c => c.product.trackStock && c.qty > c.product.stockQty);
    if (shortStock.length && !confirm(`Stock shows fewer than you're selling for: ${shortStock.map(s => s.product.name).join(', ')}. Continue anyway (stock will go negative)?`)) return;
    if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) { alert('That email address doesn\'t look right.'); return; }

    // Cash payment is recorded net of change; change always comes out of cash.
    let changeLeft = change;
    const payments: SalePayment[] = tenders.map(t => {
      let amt = round2(Number(t.amount) || 0);
      if (t.method === 'Cash' && changeLeft > 0) { const take = Math.min(changeLeft, amt); amt = round2(amt - take); changeLeft = round2(changeLeft - take); }
      return { id: t.id, method: t.method, amount: amt, ...(t.reference.trim() ? { reference: t.reference.trim() } : {}) };
    }).filter(p => p.amount > 0);

    // Last step: who is taking this sale?
    const staffName = await askStaff(`Who is completing this ${gbp(due)} sale?`, 'Complete sale');
    if (!staffName) return;

    setSaving(true);
    try {
      // Attribute to the CRM record (creating one if needed, as Orders does).
      let finalCustomer: Customer = { ...customer, name: customer.name.trim(), email: customer.email.trim().toLowerCase(), phone: formatUkPhone(customer.phone) };
      if (finalCustomer.name && (finalCustomer.patientId || addToCrm)) {
        const patientId = await ensurePatientForCustomer(finalCustomer, pickedPatient);
        finalCustomer = { ...finalCustomer, patientId };
      }
      const res = await createSale({ lines, payments, customer: finalCustomer, staffName, staffEmail, cashTendered, changeGiven: change, notes });
      setCompleted({
        id: res.id, type: 'sale', receiptNumber: res.receiptNumber, createdAtIso: new Date().toISOString(),
        customer: finalCustomer, lines, totals, payments, cashTendered, changeGiven: change, staffName
      });
      reset();
    } catch (e: any) {
      alert(`Sale failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      {/* ---------------- Catalogue ---------------- */}
      <div className={`${card} xl:col-span-3`}>
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input ref={searchRef} className={`${input} pl-9`} placeholder="Search name / SKU, or scan a barcode and press Enter"
              value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearchEnter(); }} autoFocus />
          </div>
          <button className={btnGhost} onClick={() => setMiscOpen(true)}><PackagePlus size={14} /> Misc item</button>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-3 py-1 rounded-full text-xs font-bold ${catFilter === c ? 'bg-[#3F9185] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c}</button>
          ))}
        </div>
        {active.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No products yet — add them in the Products & Stock tab.</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
          {shown.map(p => {
            const low = p.trackStock && p.stockQty <= p.lowStockThreshold;
            return (
              <button key={p.id} onClick={() => addProduct(p)}
                className="text-left p-3 rounded-xl border border-slate-100 bg-slate-50 hover:border-[#3F9185] hover:bg-white transition-all">
                <div className="font-bold text-sm text-slate-800 leading-tight">{p.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{p.category}</div>
                <div className="flex justify-between items-end mt-2">
                  <span className="font-black text-[#3F9185]">{gbp(p.price)}</span>
                  {p.trackStock && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${p.stockQty <= 0 ? 'bg-red-100 text-red-600' : low ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>{p.stockQty} in stock</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- Basket + payment ---------------- */}
      <div className={`${card} xl:col-span-2 space-y-4`}>
        <div>
          <span className={label}>Customer / patient (optional — links the sale to their CRM record)</span>
          <PatientPicker
            value={customer}
            onPick={p => { setCustomer(patientToCustomer(p)); setPickedPatient(p); }}
            onClear={() => { setCustomer(blankCustomer()); setPickedPatient(null); }}
          />
          {!customer.patientId && (
            <>
              <input className={`${input} mt-2`} placeholder="Name (new customer)" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input className={input} placeholder="Email" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} />
                <input className={input} placeholder="Phone" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
              </div>
              {customer.name.trim() && (
                <label className="flex items-center gap-2 text-xs font-bold mt-2"><input type="checkbox" checked={addToCrm} onChange={e => setAddToCrm(e.target.checked)} /> Add to CRM as a new patient</label>
              )}
            </>
          )}
          {customer.patientId && !customer.email && (
            <input className={`${input} mt-2`} placeholder="Email (to email the receipt — saved to their record)" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} />
          )}
          {due > 250 && <input className={`${input} mt-2`} placeholder="Address (recommended for sales over £250 — full VAT invoice)" value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />}
        </div>

        <div className="space-y-2">
          {cart.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Basket is empty</p>}
          {cart.map((c, i) => {
            const l = lines[i];
            return (
              <div key={c.key} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm">{c.product.name}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{c.product.vatCategory === 'dispensed' ? 'Goods 20% + dispensing exempt' : c.product.vatCategory === 'exempt' ? 'VAT exempt' : c.product.vatCategory === 'zero' ? 'Zero rated' : `VAT ${settings.vatRate}%`} · VAT {gbp(l.breakdown.vat)}</div>
                  </div>
                  <div className="font-black">{gbp(l.gross)}</div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button className={btnGhost} onClick={() => c.qty > 1 ? updateLine(c.key, { qty: c.qty - 1 }) : setCart(cart.filter(x => x.key !== c.key))}><Minus size={12} /></button>
                  <span className="font-black w-6 text-center">{c.qty}</span>
                  <button className={btnGhost} onClick={() => updateLine(c.key, { qty: c.qty + 1 })}><Plus size={12} /></button>
                  <input type="number" step="0.01" title="Unit price (inc VAT)" disabled={!c.product.allowPriceOverride}
                    className="w-20 p-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={c.unitPrice}
                    onChange={e => updateLine(c.key, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} />
                  <input type="number" step="0.01" placeholder="Disc £" title="Discount (£ off this line)"
                    className="w-20 p-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={c.discount || ''}
                    onChange={e => updateLine(c.key, { discount: Math.max(0, Number(e.target.value) || 0) })} />
                  <button className={`${btnDanger} ml-auto`} onClick={() => setCart(cart.filter(x => x.key !== c.key))}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-100 pt-3 text-sm space-y-1">
          {totals.standardGross !== 0 && <div className="flex justify-between text-slate-500"><span>Standard-rated (inc VAT)</span><span>{gbp(totals.standardGross)}</span></div>}
          {totals.exemptGross !== 0 && <div className="flex justify-between text-slate-500"><span>VAT exempt</span><span>{gbp(totals.exemptGross)}</span></div>}
          {totals.zeroGross !== 0 && <div className="flex justify-between text-slate-500"><span>Zero-rated</span><span>{gbp(totals.zeroGross)}</span></div>}
          <div className="flex justify-between text-slate-500"><span>VAT included</span><span>{gbp(totals.vat)}</span></div>
          <div className="flex justify-between text-xl font-black"><span>Total</span><span>{gbp(due)}</span></div>
        </div>

        {/* Payments */}
        <div className="space-y-2">
          <span className={label}>Payment</span>
          <div className="flex flex-wrap gap-1.5">
            {TILL_TENDERS.map(m => (
              <button key={m} className={btnGhost} disabled={!cart.length} onClick={() => addTender(m)}>{m}</button>
            ))}
          </div>
          {tenders.map(t => (
            <div key={t.id} className="flex gap-2 items-center">
              <span className="text-xs font-black w-28 shrink-0">{t.method}</span>
              <input type="number" step="0.01" className={`${input} !p-2`} value={t.amount}
                onChange={e => setTenders(tenders.map(x => x.id === t.id ? { ...x, amount: e.target.value } : x))} />
              {isVoucherMethod(t.method) && (
                <input className={`${input} !p-2`} placeholder="Voucher ref" value={t.reference}
                  onChange={e => setTenders(tenders.map(x => x.id === t.id ? { ...x, reference: e.target.value } : x))} />
              )}
              <button className={btnDanger} onClick={() => setTenders(tenders.filter(x => x.id !== t.id))}><Trash2 size={12} /></button>
            </div>
          ))}
          {tenders.some(t => t.method === 'Card') && <p className="text-[11px] text-slate-400">Card = debit or credit. You'll split debit/credit from the terminal report at cash-up.</p>}
          <div className="flex justify-between text-sm font-bold">
            <span>{remaining > 0 ? 'Still to pay' : change > 0 ? 'Change to give' : 'Balanced'}</span>
            <span className={remaining > 0 ? 'text-red-600' : change > 0 ? 'text-amber-600' : 'text-green-600'}>{gbp(remaining > 0 ? remaining : change)}</span>
          </div>
        </div>

        <input className={input} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

        <div className="flex gap-2">
          <button className={`${btnPrimary} flex-1 justify-center !py-3 !text-sm`} onClick={complete} disabled={saving || !cart.length}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Complete sale {gbp(due)}
          </button>
          <button className={btnGhost} onClick={() => { if (confirm('Clear this sale?')) reset(); }}>Clear</button>
        </div>
      </div>

      {miscOpen && (
        <Modal title="Add misc item" onClose={() => setMiscOpen(false)}>
          <div className="space-y-3">
            <input className={input} placeholder="Description" value={misc.name} onChange={e => setMisc({ ...misc, name: e.target.value })} />
            <input className={input} type="number" step="0.01" placeholder="Price inc VAT (£)" value={misc.price} onChange={e => setMisc({ ...misc, price: e.target.value })} />
            <select className={input} value={misc.vatCategory} onChange={e => setMisc({ ...misc, vatCategory: e.target.value as VatCategory })}>
              {(Object.keys(VAT_CATEGORY_LABELS) as VatCategory[]).map(k => <option key={k} value={k}>{VAT_CATEGORY_LABELS[k]}</option>)}
            </select>
            {misc.vatCategory === 'dispensed' && (
              <select className={input} value={misc.dispenseKind} onChange={e => setMisc({ ...misc, dispenseKind: e.target.value as DispenseKind })}>
                <option value="spectacles">Spectacles</option><option value="contactLenses">Contact lenses</option>
              </select>
            )}
            <button className={btnPrimary} onClick={addMisc}>Add to basket</button>
          </div>
        </Modal>
      )}

      {staffModal}

      {completed && (
        <Modal title={`Sale complete — ${completed.receiptNumber}`} onClose={() => { setCompleted(null); searchRef.current?.focus(); }}>
          <div className="space-y-4">
            <div className="text-3xl font-black text-center">{gbp(completed.totals.gross)}</div>
            {completed.changeGiven > 0 && <div className="text-center text-lg font-black text-amber-600">Give change: {gbp(completed.changeGiven)}</div>}
            <ReceiptActions
              receiptNumber={completed.receiptNumber}
              email={completed.customer?.email}
              patientId={completed.customer?.patientId}
              name={completed.customer?.name}
              build={async () => ({ doc: await buildSaleReceiptPdf(completed, settings), receiptNumber: completed.receiptNumber })}
            />
            <button className={`${btnPrimary} w-full justify-center`} onClick={() => { setCompleted(null); searchRef.current?.focus(); }}>New sale</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
