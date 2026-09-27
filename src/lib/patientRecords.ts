// ============================================================================
// PATIENT RECORDS — patient numbers (EC-000123) and merging duplicate records
// ============================================================================

import {
  collection, doc, getDoc, getDocs, query, where, runTransaction, writeBatch, serverTimestamp, arrayUnion
} from 'firebase/firestore';
import { db } from './firebase';
import { createdSecs, emailKey, phoneKey, invalidateDirectory } from './patientDirectory';

// ----------------------------------------------------------------------------
// Patient numbers
// ----------------------------------------------------------------------------
// counters/patients = { next: number, backfilled: boolean }
// Numbers are permanent: a merged-away record's number is kept on the
// surviving record in `otherPatientNumbers` so old paperwork still resolves.

export const formatPatientNumber = (n: number) => `EC-${String(n).padStart(6, '0')}`;

const counterRef = () => doc(db, 'counters', 'patients');

export const getNumberingStatus = async (): Promise<{ next: number; backfilled: boolean }> => {
  const snap = await getDoc(counterRef());
  return { next: Number(snap.data()?.next) || 1, backfilled: !!snap.data()?.backfilled };
};

// Safe for one-at-a-time use (new patients): a transaction per patient means
// two admin tabs can never give the same patient two numbers.
export const assignPatientNumber = async (patientId: string): Promise<string | null> => {
  const pRef = doc(db, 'patients', patientId);
  return runTransaction(db, async tx => {
    const [ps, cs] = await Promise.all([tx.get(pRef), tx.get(counterRef())]);
    if (!ps.exists() || ps.data().mergedInto) return null;
    if (ps.data().patientNumber) return ps.data().patientNumber as string;
    const next = Number(cs.data()?.next) || 1;
    const num = formatPatientNumber(next);
    tx.set(counterRef(), { next: next + 1 }, { merge: true });
    tx.update(pRef, { patientNumber: num });
    return num;
  });
};

// Automatic numbering for recently created patients — only once the one-off
// backfill has run, so numbers stay in date order. Safe to call repeatedly.
const inProgress = new Set<string>();
export const autoNumberNewPatients = async (patients: any[]) => {
  const missing = patients.filter(p => p?.id && !p.patientNumber && !p.mergedInto && !String(p.id).startsWith('unknown-') && !inProgress.has(p.id));
  if (!missing.length) return;
  const { backfilled } = await getNumberingStatus();
  if (!backfilled) return;
  // Oldest first so numbers follow creation order.
  missing.sort((a, b) => createdSecs(a) - createdSecs(b));
  for (const p of missing.slice(0, 25)) {
    inProgress.add(p.id);
    try { await assignPatientNumber(p.id); } catch (e) { console.error('Patient numbering failed', p.id, e); }
    finally { inProgress.delete(p.id); }
  }
};

// One-off: number every existing patient, oldest first. Reserves a block of
// numbers in a transaction, then writes in batches of 400.
export const backfillPatientNumbers = async (onProgress?: (done: number, total: number) => void): Promise<number> => {
  const snap = await getDocs(collection(db, 'patients'));
  const missing = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(p => !p.patientNumber && !p.mergedInto)
    .sort((a, b) => createdSecs(a) - createdSecs(b) || String(a.id).localeCompare(String(b.id)));

  const start = await runTransaction(db, async tx => {
    const cs = await tx.get(counterRef());
    const next = Number(cs.data()?.next) || 1;
    tx.set(counterRef(), { next: next + missing.length, backfilled: true, backfilledAt: serverTimestamp() }, { merge: true });
    return next;
  });

  for (let i = 0; i < missing.length; i += 400) {
    const batch = writeBatch(db);
    missing.slice(i, i + 400).forEach((p, j) => batch.update(doc(db, 'patients', p.id), { patientNumber: formatPatientNumber(start + i + j) }));
    await batch.commit();
    onProgress?.(Math.min(i + 400, missing.length), missing.length);
  }
  invalidateDirectory();
  return missing.length;
};

// ----------------------------------------------------------------------------
// Merging duplicates
// ----------------------------------------------------------------------------
// Everything that points at a patient by id. Anything matched by phone/email
// only (messages, call logs) follows automatically because the kept record
// holds all the phones/emails (otherPhones / otherEmails).
const LINKED: { col: string; field: string }[] = [
  { col: 'appointments', field: 'patientId' },
  { col: 'dispenseOrders', field: 'patientId' },
  { col: 'prescriptions', field: 'patientId' },
  { col: 'recalls', field: 'patientId' },
  { col: 'clSubscriptions', field: 'patientId' },
  { col: 'quotes', field: 'patientId' },
  { col: 'sales', field: 'customer.patientId' }
];

const SKIP_FIELDS = new Set(['id', 'createdAt', 'patientNumber', 'mergedInto', 'mergedAt', 'mergedBy', 'mergeLog', 'otherEmails', 'otherPhones', 'otherPatientNumbers', 'archived']);
const isEmpty = (v: any) => v === undefined || v === null || v === '' || (typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => x === '' || x === null || x === undefined || x === false));

