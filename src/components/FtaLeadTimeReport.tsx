import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Target } from 'lucide-react';

// ---------------------------------------------------------------------------
// FTA vs booking lead time.
// Answers: "do people who book further ahead FTA more, and where should the
// online booking window be cut off?"
//
// Only appointments whose date has passed are counted, and only those with a
// recorded outcome: FTA, or attended (Visit Complete / Arrived / In Progress).
// Past appointments still sitting on Booked/Confirmed were never marked either
// way, so they're shown separately as "unmarked" and kept out of the rates.
// Cancellations are deleted from the system, so they can't be counted here.
// ---------------------------------------------------------------------------

const ATTENDED = new Set(['Visit Complete', 'Completed', 'Arrived', 'In Progress']);

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: 'Same day', min: 0, max: 0 },
  { label: '1–2 days', min: 1, max: 2 },
  { label: '3–7 days', min: 3, max: 7 },
  { label: '8–14 days', min: 8, max: 14 },
  { label: '15–21 days', min: 15, max: 21 },
  { label: '22–28 days', min: 22, max: 28 },
  { label: '29+ days', min: 29, max: 9999 },
];

const CUTOFFS = [7, 10, 14, 21, 28];

const PERIODS = [
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '180', label: 'Last 6 months', days: 180 },
  { key: '365', label: 'Last 12 months', days: 365 },
  { key: 'all', label: 'All time', days: null as number | null },
];

const MIN_SAMPLE = 10; // below this a rate is noise, flag it

