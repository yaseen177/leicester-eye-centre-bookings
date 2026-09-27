import { useEffect, useMemo, useState } from 'react';
import { Search, User, Loader2, ShoppingCart, X, RefreshCw } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { loadVatSettings, ukDateTime, type Customer } from '../../lib/till';
import { gbp, round2, type VatSettings } from '../../lib/vat';
import { buildSaleReceiptPdf } from '../../lib/receipt';
import { btnPrimary, input, ReceiptActions } from './shared';
import { getNumberingStatus, assignPatientNumber } from '../../lib/patientRecords';
import { loadPatientDirectory, groupPatients, searchGroups, findExistingPerson, addToDirectoryCache, nameKey, type PersonGroup } from '../../lib/patientDirectory';

// Same normalisation the rest of the portal uses for patient phone numbers.
export const formatUkPhone = (raw: string): string => {
  let clean = (raw || '').replace(/[\s\-()]/g, '');
  if (!clean) return '';
  if (clean.startsWith('0044')) clean = `+44${clean.substring(4)}`;
  else if (clean.startsWith('0')) clean = `+44${clean.substring(1)}`;
  else if (clean.startsWith('44')) clean = `+44${clean.substring(2)}`;
  else if (!clean.startsWith('+') && clean.length >= 10) clean = `+44${clean}`;
  return clean;
};

const patientName = (p: any) => p.patientName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unnamed';
const patientAddress = (p: any) => p.address && typeof p.address === 'object'
  ? [p.address.line1, p.address.line2, p.address.town, p.address.postcode].filter(Boolean).join(', ')
  : (p.address || '');

export const patientToCustomer = (p: any): Customer => ({
  name: patientName(p), email: (p.email || '').toLowerCase(), phone: p.phone || '', address: patientAddress(p), patientId: p.id || null,
  ...(p.patientNumber ? { patientNumber: p.patientNumber } : {})
});

// Links a till customer to the CRM: returns the patientId, creating a new
// patient record if they aren't in the CRM yet (mirrors the Orders flow).
// Existing records are only topped up with missing email/phone — never overwritten.
export const ensurePatientForCustomer = async (c: Customer, existing?: any): Promise<string> => {
  const phone = formatUkPhone(c.phone);
  const email = c.email.trim().toLowerCase();
  if (c.patientId) {
    const patch: Record<string, any> = {};
    if (email && !existing?.email) patch.email = email;
    if (phone && !existing?.phone) patch.phone = phone;
    if (Object.keys(patch).length) await setDoc(doc(db, 'patients', c.patientId), patch, { merge: true });
    return c.patientId;
  }
  // Before creating a new record, reuse an existing patient with the same
  // email or phone so the till doesn't add to the duplicates problem.
  const match = findExistingPerson(groupPatients(await loadPatientDirectory()), c.name, email, phone);
  if (match) return ensurePatientForCustomer({ ...c, patientId: match.primary.id }, match.primary);

  const data = { patientName: c.name.trim(), email, phone, source: 'Till' };
  const ref = await addDoc(collection(db, 'patients'), { ...data, createdAt: serverTimestamp() });
  let patientNumber: string | null = null;
  try { if ((await getNumberingStatus()).backfilled) patientNumber = await assignPatientNumber(ref.id); } catch { /* numbered later */ }
  addToDirectoryCache({ id: ref.id, ...data, ...(patientNumber ? { patientNumber } : {}) });
  return ref.id;
};

