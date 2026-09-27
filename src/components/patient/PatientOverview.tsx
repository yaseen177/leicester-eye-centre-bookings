import { useMemo } from 'react';
import {
  Calendar, Clock, Bell, FileText, ShoppingBag, Wallet, MessageSquare, Mail, Phone, MapPin, Hash, Cake,
  ChevronRight, AlertTriangle, CheckCircle2, Loader2, Contact, Activity
} from 'lucide-react';
import { gbp, round2 } from '../../lib/vat';

// ============================================================================
// PATIENT OVERVIEW — the default "dashboard" for a patient.
// Everything here is read from data the CRM already loads; till sales come
// from usePatientSales in the parent.
// ============================================================================

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (v: any) => { const d = toDate(v); return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
const daysFromNow = (d: Date) => Math.round((d.getTime() - Date.now()) / 86400000);
const relative = (d: Date | null) => {
  if (!d) return '';
  const n = daysFromNow(d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (Math.abs(n) < 60) return n > 0 ? `in ${n} days` : `${-n} days ago`;
  const m = Math.round(Math.abs(n) / 30.4);
  if (m < 24) return n > 0 ? `in ${m} months` : `${m} months ago`;
  const y = Math.round(Math.abs(n) / 365);
  return n > 0 ? `in ${y} years` : `${y} years ago`;
};
const ageOf = (dob: any): number | null => {
  const d = toDate(dob);
  if (!d) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
};
const apptDateTime = (a: any) => toDate(`${a.appointmentDate}T${(a.appointmentTime || '00:00').slice(0, 5)}:00`);
const isCancelled = (s: string) => /cancel/i.test(s || '');
const addressOf = (a: any) => (a && typeof a === 'object' ? [a.line1, a.line2, a.town, a.postcode].filter(Boolean).join(', ') : a || '');
const eyeLine = (e: any) => {
  if (!e) return '—';
  const parts = [e.sph && `${e.sph} DS`, e.cyl && `${e.cyl} DC`, e.axis && `× ${e.axis}`, e.readingAdd && `Add ${e.readingAdd}`].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Plano';
};

export interface OverviewProps {
  patient: any;
  appointments: any[];
  recalls: any[];
  orders: any[];                 // each with _status and _balance
  prescriptions: any[];
  clPlans: any[];
  messages: any[];
  sales: any[] | null;
  onGo: (tab: string) => void;
  onEdit: () => void;
  onOpenOrder: (id: string) => void;
  onNewSale?: () => void;
  onMessage?: () => void;
  onBook?: () => void;
}

export default function PatientOverview(p: OverviewProps) {
  const { patient } = p;
  const now = Date.now();

  const d = useMemo(() => {
    const appts = p.appointments.map(a => ({ ...a, _dt: apptDateTime(a) })).filter(a => a._dt);
    const upcoming = appts.filter(a => a._dt!.getTime() >= now - 3600000 && !isCancelled(a.status) && a.status !== 'FTA' && a.status !== 'Visit Complete')
      .sort((a, b) => a._dt!.getTime() - b._dt!.getTime());
    const past = appts.filter(a => a._dt!.getTime() < now && a.status === 'Visit Complete').sort((a, b) => b._dt!.getTime() - a._dt!.getTime());
    const ftas = appts.filter(a => a.status === 'FTA').length;

    const activeRecalls = p.recalls.filter(r => !/stop|complete|cancel/i.test(r.status || ''))
      .sort((a, b) => (toDate(a.nextRecallDate)?.getTime() || 0) - (toDate(b.nextRecallDate)?.getTime() || 0));

    const openOrders = p.orders.filter(o => !/collected|cancel/i.test(o._status || ''));
    const orderBalance = round2(p.orders.reduce((t, o) => t + Math.max(0, Number(o._balance) || 0), 0));

    const salesTotal = round2((p.sales || []).reduce((t, s) => t + (s.totals?.gross || 0), 0));
    const ordersPaid = round2(p.orders.reduce((t, o) => t + ((Number(o.total) || 0) - (Number(o._balance) || 0)), 0));
    const activeCl = p.clPlans.filter(c => c.status === 'Active' || c.status === 'Mandate Sent' || c.status === 'Needs Setup' || c.status === 'Payment Failed');

    const unread = p.messages.filter(m => m.direction === 'inbound' && !m.isRead).length;
    const lastMsg = [...p.messages].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))[0];

    // Activity timeline
    const events: { at: Date; icon: any; title: string; sub: string; tone: string; onClick?: () => void }[] = [];
    appts.forEach(a => events.push({ at: a._dt!, icon: Calendar, title: a.appointmentType || 'Appointment', sub: a.status || 'Booked', tone: isCancelled(a.status) || a.status === 'FTA' ? 'text-red-500' : 'text-teal-600', onClick: () => p.onGo('ledger') }));
    p.orders.forEach(o => { const at = toDate(o.createdAt); if (at) events.push({ at, icon: ShoppingBag, title: `Glasses order · ${gbp(o.total || 0)}`, sub: o._status || '', tone: 'text-indigo-600', onClick: () => p.onOpenOrder(o.id) }); });
    (p.sales || []).forEach(s => { const at = toDate(s.createdAtIso); if (at) events.push({ at, icon: Wallet, title: `${s.type === 'refund' ? 'Refund' : 'Till sale'} · ${gbp(s.totals?.gross || 0)}`, sub: (s.lines || []).map((l: any) => l.name).slice(0, 2).join(', '), tone: s.type === 'refund' ? 'text-red-500' : 'text-emerald-600', onClick: () => p.onGo('purchases') }); });
    p.prescriptions.forEach(rx => { const at = toDate(rx.dateIssued); if (at) events.push({ at, icon: FileText, title: `Prescription${rx.type === 'External' ? ' (external)' : ''}`, sub: rx.rxStatus || '', tone: 'text-amber-600', onClick: () => p.onGo('prescriptions') }); });
    p.messages.forEach(m => { const at = toDate(m.timestamp); if (at) events.push({ at, icon: m.type === 'email' ? Mail : MessageSquare, title: m.direction === 'inbound' ? 'Message received' : 'Message sent', sub: String(m.text || '').slice(0, 60), tone: 'text-slate-500', onClick: () => p.onGo('chat') }); });
    events.sort((a, b) => b.at.getTime() - a.at.getTime());

    return { upcoming, past, ftas, activeRecalls, openOrders, orderBalance, salesTotal, ordersPaid, activeCl, unread, lastMsg, events: events.filter(e => e.at.getTime() <= now + 86400000 * 365).slice(0, 12), totalVisits: past.length };
  }, [p.appointments, p.recalls, p.orders, p.prescriptions, p.clPlans, p.messages, p.sales]); // eslint-disable-line react-hooks/exhaustive-deps

  const age = ageOf(patient.dob);
  const latestRx = p.prescriptions[0];
  const nextAppt = d.upcoming[0];
  const lastVisit = d.past[0];
  const recall = d.activeRecalls[0];
  const recallDate = recall ? toDate(recall.nextRecallDate) : null;
  const recallOverdue = recallDate ? recallDate.getTime() < now : false;
  const rxExpiry = latestRx ? toDate(latestRx.dateExpiry) : null;
  const lifetime = round2(d.salesTotal + d.ordersPaid);

  const Card = ({ title, icon: Icon, action, onAction, children, className = '' }: any) => (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Icon size={14} /> {title}</h4>
        {action && <button onClick={onAction} className="text-[11px] font-black text-[#3F9185] hover:underline flex items-center gap-0.5">{action} <ChevronRight size={12} /></button>}
      </div>
      {children}
    </div>
  );

  const Stat = ({ label, value, sub, tone = 'text-slate-800', onClick }: any) => (
    <button onClick={onClick} disabled={!onClick} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 text-left hover:border-[#3F9185] transition-colors disabled:hover:border-slate-200 disabled:cursor-default">
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
      <div className={`text-xl font-black mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] font-bold text-slate-500 mt-0.5 truncate">{sub}</div>}
    </button>
  );

  return (
    <div className="flex-1 bg-[#f8fafc] p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Alerts */}
        {(d.orderBalance > 0 || recallOverdue || d.unread > 0 || d.ftas > 0) && (
          <div className="flex flex-wrap gap-2">
            {d.orderBalance > 0 && <span className="text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full flex items-center gap-1.5"><AlertTriangle size={12} /> {gbp(d.orderBalance)} owing on glasses</span>}
            {recallOverdue && <span className="text-xs font-black bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-full flex items-center gap-1.5"><Bell size={12} /> Recall overdue</span>}
            {d.unread > 0 && <button onClick={() => p.onGo('chat')} className="text-xs font-black bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1.5 rounded-full flex items-center gap-1.5"><MessageSquare size={12} /> {d.unread} unread message{d.unread === 1 ? '' : 's'}</button>}
            {d.ftas > 0 && <span className="text-xs font-black bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-full">{d.ftas} missed appointment{d.ftas === 1 ? '' : 's'}</span>}
          </div>
        )}

        {/* Headline stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Next appointment" value={nextAppt ? fmtDate(nextAppt._dt) : 'None booked'} sub={nextAppt ? `${(nextAppt.appointmentTime || '').slice(0, 5)} · ${nextAppt.appointmentType || ''} · ${relative(nextAppt._dt)}` : p.onBook ? '+ Book appointment' : undefined} tone={nextAppt ? 'text-[#3F9185]' : 'text-slate-400'} onClick={nextAppt || !p.onBook ? () => p.onGo('ledger') : p.onBook} />
          <Stat label="Last eye exam / visit" value={lastVisit ? fmtDate(lastVisit._dt) : '—'} sub={lastVisit ? `${relative(lastVisit._dt)} · ${d.totalVisits} visit${d.totalVisits === 1 ? '' : 's'} total` : undefined} onClick={() => p.onGo('ledger')} />
          <Stat label="Recall due" value={recallDate ? fmtDate(recallDate) : 'Not set'} sub={recall ? `${recall.recallType || ''} · ${relative(recallDate)}` : undefined} tone={recallOverdue ? 'text-red-600' : recallDate ? 'text-slate-800' : 'text-slate-400'} onClick={() => p.onGo('recalls')} />
          <Stat label="Balance owing" value={gbp(d.orderBalance)} sub={p.sales === null ? 'loading till sales…' : `Lifetime spend ${gbp(lifetime)}`} tone={d.orderBalance > 0 ? 'text-amber-600' : 'text-green-600'} onClick={() => p.onGo('purchases')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Contact card */}
          <Card title="Patient details" icon={Contact} action="Edit" onAction={p.onEdit}>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5"><Hash size={14} className="text-slate-400 shrink-0" /><span className="font-black">{patient.patientNumber || <span className="text-slate-400 font-bold">No number yet</span>}</span></div>
              <div className="flex items-center gap-2.5"><Cake size={14} className="text-slate-400 shrink-0" />{patient.dob ? <span className="font-bold">{fmtDate(patient.dob)}{age !== null && <span className="text-slate-400 font-bold"> · {age} yrs</span>}</span> : <span className="text-slate-400 font-bold">No DOB</span>}</div>
              <div className="flex items-center gap-2.5"><Phone size={14} className="text-slate-400 shrink-0" /><span className="font-bold">{patient.phone || <span className="text-slate-400">No phone</span>}</span></div>
              <div className="flex items-center gap-2.5 min-w-0"><Mail size={14} className="text-slate-400 shrink-0" /><span className="font-bold truncate">{patient.email || <span className="text-slate-400">No email</span>}</span></div>
              <div className="flex items-start gap-2.5"><MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" /><span className="font-bold">{addressOf(patient.address) || <button onClick={p.onEdit} className="text-amber-600 hover:underline">Add address</button>}</span></div>
              {((patient.otherPhones || []).length > 0 || (patient.otherEmails || []).length > 0) && (
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">Also: {[...(patient.otherPhones || []), ...(patient.otherEmails || [])].join(', ')}</div>
              )}
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
              {p.onMessage && <button onClick={p.onMessage} className="flex-1 text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl flex items-center justify-center gap-1.5"><MessageSquare size={13} /> Message</button>}
              {p.onNewSale && <button onClick={p.onNewSale} className="flex-1 text-xs font-black bg-[#3F9185] hover:bg-teal-700 text-white py-2 rounded-xl flex items-center justify-center gap-1.5"><Wallet size={13} /> New sale</button>}
            </div>
          </Card>

          {/* Latest prescription */}
          <Card title="Latest prescription" icon={FileText} action="All" onAction={() => p.onGo('prescriptions')}>
            {!latestRx ? <p className="text-sm font-bold text-slate-400">No prescriptions on file.</p> : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Issued {fmtDate(latestRx.dateIssued)}{latestRx.type === 'External' ? ' · external' : ''}</span>
                  {latestRx.rxStatus && <span className="text-[10px] font-black uppercase bg-slate-100 px-2 py-0.5 rounded">{latestRx.rxStatus}</span>}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                  <div><span className="font-black text-slate-500 mr-2">R</span>{eyeLine(latestRx.right)}</div>
                  <div><span className="font-black text-slate-500 mr-2">L</span>{latestRx.sameBothEyes ? eyeLine(latestRx.right) : eyeLine(latestRx.left)}</div>
                </div>
                {rxExpiry && <p className={`text-[11px] font-bold ${rxExpiry.getTime() < now ? 'text-red-600' : 'text-slate-500'}`}>{rxExpiry.getTime() < now ? 'Expired' : 'Valid until'} {fmtDate(rxExpiry)}</p>}
              </div>
            )}
          </Card>

          {/* Purchases summary */}
          <Card title="Purchases" icon={ShoppingBag} action="All" onAction={() => p.onGo('purchases')}>
            <div className="space-y-2.5 text-sm">
              {d.openOrders.length === 0 ? <p className="font-bold text-slate-400">No glasses orders in progress.</p> : d.openOrders.slice(0, 3).map(o => (
                <button key={o.id} onClick={() => p.onOpenOrder(o.id)} className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 rounded-xl px-3 py-2 text-left">
                  <span className="font-bold text-xs">{(o.items || []).length} pair{(o.items || []).length === 1 ? '' : 's'} · {gbp(o.total || 0)}</span>
                  <span className="text-[10px] font-black uppercase text-indigo-600">{o._status}</span>
                </button>
              ))}
              {d.activeCl.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                  <span className="font-bold text-xs">CL plan · {c.lensType || 'Contact lenses'}</span>
                  <span className="text-[10px] font-black text-slate-600">{gbp(Number(c.monthlyAmount) || 0)}/mo · {c.status}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-500">
                <span>Till purchases</span>
                <span>{p.sales === null ? <Loader2 size={12} className="animate-spin inline" /> : `${p.sales.filter(s => s.type !== 'refund').length} · ${gbp(d.salesTotal)}`}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Activity */}
        <Card title="Recent activity" icon={Activity}>
          {d.events.length === 0 ? <p className="text-sm font-bold text-slate-400">Nothing yet.</p> : (
            <div className="divide-y divide-slate-100">
              {d.events.map((e, i) => {
                const Icon = e.icon;
                const future = e.at.getTime() > now;
                return (
                  <button key={i} onClick={e.onClick} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-50 rounded-lg px-2 -mx-2">
                    <div className={`w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0 ${e.tone}`}><Icon size={15} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">{e.title}</div>
                      {e.sub && <div className="text-[11px] text-slate-500 truncate">{e.sub}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-bold text-slate-500">{fmtDate(e.at)}</div>
                      <div className={`text-[10px] font-bold ${future ? 'text-[#3F9185]' : 'text-slate-400'} flex items-center gap-1 justify-end`}>{future ? <Clock size={10} /> : <CheckCircle2 size={10} />} {relative(e.at)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
