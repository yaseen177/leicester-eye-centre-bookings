import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, Loader2, UserPlus, Upload, ChevronRight, RefreshCw } from 'lucide-react';
import { loadPatientDirectory, groupPatients, searchGroups, nameOf } from '../../lib/patientDirectory';

// Patients tab landing page: just a search bar. Picking a result opens the
// full-screen patient dashboard. Searches the whole CRM (not just recent
// records) by any part of name, phone, email or patient number.
export default function PatientSearchHome({ onSelect, onNewPatient, onImport, livePatients }: {
  onSelect: (p: any) => void;
  onNewPatient?: () => void;
  onImport?: () => void;
  livePatients?: any[];   // live recent-patients feed, merged in so brand-new records are findable immediately
}) {
  const [cached, setCached] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async (force = false) => {
    setLoading(true);
    try { setCached(await loadPatientDirectory(force)); }
    catch (e: any) { alert(`Couldn't load patients: ${e?.message || e}`); setCached([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); inputRef.current?.focus(); }, []);

  const list = useMemo(() => {
    if (!cached) return null;
    const map = new Map<string, any>(cached.map(p => [p.id, p]));
    (livePatients || []).forEach(p => { if (!p?.id) return; if (p.mergedInto) map.delete(p.id); else map.set(p.id, p); });
    return Array.from(map.values());
  }, [cached, livePatients]);

  const groups = useMemo(() => (list ? groupPatients(list) : []), [list]);
  const results = useMemo(() => (text.trim().length >= 2 ? searchGroups(groups, text, 25).map(g => g.primary) : []), [groups, text]);
  useEffect(() => setActive(0), [text]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && results[active]) onSelect(results[active]);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#f8fafc]">
      <div className="max-w-2xl mx-auto px-6 pt-16 pb-10">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight text-center">Find a patient</h2>
        <p className="text-sm font-bold text-slate-400 text-center mt-2">
          Search by name, phone, email or patient number{list ? ` · ${list.length.toLocaleString()} patients` : ''}
        </p>

        <div className="relative mt-8">
          <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={list ? 'e.g. Jane Smith, 07700 900123, jane@…, EC-001234' : 'Loading patients…'}
            className="w-full pl-14 pr-14 py-5 rounded-2xl bg-white border-2 border-slate-200 focus:border-[#3F9185] outline-none text-lg font-bold text-slate-700 shadow-sm"
          />
          <button onClick={() => load(true)} title="Refresh patient list" className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#3F9185]">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>

        {text.trim().length >= 2 && (
          <div className="mt-3 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {results.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm font-bold text-slate-400">No patients match “{text.trim()}”.</p>
                {onNewPatient && <button onClick={onNewPatient} className="mt-3 text-sm font-black text-[#3F9185] hover:underline">+ Add them as a new patient</button>}
              </div>
            ) : results.map((p, i) => (
              <button key={p.id} onClick={() => onSelect(p)} onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-5 py-3.5 flex items-center gap-4 border-b border-slate-100 last:border-0 ${i === active ? 'bg-[#3F9185]/5' : ''}`}>
                <div className="w-11 h-11 rounded-full bg-teal-100 text-teal-700 font-black text-sm flex items-center justify-center shrink-0">
                  {nameOf(p).split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800 truncate">{nameOf(p) || 'Unnamed'}</span>
                    {p.patientNumber && <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{p.patientNumber}</span>}
                  </div>
                  <div className="text-xs font-bold text-slate-400 truncate">{[p.dob, p.phone, p.email].filter(Boolean).join(' · ') || 'No contact details'}</div>
                </div>
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-3 mt-8">
          {onNewPatient && (
            <button onClick={onNewPatient} className="px-5 py-3 rounded-xl bg-[#3F9185] hover:bg-teal-700 text-white font-black text-sm flex items-center gap-2 shadow-sm">
              <UserPlus size={16} /> New patient
            </button>
          )}
          {onImport && (
            <button onClick={onImport} className="px-5 py-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-sm flex items-center gap-2">
              <Upload size={16} /> Import CSV
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
