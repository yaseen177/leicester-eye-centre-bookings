import { useEffect, useState } from 'react';
import { Plus, Edit3, PackagePlus, History, Loader2, Sparkles } from 'lucide-react';
import { collection, doc, setDoc, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { blankProduct, adjustStock, PRODUCT_CATEGORIES, ukDateTime, type Product } from '../../lib/till';
import { gbp, round2, extractVat, VAT_CATEGORY_LABELS, type VatCategory, type VatSettings, type DispenseKind } from '../../lib/vat';
import { btnGhost, btnPrimary, input, card, label, Modal } from './shared';

// Starter services — created at £0 and inactive so nothing goes live with a
// wrong price. Set the prices, then tick Active.
const STARTERS: Omit<Product, 'id'>[] = [
  { ...blankProduct(), name: 'Private Eye Examination', category: 'Eye Examinations', vatCategory: 'exempt', active: false },
  { ...blankProduct(), name: 'Eye Examination + OCT Scan', category: 'Eye Examinations', vatCategory: 'exempt', active: false },
  { ...blankProduct(), name: 'OCT Scan', category: 'Clinical Services', vatCategory: 'exempt', active: false },
  { ...blankProduct(), name: 'Contact Lens Fitting', category: 'Contact Lens Fitting', vatCategory: 'exempt', active: false },
  { ...blankProduct(), name: 'Contact Lens Aftercare', category: 'Contact Lens Fitting', vatCategory: 'exempt', active: false },
  { ...blankProduct(), name: 'Contact Lenses (dispensed)', category: 'Contact Lenses', vatCategory: 'dispensed', dispenseKind: 'contactLenses', active: false },
  { ...blankProduct(), name: 'Contact Lens Solution', category: 'Contact Lens Solutions', vatCategory: 'standard', trackStock: true, active: false },
  { ...blankProduct(), name: 'Glasses Case', category: 'Cases & Cloths', vatCategory: 'standard', trackStock: true, active: false },
  { ...blankProduct(), name: 'Lens Cleaning Cloth', category: 'Cases & Cloths', vatCategory: 'standard', trackStock: true, active: false },
  { ...blankProduct(), name: 'Lens Cleaning Spray', category: 'Accessories', vatCategory: 'standard', trackStock: true, active: false },
  { ...blankProduct(), name: 'Glasses Repair / Adjustment', category: 'Other', vatCategory: 'standard', active: false }
];

export default function ProductsManager({ products, settings, staffName }: { products: Product[]; settings: VatSettings; staffName: string }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [onlyLow, setOnlyLow] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<(Omit<Product, 'id'> & { id?: string }) | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [historyFor, setHistoryFor] = useState<Product | null>(null);

  const categories = ['All', ...Array.from(new Set([...PRODUCT_CATEGORIES, ...products.map(p => p.category)]))];
  const q = search.trim().toLowerCase();
  const shown = products.filter(p => {
    if (!showInactive && !p.active) return false;
    if (cat !== 'All' && p.category !== cat) return false;
    if (onlyLow && !(p.trackStock && p.stockQty <= p.lowStockThreshold)) return false;
    return !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q);
  });
  const lowCount = products.filter(p => p.active && p.trackStock && p.stockQty <= p.lowStockThreshold).length;
  const stockValue = round2(products.filter(p => p.trackStock && p.stockQty > 0).reduce((t, p) => t + p.stockQty * (p.costPrice || 0), 0));

  const seed = async () => {
    const existing = new Set(products.map(p => p.name.toLowerCase()));
    const toAdd = STARTERS.filter(s => !existing.has(s.name.toLowerCase()));
    if (!toAdd.length) { alert('Starter items already exist.'); return; }
    if (!confirm(`Add ${toAdd.length} starter items (inactive, £0 — you set prices)?`)) return;
    for (const s of toAdd) await addDoc(collection(db, 'products'), { ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div className="flex-1 min-w-[200px]"><span className={label}>Search</span><input className={input} placeholder="Name, SKU, barcode" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div><span className={label}>Category</span>
          <select className={input} value={cat} onChange={e => setCat(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold pb-3"><input type="checkbox" checked={onlyLow} onChange={e => setOnlyLow(e.target.checked)} /> Low stock ({lowCount})</label>
        <label className="flex items-center gap-1.5 text-xs font-bold pb-3"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>
        <button className={btnPrimary} onClick={() => setEditing({ ...blankProduct() })}><Plus size={14} /> Add product</button>
        {products.length < 5 && <button className={btnGhost} onClick={seed}><Sparkles size={14} /> Add starter items</button>}
      </div>
      {stockValue > 0 && <p className="text-xs text-slate-500 mb-2">Stock value at cost: <b>{gbp(stockValue)}</b></p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2">Product</th><th>Category</th><th>VAT</th><th className="text-right">Price</th><th className="text-right">Stock</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(p => {
              const low = p.trackStock && p.stockQty <= p.lowStockThreshold;
              return (
                <tr key={p.id} className={`border-t border-slate-100 ${!p.active ? 'opacity-50' : ''}`}>
                  <td className="py-2 font-bold">{p.name}<div className="text-[10px] text-slate-400 font-normal">{[p.sku, p.barcode].filter(Boolean).join(' · ')}{!p.active ? ' · INACTIVE' : ''}</div></td>
                  <td className="text-xs">{p.category}</td>
                  <td className="text-xs">{p.vatCategory === 'dispensed' ? `Dispensed ${p.dispenseKind === 'contactLenses' ? 'CL' : 'specs'}` : p.vatCategory === 'standard' ? `${settings.vatRate}%` : p.vatCategory === 'zero' ? '0%' : 'Exempt'}</td>
                  <td className="text-right font-bold">{gbp(p.price)}</td>
                  <td className={`text-right font-black ${p.trackStock ? (p.stockQty <= 0 ? 'text-red-600' : low ? 'text-amber-600' : '') : 'text-slate-300'}`}>{p.trackStock ? p.stockQty : '—'}</td>
                  <td className="pl-3">
                    <div className="flex gap-1 justify-end">
                      <button className={btnGhost} onClick={() => setEditing({ ...p })}><Edit3 size={12} /></button>
                      {p.trackStock && <button className={btnGhost} onClick={() => setAdjusting(p)}><PackagePlus size={12} /> Stock</button>}
                      {p.trackStock && <button className={btnGhost} onClick={() => setHistoryFor(p)}><History size={12} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={6} className="text-center text-slate-400 py-8">No products</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <ProductForm product={editing} settings={settings} onClose={() => setEditing(null)} />}
      {adjusting && <StockAdjust product={adjusting} staffName={staffName} onClose={() => setAdjusting(null)} />}
      {historyFor && <StockHistory product={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function ProductForm({ product, settings, onClose }: { product: Omit<Product, 'id'> & { id?: string }; settings: VatSettings; onClose: () => void }) {
  const [p, setP] = useState(product);
  const [saving, setSaving] = useState(false);
  const isNew = !product.id;
  const set = (patch: Partial<Product>) => setP({ ...p, ...patch });

  const save = async () => {
    if (!p.name.trim()) { alert('Name is required.'); return; }
    if (p.active && !(p.price > 0) && !confirm('Price is £0 — save as active anyway?')) return;
    setSaving(true);
    try {
      const { id, ...data } = p as any;
      const clean = {
        ...data, name: p.name.trim(), sku: (p.sku || '').trim(), barcode: (p.barcode || '').trim(),
        price: round2(p.price), costPrice: round2(p.costPrice || 0),
        stockQty: Math.floor(Number(p.stockQty) || 0), lowStockThreshold: Math.floor(Number(p.lowStockThreshold) || 0),
        updatedAt: serverTimestamp()
      };
      if (isNew) await addDoc(collection(db, 'products'), { ...clean, createdAt: serverTimestamp() });
      else {
        delete clean.stockQty; // stock only changes via sales/adjustments so there's an audit trail
        await setDoc(doc(db, 'products', id), clean, { merge: true });
      }
      onClose();
    } catch (e: any) {
      alert(`Save failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const vatPreview = p.vatCategory === 'standard' ? extractVat(p.price, settings.vatRate) : 0;

  return (
    <Modal title={isNew ? 'Add product' : `Edit ${product.name}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2"><span className={label}>Name</span><input className={input} value={p.name} onChange={e => set({ name: e.target.value })} /></div>
        <div><span className={label}>Category</span>
          <input className={input} list="prod-cats" value={p.category} onChange={e => set({ category: e.target.value })} />
          <datalist id="prod-cats">{PRODUCT_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div><span className={label}>Price inc VAT (£)</span><input className={input} type="number" step="0.01" value={p.price} onChange={e => set({ price: Number(e.target.value) || 0 })} /></div>
        <div className="md:col-span-2"><span className={label}>VAT treatment</span>
          <select className={input} value={p.vatCategory} onChange={e => set({ vatCategory: e.target.value as VatCategory })}>
            {(Object.keys(VAT_CATEGORY_LABELS) as VatCategory[]).map(k => <option key={k} value={k}>{VAT_CATEGORY_LABELS[k]}</option>)}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            {p.vatCategory === 'exempt' && 'Clinical services by a registered optometrist — eye exams, OCT as part of an exam, CL fitting/aftercare.'}
            {p.vatCategory === 'standard' && `Goods with no dispensing — accessories, cases, solutions, plano sunglasses, frames sold on their own. VAT in this price: ${gbp(vatPreview)}.`}
            {p.vatCategory === 'dispensed' && 'Frames/lenses/contact lenses supplied WITH dispensing. Split into goods (20%) + exempt dispensing using the split in VAT Settings.'}
            {p.vatCategory === 'zero' && 'Rare in optics — only use if your accountant has confirmed zero-rating applies.'}
          </p>
        </div>
        {p.vatCategory === 'dispensed' && (
          <div><span className={label}>Dispensed as</span>
            <select className={input} value={p.dispenseKind} onChange={e => set({ dispenseKind: e.target.value as DispenseKind })}>
              <option value="spectacles">Spectacles</option><option value="contactLenses">Contact lenses</option>
            </select>
          </div>
        )}
        <div><span className={label}>SKU</span><input className={input} value={p.sku} onChange={e => set({ sku: e.target.value })} /></div>
        <div><span className={label}>Barcode</span><input className={input} value={p.barcode} onChange={e => set({ barcode: e.target.value })} /></div>
        <div><span className={label}>Cost price ex VAT (£, optional)</span><input className={input} type="number" step="0.01" value={p.costPrice} onChange={e => set({ costPrice: Number(e.target.value) || 0 })} /></div>
        <div className="md:col-span-2 flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={p.trackStock} onChange={e => set({ trackStock: e.target.checked })} /> Track stock</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={p.allowPriceOverride} onChange={e => set({ allowPriceOverride: e.target.checked })} /> Allow price change at till</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={p.active} onChange={e => set({ active: e.target.checked })} /> Active (shows on till)</label>
        </div>
        {p.trackStock && <>
          {isNew && <div><span className={label}>Opening stock qty</span><input className={input} type="number" value={p.stockQty} onChange={e => set({ stockQty: Number(e.target.value) || 0 })} /></div>}
          <div><span className={label}>Low stock alert at</span><input className={input} type="number" value={p.lowStockThreshold} onChange={e => set({ lowStockThreshold: Number(e.target.value) || 0 })} /></div>
        </>}
      </div>
      <div className="flex gap-2 mt-5">
        <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
        <button className={btnGhost} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

const ADJUST_REASONS = ['Delivery received', 'Stock count correction', 'Damaged / written off', 'Used in practice', 'Other'];

function StockAdjust({ product, staffName, onClose }: { product: Product; staffName: string; onClose: () => void }) {
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const [saving, setSaving] = useState(false);

  const n = Math.floor(Number(qty) || 0);
  const change = mode === 'add' ? n : mode === 'remove' ? -n : n - product.stockQty;

  const save = async () => {
    if (!staffName.trim()) { alert('Pick your name (Staff) at the top of the Till first.'); return; }
    if (mode !== 'set' && n <= 0) { alert('Enter a quantity.'); return; }
    if (change === 0) { onClose(); return; }
    setSaving(true);
    try { await adjustStock(product, change, reason, staffName); onClose(); }
    catch (e: any) { alert(`Failed: ${e?.message || e}`); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Stock — ${product.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm">Current stock: <b>{product.stockQty}</b></p>
        <div className="flex gap-1">
          {(['add', 'remove', 'set'] as const).map(m => <button key={m} className={mode === m ? btnPrimary : btnGhost} onClick={() => { setMode(m); if (m === 'set') setReason('Stock count correction'); }}>{m === 'add' ? 'Add' : m === 'remove' ? 'Remove' : 'Set to (stock count)'}</button>)}
        </div>
        <input className={input} type="number" placeholder="Quantity" value={qty} onChange={e => setQty(e.target.value)} />
        <select className={input} value={reason} onChange={e => setReason(e.target.value)}>{ADJUST_REASONS.map(r => <option key={r}>{r}</option>)}</select>
        <p className="text-sm">New stock: <b>{product.stockQty + change}</b> ({change >= 0 ? '+' : ''}{change})</p>
        <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Save adjustment</button>
      </div>
    </Modal>
  );
}

function StockHistory({ product, onClose }: { product: Product; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, 'stockMovements'), where('productId', '==', product.id), orderBy('createdAtIso', 'desc'), limit(100));
        const snap = await getDocs(qy);
        setRows(snap.docs.map(d => d.data()));
      } catch (e: any) {
        // First run needs a composite index — Firestore's error message includes a one-click link to create it.
        alert(`Couldn't load history: ${e?.message || e}`);
        setRows([]);
      }
    })();
  }, [product.id]);

  return (
    <Modal title={`Stock history — ${product.name}`} onClose={onClose} wide>
      {!rows ? <Loader2 className="animate-spin" /> : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 text-xs">{r.createdAtIso ? ukDateTime(r.createdAtIso) : ''}</td>
                <td className="text-xs">{r.reason}{r.reference ? ` · ${r.reference}` : ''}</td>
                <td className="text-xs">{r.staffName}</td>
                <td className={`text-right font-black ${r.change < 0 ? 'text-red-600' : 'text-green-700'}`}>{r.change > 0 ? '+' : ''}{r.change}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="text-slate-400 py-4">No movements yet</td></tr>}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