// ----------------------------------------------------------------------------
// Patient picker used by the till and "Link to patient" in sales history
// ----------------------------------------------------------------------------
export function PatientPicker({ value, onPick, onClear }: { value: Customer; onPick: (p: any) => void; onClear: () => void }) {
  const [text, setText] = useState('');
  const [groups, setGroups] = useState<PersonGroup[] | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (force = false) => {
    setRefreshing(true);
    try { setGroups(groupPatients(await loadPatientDirectory(force))); }
    catch (e: any) { alert(`Couldn't load patients: ${e?.message || e}`); setGroups([]); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  const results = useMemo(() => (groups ? searchGroups(groups, text) : []), [groups, text]);

  if (value.patientId) {
    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-[#3F9185]/10 border border-[#3F9185]/30">
        <div className="flex items-center gap-2 text-sm">
          <User size={16} className="text-[#3F9185]" />
          <div><div className="font-black">{value.name}{value.patientNumber && <span className="ml-2 text-[10px] font-black bg-white text-slate-600 px-1.5 py-0.5 rounded">{value.patientNumber}</span>}</div><div className="text-xs text-slate-500">{[value.email, value.phone].filter(Boolean).join(' · ') || 'CRM patient'}</div></div>
        </div>
        <button className="text-slate-400 hover:text-red-500" onClick={onClear} title="Unlink patient"><X size={16} /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-3 text-slate-400" />
      <input className={`${input} pl-9 pr-9`} placeholder={groups ? 'Search CRM — name, phone, email or patient no.' : 'Loading patients…'} value={text}
        onChange={e => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      <button className="absolute right-3 top-3 text-slate-400 hover:text-[#3F9185]" title="Refresh patient list" onClick={() => load(true)}>
        {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      </button>
      {open && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 overflow-hidden max-h-80 overflow-y-auto">
          {results.map(g => {
            const p = g.primary;
            return (
              <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50"
                onClick={() => {
                  // Fill any gaps in the primary record from its duplicates.
                  const merged = { ...p, email: p.email || g.emails[0] || '', phone: p.phone || g.phones[0] || '' };
                  onPick(merged); setText(''); setOpen(false);
                }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{patientName(p)}</span>
                  {p.patientNumber && <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{p.patientNumber}</span>}
                  {p.dob && <span className="text-xs text-slate-400">{p.dob}</span>}
                  {g.records.length > 1 && <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{g.records.length} records</span>}
                </div>
                <div className="text-xs text-slate-400">{[g.phones.join(', '), g.emails.join(', ')].filter(Boolean).join(' · ')}</div>
              </button>
            );
          })}
        </div>
      )}
      {open && groups && text.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-20 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 p-3 text-xs text-slate-500">
          No CRM match. Fill in name/email/phone below — they'll be added to the CRM when the sale completes.
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// CRM → patient record → "Sales" tab
// ----------------------------------------------------------------------------
export function PatientSales({ patient, onNewSale }: { patient: any; onNewSale?: (p: any) => void }) {
  const [sales, setSales] = useState<any[] | null>(null);
  const [settings, setSettings] = useState<VatSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSales(null);
      try {
        // Include every duplicate CRM record for this person.
        const groups = groupPatients(await loadPatientDirectory());
        const g = groups.find(x => x.records.some(r => r.id === patient.id))
          || findExistingPerson(groups, patient.patientName || '', patient.email || '', patient.phone || '');
        const ids = Array.from(new Set([...(g ? g.records.map(r => r.id) : []), patient.id].filter(id => id && !String(id).startsWith('unknown-')))).slice(0, 30);
        const emails = Array.from(new Set([...(g ? g.emails : []), String(patient.email || '').toLowerCase()].filter(Boolean))).slice(0, 30);
        const phones = Array.from(new Set([...(g ? g.phones : []), patient.phone].filter(Boolean))).slice(0, 30);
        const [s, ...snaps] = await Promise.all([
          loadVatSettings(),
          ids.length ? getDocs(query(collection(db, 'sales'), where('customer.patientId', 'in', ids))) : null,
          emails.length ? getDocs(query(collection(db, 'sales'), where('customer.email', 'in', emails))) : null,
          phones.length ? getDocs(query(collection(db, 'sales'), where('customer.phone', 'in', phones))) : null
        ]);
        const map = new Map<string, any>();
        // Email/phone matches only count for sales NOT linked to someone else
        // AND in this patient's name — families share phones and emails.
        const myName = nameKey(patient.patientName || '');
        snaps.forEach(snap => snap?.docs.forEach(d => {
          const sale: any = { id: d.id, ...d.data() };
          const pid = sale.customer?.patientId;
          if (pid ? ids.includes(pid) : (myName && nameKey(sale.customer?.name) === myName)) map.set(d.id, sale);
        }));
        if (!cancelled) {
          setSettings(s);
          setSales(Array.from(map.values()).sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || '')));
        }
      } catch (e: any) {
        if (!cancelled) { alert(`Couldn't load sales: ${e?.message || e}`); setSales([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [patient.id, patient.email, patient.phone]);

  const lifetime = round2((sales || []).reduce((t, s) => t + (s.totals?.gross || 0), 0));

  return (
    <div className="flex-1 bg-[#f8fafc] p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><ShoppingCart size={16} /> Till Sales</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">{sales ? `${sales.length} found · net spend ${gbp(lifetime)}` : 'Loading…'}</span>
            {onNewSale && <button className={btnPrimary} onClick={() => onNewSale(patient)}><ShoppingCart size={14} /> New sale</button>}
          </div>
        </div>

        {!sales || !settings ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : sales.length === 0 ? (
          <div className="p-10 text-center bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-400 font-bold">No till sales for this patient.</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  {['Date', 'Receipt', 'Items', 'Paid by', 'Total', ''].map(h => <th key={h} className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sales.map(s => (
                  <tr key={s.id} className={s.type === 'refund' ? 'bg-red-50/40' : ''}>
                    <td className="p-4 text-xs font-bold text-slate-500">{s.createdAtIso ? ukDateTime(s.createdAtIso) : s.date}</td>
                    <td className="p-4 text-xs font-bold">{s.receiptNumber}{s.type === 'refund' && <div className="text-[10px] text-red-600 font-black">REFUND of {s.refundOfReceipt}</div>}</td>
                    <td className="p-4 text-xs text-slate-600">{(s.lines || []).map((l: any, i: number) => <div key={i}>{Math.abs(l.qty)} × {l.name}</div>)}</td>
                    <td className="p-4 text-xs">{(s.payments || []).map((p: any) => <div key={p.id}>{p.method}</div>)}</td>
                    <td className="p-4 font-black text-sm">{gbp(s.totals?.gross || 0)}</td>
                    <td className="p-4">
                      <ReceiptActions compact receiptNumber={s.receiptNumber} email={s.customer?.email || patient.email} patientId={s.customer?.patientId} name={s.customer?.name || patient.patientName} isRefund={s.type === 'refund'}
                        build={async () => ({ doc: await buildSaleReceiptPdf(s, settings), receiptNumber: s.receiptNumber })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Re-exported for the till page's "Link to patient" action.
// Also links any refunds already made against the sale.
export const linkSaleToPatient = async (saleId: string, p: any) => {
  const customer = patientToCustomer(p);
  const snap = await getDoc(doc(db, 'sales', saleId));
  const ids: string[] = [saleId, ...((snap.data()?.refundIds as string[]) || [])];
  await Promise.all(ids.map(id => setDoc(doc(db, 'sales', id), { customer }, { merge: true })));
};