const toDate = (raw: any): Date | null => {
  if (!raw) return null;
  try {
    if (typeof raw.toDate === 'function') return raw.toDate();
    if (raw.seconds) return new Date(raw.seconds * 1000);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
};

const parseApptDate = (s: string): Date | null => {
  if (!s) return null;
  const p = s.split(/[-/]/);
  if (p.length === 3) {
    if (p[0].length === 4) return new Date(+p[0], +p[1] - 1, +p[2]);
    if (p[2].length === 4) return new Date(+p[2], +p[1] - 1, +p[0]);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const dayOnly = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

type Row = {
  id: string;
  name: string;
  source: 'Online' | 'Staff';
  type: string;
  bookedOn: Date;
  apptDate: Date;
  apptTime: string;
  lead: number;
  outcome: 'FTA' | 'Attended' | 'Unmarked';
};

type Cell = { resolved: number; fta: number; unmarked: number };
const emptyCell = (): Cell => ({ resolved: 0, fta: 0, unmarked: 0 });

export default function FtaLeadTimeReport({ appointments }: { appointments: any[] }) {
  const [period, setPeriod] = useState('all');
  const [showList, setShowList] = useState(false);

  const data = useMemo(() => {
    const today = dayOnly(new Date());
    const periodDays = PERIODS.find(p => p.key === period)?.days ?? null;
    const since = periodDays ? new Date(today.getTime() - periodDays * 86400000) : null;

    const rows: Row[] = [];
    let skippedNoCreatedAt = 0;

    appointments.forEach((a: any) => {
      if (a.appointmentType === 'Dispensing') return;

      // If an FTA was later rescheduled, judge it on the date they actually missed.
      const wasFta = a.status === 'FTA' || !!a.ftaDate;
      const apptDate = parseApptDate(wasFta && a.ftaDate ? a.ftaDate : a.appointmentDate);
      if (!apptDate || apptDate >= today) return;
      if (since && apptDate < since) return;

      const booked = toDate(a.createdAt || a.timestamp || a.created_at || a.dateBooked);
      if (!booked) { skippedNoCreatedAt++; return; }

      const lead = Math.round((dayOnly(apptDate).getTime() - dayOnly(booked).getTime()) / 86400000);
      if (lead < 0 || lead > 365) return;

      const src = (a.source || a.bookingSource || '').toLowerCase();
      const source: Row['source'] = ['online', 'website', 'web'].includes(src) ? 'Online' : 'Staff';

      const outcome: Row['outcome'] = wasFta ? 'FTA' : ATTENDED.has(a.status) ? 'Attended' : 'Unmarked';

      rows.push({
        id: a.id,
        name: a.patientName || 'Unknown',
        source,
        type: a.appointmentType || '—',
        bookedOn: booked,
        apptDate,
        apptTime: (wasFta && a.ftaTime) || a.appointmentTime || '',
        lead,
        outcome,
      });
    });

    // Bucket x source table
    const table = BUCKETS.map(b => {
      const cells = { Online: emptyCell(), Staff: emptyCell(), All: emptyCell() };
      rows.filter(r => r.lead >= b.min && r.lead <= b.max).forEach(r => {
        for (const k of [r.source, 'All'] as const) {
          if (r.outcome === 'Unmarked') cells[k].unmarked++;
          else { cells[k].resolved++; if (r.outcome === 'FTA') cells[k].fta++; }
        }
      });
      return { ...b, cells };
    });

    // Cutoff simulator: ONLINE bookings only, since the cap only applies online.
    const online = rows.filter(r => r.source === 'Online' && r.outcome !== 'Unmarked');
    const onlineFtas = online.filter(r => r.outcome === 'FTA').length;
    const sims = CUTOFFS.map(n => {
      const kept = online.filter(r => r.lead <= n);
      const blocked = online.filter(r => r.lead > n);
      const keptFta = kept.filter(r => r.outcome === 'FTA').length;
      const blockedFta = blocked.filter(r => r.outcome === 'FTA').length;
      return {
        n,
        blocked: blocked.length,
        blockedPct: pct(blocked.length, online.length),
        blockedFta,
        ftasPreventedPct: pct(blockedFta, onlineFtas),
        keptRate: pct(keptFta, kept.length),
        blockedRate: pct(blockedFta, blocked.length),
        // Attenders you'd push to the phone (or lose) for every FTA prevented.
        goodPerFta: blockedFta ? Math.round(((blocked.length - blockedFta) / blockedFta) * 10) / 10 : null,
      };
    });

    const resolvedAll = rows.filter(r => r.outcome !== 'Unmarked');
    const ftaAll = resolvedAll.filter(r => r.outcome === 'FTA');
    const median = (xs: number[]) => {
      if (!xs.length) return 0;
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    return {
      rows,
      table,
      sims,
      onlineResolved: online.length,
      onlineFtas,
      totalResolved: resolvedAll.length,
      totalFta: ftaAll.length,
      unmarked: rows.length - resolvedAll.length,
      skippedNoCreatedAt,
      medianLeadFta: median(ftaAll.map(r => r.lead)),
      medianLeadAttended: median(resolvedAll.filter(r => r.outcome === 'Attended').map(r => r.lead)),
      onlineFtaRate: pct(onlineFtas, online.length),
      staffFtaRate: pct(
        resolvedAll.filter(r => r.source === 'Staff' && r.outcome === 'FTA').length,
        resolvedAll.filter(r => r.source === 'Staff').length
      ),
    };
  }, [appointments, period]);

  const ftaRows = data.rows.filter(r => r.outcome === 'FTA').sort((a, b) => b.apptDate.getTime() - a.apptDate.getTime());

  const exportCsv = () => {
    const header = ['Patient', 'Source', 'Visit type', 'Booked on', 'Appointment date', 'Time', 'Days booked ahead', 'Outcome'];
    const lines = data.rows
      .sort((a, b) => b.apptDate.getTime() - a.apptDate.getTime())
      .map(r => [
        r.name, r.source, r.type,
        r.bookedOn.toLocaleDateString('en-GB'), r.apptDate.toLocaleDateString('en-GB'),
        r.apptTime, r.lead, r.outcome,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fta-lead-time-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const rateColour = (rate: number, n: number) =>
    n < MIN_SAMPLE ? 'text-slate-400' : rate >= 25 ? 'text-red-600' : rate >= 15 ? 'text-orange-500' : 'text-emerald-600';

  const RateCell = ({ c }: { c: Cell }) => (
    <td className="p-3 text-center">
      {c.resolved === 0 ? <span className="text-slate-300">—</span> : (
        <div>
          <span className={`font-black ${rateColour(pct(c.fta, c.resolved), c.resolved)}`}>{pct(c.fta, c.resolved)}%</span>
          <span className="block text-[10px] text-slate-400 font-bold">
            {c.fta}/{c.resolved}{c.resolved < MIN_SAMPLE ? ' · low data' : ''}
          </span>
        </div>
      )}
    </td>
  );

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><AlertTriangle size={18} /> FTA vs Booking Lead Time</h2>
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <p className="font-bold text-slate-800">Do patients who book further ahead fail to attend more?</p>
            <p className="text-sm text-slate-500 mt-1">Past eye-clinic appointments with a recorded outcome. FTA rate = FTAs ÷ (FTAs + attended).</p>
          </div>
          <div className="flex gap-2 items-center">
            <select value={period} onChange={e => setPeriod(e.target.value)} className="p-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white">
              {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button onClick={exportCsv} className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
              <Download size={15} /> CSV
            </button>
          </div>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase text-slate-400">Online FTA rate</p>
            <p className="text-2xl font-black text-red-600">{data.onlineFtaRate}%</p>
            <p className="text-[11px] text-slate-400 font-bold">{data.onlineFtas} of {data.onlineResolved}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase text-slate-400">Staff-booked FTA rate</p>
            <p className="text-2xl font-black text-slate-700">{data.staffFtaRate}%</p>
            <p className="text-[11px] text-slate-400 font-bold">phone / walk-in / admin</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase text-slate-400">Median days ahead: FTAs</p>
            <p className="text-2xl font-black text-slate-700">{data.medianLeadFta}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase text-slate-400">Median days ahead: attended</p>
            <p className="text-2xl font-black text-slate-700">{data.medianLeadAttended}</p>
          </div>
        </div>

        {/* Bucket table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                <th className="p-3 text-left">Booked ahead</th>
                <th className="p-3 text-center">Online</th>
                <th className="p-3 text-center">Staff-booked</th>
                <th className="p-3 text-center">All</th>
                <th className="p-3 text-center">Unmarked</th>
              </tr>
            </thead>
            <tbody>
              {data.table.map(b => (
                <tr key={b.label} className="border-b border-slate-50">
                  <td className="p-3 font-bold text-slate-700">{b.label}</td>
                  <RateCell c={b.cells.Online} />
                  <RateCell c={b.cells.Staff} />
                  <RateCell c={b.cells.All} />
                  <td className="p-3 text-center text-slate-400 font-bold">{b.cells.All.unmarked || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cutoff simulator */}
        <div>
          <p className="font-bold text-slate-800 flex items-center gap-2"><Target size={16} /> What would each online booking window have done?</p>
          <p className="text-sm text-slate-500 mt-1 mb-3">Replays past <strong>online</strong> bookings against each limit. "Blocked" bookings would have had to phone instead.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                  <th className="p-3 text-left">Window</th>
                  <th className="p-3 text-center">Online bookings blocked</th>
                  <th className="p-3 text-center">Online FTAs prevented</th>
                  <th className="p-3 text-center">FTA rate: kept</th>
                  <th className="p-3 text-center">FTA rate: blocked</th>
                  <th className="p-3 text-center">Attenders blocked per FTA prevented</th>
                </tr>
              </thead>
              <tbody>
                {data.sims.map(s => (
                  <tr key={s.n} className={`border-b border-slate-50 ${s.n === 14 ? 'bg-teal-50/50' : ''}`}>
                    <td className="p-3 font-black text-slate-700">{s.n} days{s.n === 14 ? ' (current)' : ''}</td>
                    <td className="p-3 text-center font-bold text-slate-600">{s.blockedPct}% <span className="text-[10px] text-slate-400">({s.blocked})</span></td>
                    <td className="p-3 text-center font-black text-emerald-600">{s.ftasPreventedPct}% <span className="text-[10px] text-slate-400">({s.blockedFta})</span></td>
                    <td className="p-3 text-center font-bold text-slate-600">{s.keptRate}%</td>
                    <td className={`p-3 text-center font-black ${rateColour(s.blockedRate, s.blocked)}`}>{s.blocked ? `${s.blockedRate}%` : '—'}{s.blocked > 0 && s.blocked < MIN_SAMPLE ? <span className="block text-[10px] text-slate-400">low data</span> : null}</td>
                    <td className="p-3 text-center font-bold text-slate-600">{s.goodPerFta ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            <strong>How to read it:</strong> choose the shortest window where the "blocked" FTA rate is still clearly higher than the "kept" rate,
            and "attenders blocked per FTA prevented" stays low (under ~3 is a good trade). Past that point you're mostly
            sending good patients to the phone.
          </p>
        </div>

        {/* FTA patient list */}
        <div>
          <button onClick={() => setShowList(v => !v)} className="text-sm font-bold text-[#3F9185] hover:underline">
            {showList ? 'Hide' : 'Show'} FTA patients ({ftaRows.length})
          </button>
          {showList && (
            <div className="overflow-x-auto mt-3 max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                    <th className="p-2 text-left">Patient</th>
                    <th className="p-2 text-left">Source</th>
                    <th className="p-2 text-left">Visit type</th>
                    <th className="p-2 text-left">Booked on</th>
                    <th className="p-2 text-left">Appointment</th>
                    <th className="p-2 text-center">Days ahead</th>
                  </tr>
                </thead>
                <tbody>
                  {ftaRows.map(r => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="p-2 font-bold text-slate-700">{r.name}</td>
                      <td className="p-2"><span className={`px-2 py-0.5 rounded text-[10px] font-black ${r.source === 'Online' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{r.source}</span></td>
                      <td className="p-2 text-slate-500">{r.type}</td>
                      <td className="p-2 text-slate-500">{r.bookedOn.toLocaleDateString('en-GB')}</td>
                      <td className="p-2 text-slate-500">{r.apptDate.toLocaleDateString('en-GB')} {r.apptTime}</td>
                      <td className="p-2 text-center font-black text-slate-700">{r.lead}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(data.unmarked > 0 || data.skippedNoCreatedAt > 0) && (
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-4">
            Data gaps: {data.unmarked > 0 && <>{data.unmarked} past appointment{data.unmarked !== 1 ? 's' : ''} still on Booked/Confirmed (never marked attended or FTA), left out of the rates. </>}
            {data.skippedNoCreatedAt > 0 && <>{data.skippedNoCreatedAt} older record{data.skippedNoCreatedAt !== 1 ? 's have' : ' has'} no booking timestamp, so lead time can't be worked out. </>}
            Cancellations are deleted, so they aren't included.
          </p>
        )}
      </div>
    </div>
  );
}