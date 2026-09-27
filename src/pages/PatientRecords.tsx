import { useEffect, useMemo, useState } from 'react';
import { Hash, Users, Loader2, GitMerge, EyeOff, RefreshCw, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadPatientDirectory, findDuplicateGroups, nameOf, createdSecs, type PersonGroup } from '../lib/patientDirectory';
import { getNumberingStatus, backfillPatientNumbers, assignPatientNumber, formatPatientNumber, previewMerge, executeMerge, type MergePreview } from '../lib/patientRecords';
import { loadVatSettings, blankCustomer } from '../lib/till';
import { btnPrimary, btnGhost, btnDanger, input, card, label, Modal, useStaffPicker } from '../components/till/shared';
import { PatientPicker } from '../components/till/PatientLink';

const fmtDate = (p: any) => {
  const s = createdSecs(p);
  return s && s !== Number.MAX_SAFE_INTEGER ? new Date(s * 1000).toLocaleDateString('en-GB') : '—';
};
const fmtAddr = (a: any) => (a && typeof a === 'object' ? [a.line1, a.town, a.postcode].filter(Boolean).join(', ') : a || '');
const groupSig = (g: PersonGroup) => g.records.map(r => r.id).sort().join('|');
const IGNORE_DOC = () => doc(db, 'settings', 'duplicateIgnores');

