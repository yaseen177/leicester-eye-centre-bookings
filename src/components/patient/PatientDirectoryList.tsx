import { useEffect, useMemo, useState } from 'react';
import { Search, User, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { loadPatientDirectory, groupPatients, searchGroups, nameOf, createdSecs } from '../../lib/patientDirectory';

// Left-hand list for the Patients tab. Real CRM records ONLY — no unknown
// senders or unmatched messages (those live in the Inbox). Searches the whole
// CRM by any part of name, phone, email or patient number.
export default function PatientDirectoryList({ selectedId, onSelect, onNewPatient, onImport, livePatients }: {
  selectedId?: string | null;
  onSelect: (p: any) => void;
  onNewPatient?: () => void;
  onImport?: () => void;
  livePatients?: any[];          // the dashboard's live "recent patients" feed — merged in so new/edited records show instantly
}) {
  const [cached, setList] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async (force = false) => {
    setLoading(true);
    try { setList(await loadPatientDirectory(force)); }
    catch (e: any) { alert(`Couldn't load patients: ${e?.message || e}`); setList([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Directory cache (whole CRM, up to 10 min old) + live recent records on top.
  const list = useMemo(() => {
    if (!cached) return null;
    const map = new Map<string, any>(cached.map(p => [p.id, p]));
    (livePatients || []).forEach(p => { if (p?.id && !p.mergedInto) map.set(p.id, p); else if (p?.mergedInto) map.delete(p.id); });
    return Array.from(map.values());
  }, [cached, livePatients]);

  const groups = useMemo(() => (list ? groupPatients(list) : []), [list]);
  const shown = useMemo(() => {
    if (!list) return [];
    if (text.trim().length >= 2) return searchGroups(groups, text, 60).map(g => g.primary);
    // No search: most recently added first.
    return [...list].sort((a, b) => {
      const sa = createdSecs(a), sb = createdSecs(b);
      return (sb === Number.MAX_SAFE_INTEGER ? 0 : sb) - (sa === Number.MAX_SAFE_INTEGER ? 0 : sa);
    }).slice(0, 60);
  }, [list, groups, text]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="flex gap-2">
          {onNewPatient && (
            <button onClick={onNewPatient} className="flex-1 bg-[#3F9185] hover:bg-teal-700 text-white font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm text-xs">
              <UserPlus size={16} /> New Patient
            </button>
          )}
          {onImport && (
            <button onClick={onImport} className="bg-indigo-500 hover:bg-indigo-600 text-white font-black py-3 px-4 rounded-xl text-xs" title="Import CSV Database">CSV</button>
          )}
          <button onClick={() => load(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-500 py-3 px-3 rounded-xl" title="Refresh list">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input type="text" autoFocus placeholder="Name, phone, email or EC-number…"
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-xs font-bold text-slate-600"
            value={text} onChange={e => setText(e.target.value)} />
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {!list ? 'Loading…' : text.trim().length >= 2 ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : `${list.length} patients · newest first`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!list ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-xs font-bold text-slate-400">No patients found.</p>
        ) : shown.map(p => (
          <button key={p.id} onClick={() => onSelect(p)}
            className={`w-full text-left p-4 border-b border-slate-100 hover:bg-white transition-colors flex items-center gap-3 ${selectedId === p.id ? 'bg-white border-l-4 border-l-[#3F9185]' : ''}`}>
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-black text-xs shrink-0">
              {nameOf(p).split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || <User size={18} />}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-bold text-slate-800 truncate">{nameOf(p) || 'Unnamed'}</p>
              <p className="text-[10px] text-slate-500 truncate">{[p.patientNumber, p.dob, p.phone].filter(Boolean).join(' · ') || p.email || 'No contact info'}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
