import { useEffect, useState } from 'react';
import { ShoppingCart, Receipt, Glasses, Calculator, Package, Percent, Settings, Loader2, AlertTriangle } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { loadVatSettings, type Product } from '../lib/till';
import { DEFAULT_VAT_SETTINGS, isSplitConfigured, type VatSettings } from '../lib/vat';
import NewSale from '../components/till/NewSale';
import SalesHistory from '../components/till/SalesHistory';
import OrdersTill from '../components/till/OrdersTill';
import CashUp from '../components/till/CashUp';
import ProductsManager from '../components/till/ProductsManager';
import VatReport from '../components/till/VatReport';
import TillSettings from '../components/till/TillSettings';

type TillTab = 'sale' | 'history' | 'orders' | 'cashup' | 'products' | 'vat' | 'settings';

const TABS: { key: TillTab; label: string; icon: any }[] = [
  { key: 'sale', label: 'New Sale', icon: ShoppingCart },
  { key: 'history', label: 'Sales & Refunds', icon: Receipt },
  { key: 'orders', label: 'Glasses Orders', icon: Glasses },
  { key: 'cashup', label: 'Cash Up', icon: Calculator },
  { key: 'products', label: 'Products & Stock', icon: Package },
  { key: 'vat', label: 'VAT Report', icon: Percent },
  { key: 'settings', label: 'VAT Settings', icon: Settings }
];

const STAFF_KEY = 'till.staffName';

// `patients` is accepted for backwards compatibility but no longer needed —
// the till searches the whole CRM directly.
export default function TillDashboard({ dispenseOrders, salePatient, onSalePatientUsed }: {
  dispenseOrders: any[]; patients?: any[]; salePatient?: any; onSalePatientUsed?: () => void;
}) {
  const [tab, setTab] = useState<TillTab>('sale');
  const [settings, setSettings] = useState<VatSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [staffName, setStaffName] = useState<string>(() => { try { return localStorage.getItem(STAFF_KEY) || ''; } catch { return ''; } });
  const staffEmail = auth.currentUser?.email || '';

  useEffect(() => {
    loadVatSettings().then(setSettings).catch(() => setSettings({ ...DEFAULT_VAT_SETTINGS }));
    const unsub = onSnapshot(collection(db, 'products'), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
    });
    return () => unsub();
  }, []);

  useEffect(() => { if (salePatient) setTab('sale'); }, [salePatient]);

  const pickStaff = (name: string) => {
    setStaffName(name);
    try { localStorage.setItem(STAFF_KEY, name); } catch { /* ignore */ }
  };

  if (!settings) return <div className="p-10 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;

  const lowStock = products.filter(p => p.active && p.trackStock && p.stockQty <= p.lowStockThreshold).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex gap-1 flex-wrap">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`relative px-3 py-2 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all ${tab === t.key ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
                <Icon size={16} /> {t.label}
                {t.key === 'products' && lowStock > 0 && <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 rounded-full">{lowStock}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pr-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Staff</span>
          <input list="till-staff-top" value={staffName} onChange={e => pickStaff(e.target.value)} placeholder="Your name"
            className={`p-2 rounded-xl border text-sm font-bold outline-none w-40 ${staffName ? 'border-slate-200 bg-slate-50' : 'border-red-300 bg-red-50'}`} />
          <datalist id="till-staff-top">{settings.staffNames.map(n => <option key={n} value={n} />)}</datalist>
        </div>
      </div>

      {!isSplitConfigured(settings) && tab !== 'settings' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-3 text-xs font-bold flex gap-2 items-center">
          <AlertTriangle size={14} className="shrink-0" /> Dispensing VAT split not set — dispensed items are currently 100% standard-rated.
          <button className="underline" onClick={() => setTab('settings')}>Set it in VAT Settings</button>
        </div>
      )}

      {tab === 'sale' && <NewSale products={products} settings={settings} staffName={staffName} staffEmail={staffEmail} initialPatient={salePatient} onInitialPatientUsed={onSalePatientUsed} />}
      {tab === 'history' && <SalesHistory settings={settings} staffName={staffName} staffEmail={staffEmail} />}
      {tab === 'orders' && <OrdersTill orders={dispenseOrders} settings={settings} staffName={staffName} />}
      {tab === 'cashup' && <CashUp orders={dispenseOrders} settings={settings} staffName={staffName} staffEmail={staffEmail} />}
      {tab === 'products' && <ProductsManager products={products} settings={settings} staffName={staffName} />}
      {tab === 'vat' && <VatReport orders={dispenseOrders} settings={settings} />}
      {tab === 'settings' && <TillSettings settings={settings} onSaved={setSettings} />}
    </div>
  );
}