export interface MergePreview {
  keep: any;
  merge: any[];
  filled: Record<string, any>;          // fields the kept record gains
  otherEmails: string[];
  otherPhones: string[];
  otherPatientNumbers: string[];
  counts: Record<string, number>;       // linked docs that will move, per collection
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const findLinked = async (ids: string[]) => {
  const out: { col: string; field: string; ids: string[] }[] = [];
  for (const { col, field } of LINKED) {
    const found: string[] = [];
    for (const part of chunks(ids, 30)) {
      const snap = await getDocs(query(collection(db, col), where(field, 'in', part)));
      snap.docs.forEach(d => found.push(d.id));
    }
    out.push({ col, field, ids: found });
  }
  return out;
};

export const previewMerge = async (keep: any, merge: any[]): Promise<MergePreview> => {
  // Fresh copies — the directory cache may be up to 10 minutes old.
  const fresh = async (p: any) => { const s = await getDoc(doc(db, 'patients', p.id)); return s.exists() ? { id: s.id, ...s.data() } as any : p; };
  const k = await fresh(keep);
  const m = await Promise.all(merge.map(fresh));

  const filled: Record<string, any> = {};
  for (const r of m) {
    for (const [key, val] of Object.entries(r)) {
      if (SKIP_FIELDS.has(key) || isEmpty(val)) continue;
      if (isEmpty(k[key]) && filled[key] === undefined) filled[key] = val;
    }
  }
  const keepEmails = new Set([emailKey(k.email || filled.email), ...(k.otherEmails || []).map(emailKey)]);
  const keepPhones = new Set([phoneKey(k.phone || filled.phone), ...(k.otherPhones || []).map(phoneKey)]);
  const otherEmails = Array.from(new Set(m.flatMap(r => [r.email, ...(r.otherEmails || [])]).map(emailKey).filter(e => e && !keepEmails.has(e))));
  const otherPhones = Array.from(new Set(m.flatMap(r => [r.phone, ...(r.otherPhones || [])]).filter(p => p && !keepPhones.has(phoneKey(p)))));
  const otherPatientNumbers = Array.from(new Set(m.flatMap(r => [r.patientNumber, ...(r.otherPatientNumbers || [])]).filter(Boolean)));
  if (!k.patientNumber && otherPatientNumbers.length) {
    // Kept record has no number yet — adopt the lowest one from the duplicates.
    const sorted = [...otherPatientNumbers].sort();
    filled.patientNumber = sorted[0];
    otherPatientNumbers.splice(otherPatientNumbers.indexOf(sorted[0]), 1);
  }

  const linked = await findLinked(m.map(r => r.id));
  const counts = Object.fromEntries(linked.map(l => [l.col, l.ids.length]));
  return { keep: k, merge: m, filled, otherEmails, otherPhones, otherPatientNumbers, counts };
};

export const executeMerge = async (preview: MergePreview, staffName: string): Promise<void> => {
  const keepId = preview.keep.id;
  const mergeIds = preview.merge.map(r => r.id);
  const now = new Date().toISOString();

  // 1. Re-point everything linked to the duplicates.
  const linked = await findLinked(mergeIds);
  const writes: { ref: any; data: any }[] = [];
  for (const l of linked) {
    for (const id of l.ids) {
      writes.push({ ref: doc(db, l.col, id), data: l.field === 'patientId' ? { patientId: keepId } : { [l.field]: keepId } });
    }
  }

  // 2. Update the kept record.
  writes.push({
    ref: doc(db, 'patients', keepId),
    data: {
      ...preview.filled,
      ...(preview.otherEmails.length ? { otherEmails: arrayUnion(...preview.otherEmails) } : {}),
      ...(preview.otherPhones.length ? { otherPhones: arrayUnion(...preview.otherPhones) } : {}),
      ...(preview.otherPatientNumbers.length ? { otherPatientNumbers: arrayUnion(...preview.otherPatientNumbers) } : {}),
      mergeLog: arrayUnion({ at: now, by: staffName, mergedIds: mergeIds, mergedNames: preview.merge.map(r => r.patientName || '') })
    }
  });

  // 3. Archive the duplicates (kept, not deleted, so the merge can be traced).
  for (const r of preview.merge) {
    writes.push({ ref: doc(db, 'patients', r.id), data: { mergedInto: keepId, mergedAt: now, mergedBy: staffName, archived: true } });
  }

  for (const part of chunks(writes, 400)) {
    const batch = writeBatch(db);
    // update() so dotted paths like "customer.patientId" set the nested field.
    part.forEach(w => batch.update(w.ref, w.data));
    await batch.commit();
  }
  invalidateDirectory();
};

// Split a record back out of a merge (only un-archives it — linked records
// that were moved stay on the kept patient and can be re-linked by hand).
export const unarchivePatient = async (id: string) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'patients', id), { mergedInto: null, archived: false });
  await batch.commit();
  invalidateDirectory();
};