export default function PatientRecords() {
  const [patients, setPatients] = useState<any[] | null>(null);
  const [status, setStatus] = useState<{ next: number; backfilled: boolean } | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [filter, setFilter] = useState('');
  const [manual, setManual] = useState<{ a: any | null; b: any | null }>({ a: null, b: null });
  const [mergeTarget, setMergeTarget] = useState<PersonGroup | null>(null);
  const { staffModal, askStaff } = useStaffPicker(staffNames);

  const load = async () => {
    setPatients(null);
    const [list, st, ig, settings] = await Promise.all([
      loadPatientDirectory(true), getNumberingStatus(), getDoc(IGNORE_DOC()), loadVatSettings()
    ]);
    setPatients(list);
    setStatus(st);
    setIgnored(new Set((ig.data()?.signatures as string[]) || []));
    setStaffNames(settings.staffNames);
  };
  useEffect(() => { load().catch(e => alert(`Couldn't load patients: ${e?.message || e}`)); }, []);

  const unnumbered = (patients || []).filter(p => !p.patientNumber).length;
  const groups = useMemo(() => (patients ? findDuplicateGroups(patients).filter(g => !ignored.has(groupSig(g))) : []), [patients, ignored]);
  const shownGroups = groups.filter(g => !filter.trim() || g.names.join(' ').toLowerCase().includes(filter.trim().toLowerCase()));
  const dupRecordCount = groups.reduce((t, g) => t + g.records.length - 1, 0);

  const runBackfill = async () => {
    if (!confirm(`Give all ${unnumbered} patients a permanent number, oldest first? This can't be undone.\n\nTip: merge obvious duplicates first so they don't use up numbers.`)) return;
    setBusy('backfill');
    try {
      const n = await backfillPatientNumbers((d, t) => setProgress(`${d} / ${t}`));
      alert(`Done — ${n} patients numbered.`);
      await load();
    } catch (e: any) { alert(`Numbering failed: ${e?.message || e}`); }
    finally { setBusy(''); setProgress(''); }
  };

  const numberRemaining = async () => {
    setBusy('remaining');
    try {
      const todo = (patients || []).filter(p => !p.patientNumber).sort((a, b) => createdSecs(a) - createdSecs(b));
      for (let i = 0; i < todo.length; i++) { await assignPatientNumber(todo[i].id); setProgress(`${i + 1} / ${todo.length}`); }
      await load();
    } catch (e: any) { alert(`Numbering failed: ${e?.message || e}`); }
    finally { setBusy(''); setProgress(''); }
  };

  const ignoreGroup = async (g: PersonGroup) => {
    if (!confirm(`Mark these ${g.records.length} records as different people? They won't be flagged again (unless another matching record appears).`)) return;
    await setDoc(IGNORE_DOC(), { signatures: arrayUnion(groupSig(g)) }, { merge: true });
    setIgnored(new Set([...ignored, groupSig(g)]));
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* ---------------- Patient numbers ---------------- */}
      <div className={card}>
        <h3 className="font-black text-lg flex items-center gap-2 mb-1"><Hash size={18} /> Patient numbers</h3>
        {!status || !patients ? <Loader2 className="animate-spin text-slate-400" /> : !status.backfilled ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Every patient gets a permanent number like <b>{formatPatientNumber(1)}</b>, shown in the CRM, till and receipts and searchable everywhere. Existing patients are numbered oldest first; after that, new patients are numbered automatically.</p>
            {dupRecordCount > 0 && <p className="text-sm font-bold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={14} /> {dupRecordCount} duplicate records found below — merge those first so they don't take numbers.</p>}
            <button className={btnPrimary} onClick={runBackfill} disabled={!!busy}>{busy === 'backfill' ? <Loader2 size={14} className="animate-spin" /> : <Hash size={14} />} Number all {unnumbered} patients {progress && `(${progress})`}</button>
          </div>
        ) : (
          <div className="text-sm text-slate-600 space-y-2">
            <p className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> Numbering is on. Next number: <b>{formatPatientNumber(status.next)}</b>. New patients are numbered automatically when they appear in the CRM.</p>
            {unnumbered > 0 && <button className={btnGhost} onClick={numberRemaining} disabled={!!busy}>{busy === 'remaining' && <Loader2 size={14} className="animate-spin" />} Number the {unnumbered} patient(s) still without one {progress && `(${progress})`}</button>}
          </div>
        )}
      </div>

      {/* ---------------- Duplicates ---------------- */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-black text-lg flex items-center gap-2"><Users size={18} /> Possible duplicates {patients && <span className="text-sm text-slate-400">({groups.length} people, {dupRecordCount} extra records)</span>}</h3>
          <div className="flex gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input className={`${input} pl-8 !w-56`} placeholder="Filter by name" value={filter} onChange={e => setFilter(e.target.value)} /></div>
            <button className={btnGhost} onClick={() => load()}><RefreshCw size={14} /> Refresh</button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-4">Flagged when the <b>name matches</b> and the records share an email, phone or date of birth. Records with different dates of birth are never flagged, and family members sharing a phone or email aren't flagged unless their names match.</p>

        {!patients ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>
          : shownGroups.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No duplicates found 🎉</p>
            : (
              <div className="space-y-3">
                {shownGroups.slice(0, 100).map(g => (
                  <div key={groupSig(g)} className="border border-slate-200 rounded-2xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-black">{nameOf(g.primary)} <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ml-1">{g.records.length} records</span></div>
                      <div className="flex gap-1.5">
                        <button className={btnPrimary} onClick={() => setMergeTarget(g)}><GitMerge size={14} /> Review & merge</button>
                        <button className={btnGhost} onClick={() => ignoreGroup(g)}><EyeOff size={14} /> Not the same person</button>
                      </div>
                    </div>
                    <RecordsTable records={g.records} />
                  </div>
                ))}
                {shownGroups.length > 100 && <p className="text-xs text-slate-400 text-center">Showing first 100 — merge some or filter by name to see more.</p>}
              </div>
            )}
      </div>

      {/* ---------------- Manual merge ---------------- */}
      <div className={card}>
        <h3 className="font-black text-lg flex items-center gap-2 mb-1"><GitMerge size={18} /> Merge two records manually</h3>
        <p className="text-xs text-slate-500 mb-3">For duplicates the checker can't spot (e.g. a misspelt name). Pick both records, then review before anything changes.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><span className={label}>Record A</span>
            <PatientPicker value={manual.a ? { ...blankCustomer(), name: nameOf(manual.a), email: manual.a.email || '', phone: manual.a.phone || '', patientId: manual.a.id, patientNumber: manual.a.patientNumber } : blankCustomer()}
              onPick={p => setManual({ ...manual, a: p })} onClear={() => setManual({ ...manual, a: null })} /></div>
          <div><span className={label}>Record B</span>
            <PatientPicker value={manual.b ? { ...blankCustomer(), name: nameOf(manual.b), email: manual.b.email || '', phone: manual.b.phone || '', patientId: manual.b.id, patientNumber: manual.b.patientNumber } : blankCustomer()}
              onPick={p => setManual({ ...manual, b: p })} onClear={() => setManual({ ...manual, b: null })} /></div>
        </div>
        <button className={`${btnPrimary} mt-3`} disabled={!manual.a || !manual.b || manual.a.id === manual.b.id}
          onClick={() => setMergeTarget({ primary: manual.a, records: [manual.a, manual.b], names: [], emails: [], phones: [] })}>
          <GitMerge size={14} /> Review merge
        </button>
      </div>

      {mergeTarget && (
        <MergeModal group={mergeTarget} askStaff={askStaff} onClose={() => setMergeTarget(null)}
          onDone={() => { setMergeTarget(null); setManual({ a: null, b: null }); load(); }} />
      )}
      {staffModal}
    </div>
  );
}

function RecordsTable({ records, keepId, included, onKeep, onToggle }: {
  records: any[]; keepId?: string; included?: Set<string>; onKeep?: (id: string) => void; onToggle?: (id: string) => void;
}) {
  const selectable = !!onKeep;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] uppercase text-slate-400">
          {selectable && <th className="py-1">Keep</th>}{selectable && <th>Merge</th>}
          <th className="py-1">Name</th><th>No.</th><th>DOB</th><th>Phone</th><th>Email</th><th>Address</th><th>Created</th>
        </tr></thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className={`border-t border-slate-100 ${keepId === r.id ? 'bg-green-50' : ''}`}>
              {selectable && <td className="py-1.5"><input type="radio" className="accent-[#3F9185]" checked={keepId === r.id} onChange={() => onKeep!(r.id)} /></td>}
              {selectable && <td><input type="checkbox" disabled={keepId === r.id} checked={keepId !== r.id && !!included?.has(r.id)} onChange={() => onToggle!(r.id)} /></td>}
              <td className="py-1.5 font-bold">{nameOf(r)}</td>
              <td>{r.patientNumber || '—'}</td>
              <td>{r.dob || '—'}</td>
              <td>{r.phone || '—'}</td>
              <td>{r.email || '—'}</td>
              <td>{fmtAddr(r.address) || '—'}</td>
              <td>{fmtDate(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COL_LABELS: Record<string, string> = {
  appointments: 'Appointments', dispenseOrders: 'Glasses orders', prescriptions: 'Prescriptions', recalls: 'Recalls',
  clSubscriptions: 'CL direct debits', quotes: 'Quotes', sales: 'Till sales'
};

function MergeModal({ group, askStaff, onClose, onDone }: {
  group: PersonGroup; askStaff: (t?: string, c?: string) => Promise<string | null>; onClose: () => void; onDone: () => void;
}) {
  const [keepId, setKeepId] = useState(group.primary.id);
  const [included, setIncluded] = useState<Set<string>>(new Set(group.records.map(r => r.id)));
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toMerge = group.records.filter(r => r.id !== keepId && included.has(r.id));
  const dobs = new Set(group.records.filter(r => r.id === keepId || included.has(r.id)).map(r => String(r.dob || '').trim()).filter(Boolean));

  const toggle = (id: string) => { const n = new Set(included); if (n.has(id)) n.delete(id); else n.add(id); setIncluded(n); setPreview(null); };

  const runPreview = async () => {
    setLoading(true);
    try { setPreview(await previewMerge(group.records.find(r => r.id === keepId), toMerge)); }
    catch (e: any) { alert(`Preview failed: ${e?.message || e}`); }
    finally { setLoading(false); }
  };

  const confirmMerge = async () => {
    if (!preview) return;
    const who = await askStaff(`Who is merging ${toMerge.length + 1} records for ${nameOf(preview.keep)}?`, 'Merge records');
    if (!who) return;
    setSaving(true);
    try { await executeMerge(preview, who); onDone(); }
    catch (e: any) { alert(`Merge failed part-way: ${e?.message || e}\n\nRun the merge again — it picks up where it stopped.`); }
    finally { setSaving(false); }
  };

  const moved = preview ? Object.entries(preview.counts).filter(([, n]) => n > 0) : [];

  return (
    <Modal title={`Merge records — ${nameOf(group.primary)}`} onClose={onClose} wide>
      <p className="text-xs text-slate-500 mb-2">Choose the record to <b>keep</b> (green). Ticked records are merged into it and archived.</p>
      <RecordsTable records={group.records} keepId={keepId} included={included} onKeep={id => { setKeepId(id); setPreview(null); }} onToggle={toggle} />
      {dobs.size > 1 && <p className="text-xs font-bold text-red-600 mt-2 flex items-center gap-1"><AlertTriangle size={12} /> These records have different dates of birth — are you sure they're the same person?</p>}

      {!preview ? (
        <button className={`${btnPrimary} mt-4`} onClick={runPreview} disabled={loading || toMerge.length === 0}>{loading && <Loader2 size={14} className="animate-spin" />} Preview merge</button>
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="font-black mb-1">What will happen</div>
            <ul className="list-disc pl-5 space-y-0.5 text-xs">
              <li>Keep <b>{nameOf(preview.keep)}</b>{preview.keep.patientNumber ? ` (${preview.keep.patientNumber})` : preview.filled.patientNumber ? ` — takes number ${preview.filled.patientNumber}` : ''}.</li>
              {Object.keys(preview.filled).filter(k => k !== 'patientNumber').length > 0 && <li>Fill blank fields from the duplicates: {Object.keys(preview.filled).filter(k => k !== 'patientNumber').join(', ')}.</li>}
              {preview.otherEmails.length > 0 && <li>Keep extra email(s) on file: {preview.otherEmails.join(', ')}.</li>}
              {preview.otherPhones.length > 0 && <li>Keep extra phone(s) on file: {preview.otherPhones.join(', ')}.</li>}
              {preview.otherPatientNumbers.length > 0 && <li>Old patient numbers still find this patient: {preview.otherPatientNumbers.join(', ')}.</li>}
              <li>{moved.length ? <>Move to the kept record: {moved.map(([c, n]) => `${n} ${COL_LABELS[c] || c}`).join(', ')}.</> : 'Nothing else is linked to the duplicates.'}</li>
              <li>Archive {preview.merge.length} duplicate record(s) — hidden from the CRM, not deleted.</li>
            </ul>
          </div>
          <div className="flex gap-2">
            <button className={btnDanger} onClick={confirmMerge} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />} Merge now</button>
            <button className={btnGhost} onClick={() => setPreview(null)}>Back</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
