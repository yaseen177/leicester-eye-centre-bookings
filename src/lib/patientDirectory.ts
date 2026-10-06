// ============================================================================
// PATIENT DIRECTORY — "contains" search across name, email, phone and patient
// number, with duplicate CRM records collapsed into one person.
// ============================================================================
// Firestore can only do prefix matches, so "contains" search needs the list
// client-side. The patients collection is read once and cached for 10 minutes
// per browser session (one read per patient per load).
//
// DUPLICATES — two records are the same person only if the NAME matches and
// they share an email, a phone number or a date of birth. Sharing a phone or
// email alone is NOT enough: families often share one mobile/email, and a
// parent and child must never be merged. If both records have a DOB and the
// DOBs differ, they are never treated as the same person.
//
// Records that have been merged away (mergedInto set) are hidden everywhere.
// ============================================================================

import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface PersonGroup {
  primary: any;
  records: any[];
  names: string[];
  emails: string[];
  phones: string[];
}

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; list: any[] } | null = null;
let inflight: Promise<any[]> | null = null;

// All non-merged patients.
export const loadPatientDirectory = async (force = false): Promise<any[]> => {
  // Copy, so React sees a new array when the cache has been updated in place.
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return [...cache.list];
  if (inflight) return inflight;
  inflight = getDocs(collection(db, 'patients'))
    .then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(p => !p.mergedInto);
      cache = { at: Date.now(), list };
      return list;
    })
    .finally(() => { inflight = null; });
  return inflight;
};

export const invalidateDirectory = () => { cache = null; };

// Keep the cache in step with records created or edited in this tab. Without
// this, an edit saved to Firestore kept showing the OLD details in patient
// search for up to 10 minutes (it looked like the edit had "reverted").
// Upsert by id so a record is never listed twice; merged-away records drop out.
export const upsertDirectoryCache = (p: any) => {
  if (!cache || !p?.id || String(p.id).startsWith('unknown-')) return;
  const i = cache.list.findIndex(x => x.id === p.id);
  if (p.mergedInto) { if (i >= 0) cache.list.splice(i, 1); return; }
  if (i >= 0) cache.list[i] = { ...cache.list[i], ...p };
  else cache.list.push(p);
};
export const addToDirectoryCache = upsertDirectoryCache;

export const nameOf = (p: any): string => (p.patientName || `${p.firstName || ''} ${p.lastName || ''}`).trim();

export const emailKey = (e: any): string => String(e || '').trim().toLowerCase();

// UK-normalised digits: "+44 7700 900123", "07700900123", "447700900123" → "07700900123"
export const phoneKey = (ph: any): string => {
  let d = String(ph || '').replace(/\D/g, '');
  if (d.startsWith('0044')) d = d.slice(4);
  if (d.startsWith('44') && d.length >= 11) d = d.slice(2);
  if (d && !d.startsWith('0')) d = `0${d}`;
  return d.length >= 7 ? d : '';
};

const TITLES = new Set(['mr', 'mrs', 'miss', 'ms', 'mx', 'dr', 'master', 'prof']);
// "Mrs. Jane  SMITH" and "smith jane" → "jane smith"
export const nameKey = (n: any): string =>
  String(n || '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/)
    .filter(w => w && !TITLES.has(w)).sort().join(' ');

// "1980-01-05", "05/01/1980", "5/1/1980" → "1980-01-05"
export const dobKey = (d: any): string => {
  const s = String(d || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
};

const completeness = (p: any) =>
  (p.email ? 1 : 0) + (p.phone ? 1 : 0) + (p.dob ? 1 : 0) + (p.address && (p.address.line1 || typeof p.address === 'string') ? 1 : 0) + (p.patientNumber ? 1 : 0);

export const createdSecs = (p: any) => p.createdAt?.seconds ?? (p.createdAt ? Date.parse(p.createdAt) / 1000 : Number.MAX_SAFE_INTEGER);

// Best record to keep: most complete, then oldest.
export const rankRecords = (records: any[]) =>
  [...records].sort((a, b) => completeness(b) - completeness(a) || createdSecs(a) - createdSecs(b) || String(a.id).localeCompare(String(b.id)));

const samePerson = (a: any, b: any): boolean => {
  const na = nameKey(nameOf(a)), nb = nameKey(nameOf(b));
  if (!na || na !== nb) return false;
  const da = dobKey(a.dob), dbk = dobKey(b.dob);
  if (da && dbk && da !== dbk) return false;
  return true;
};

export const groupPatients = (list: any[]): PersonGroup[] => {
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  // Candidate pairs share (name + email), (name + phone) or (name + dob).
  const buckets = new Map<string, number[]>();
  list.forEach((p, i) => {
    const n = nameKey(nameOf(p));
    if (!n) return;
    const keys = [
      emailKey(p.email) && `e|${n}|${emailKey(p.email)}`,
      ...[p.phone, ...(p.otherPhones || [])].map(phoneKey).filter(Boolean).map(ph => `p|${n}|${ph}`),
      ...(p.otherEmails || []).map(emailKey).filter(Boolean).map((e: string) => `e|${n}|${e}`),
      dobKey(p.dob) && `d|${n}|${dobKey(p.dob)}`
    ].filter(Boolean) as string[];
    keys.forEach(k => (buckets.get(k) || buckets.set(k, []).get(k)!).push(i));
  });

  for (const idxs of buckets.values()) {
    for (let j = 1; j < idxs.length; j++) {
      const a = idxs[0], b = idxs[j];
      if (!samePerson(list[a], list[b])) continue;
      // Don't join a record into a group that already holds a conflicting DOB.
      const ra = find(a), rb = find(b);
      if (ra === rb) continue;
      const members = list.map((_, k) => k).filter(k => find(k) === ra || find(k) === rb);
      const dobs = new Set(members.map(k => dobKey(list[k].dob)).filter(Boolean));
      if (dobs.size > 1) continue;
      parent[rb] = ra;
    }
  }

  const groups = new Map<number, any[]>();
  list.forEach((p, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)!).push(p); });

  const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
  return Array.from(groups.values()).map(records => {
    const sorted = rankRecords(records);
    return {
      primary: sorted[0],
      records: sorted,
      names: uniq(records.map(nameOf)),
      emails: uniq(records.flatMap(r => [emailKey(r.email), ...(r.otherEmails || []).map(emailKey)])),
      phones: uniq(records.flatMap(r => [r.phone || '', ...(r.otherPhones || [])]))
    };
  });
};

const numDigits = (n: any) => String(n || '').replace(/\D/g, '').replace(/^0+/, '');

// Every word typed must appear somewhere in name / email / phone / patient number.
export const searchGroups = (groups: PersonGroup[], text: string, max = 12): PersonGroup[] => {
  const raw = text.trim();
  if (raw.length < 2) return [];

  // Patient number: "EC-001234", "ec1234"
  const pn = raw.match(/^ec[\s-]?0*(\d+)$/i);
  if (pn) return groups.filter(g => g.records.some(r => numDigits(r.patientNumber) === pn[1])).slice(0, max);

  // A query that's all digits (with spaces/+/brackets) is one phone number.
  const compact = raw.replace(/[\s+()-]/g, '');
  const words = /^\d{3,}$/.test(compact) ? [compact] : raw.toLowerCase().split(/\s+/).filter(Boolean);

  const scored: { g: PersonGroup; score: number }[] = [];
  for (const g of groups) {
    const names = g.names.map(n => n.toLowerCase());
    const phoneDigits = g.phones.map(phoneKey).filter(Boolean);
    const numbers = g.records.map(r => String(r.patientNumber || '').toLowerCase()).filter(Boolean);
    const hay = [...names, ...g.emails, ...phoneDigits, ...numbers].join(' | ');

    const ok = words.every(w => {
      const stripped = w.replace(/[+()-]/g, '');
      if (/^\d{3,}$/.test(stripped)) {
        // Phone fragment ("+447700…" and "07700…" both match "07700…") or patient number digits
        const q = stripped.startsWith('44') ? `0${stripped.slice(2)}` : stripped;
        return phoneDigits.some(p => p.includes(q)) || g.records.some(r => numDigits(r.patientNumber) === stripped.replace(/^0+/, ''));
      }
      return hay.includes(w);
    });
    if (!ok) continue;

    const full = raw.toLowerCase();
    let score = 0;
    if (names.some(n => n.startsWith(full))) score += 4;
    if (names.some(n => n.split(' ').some(part => part.startsWith(words[0])))) score += 2;
    if (g.emails.some(e => e.startsWith(full))) score += 3;
    scored.push({ g, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || nameOf(a.g.primary).localeCompare(nameOf(b.g.primary)))
    .slice(0, max)
    .map(x => x.g);
};

// Existing person with the same NAME and a shared email/phone (never matches
// on contact details alone — families share phones and emails).
export const findExistingPerson = (groups: PersonGroup[], name: string, email: string, phone: string): PersonGroup | null => {
  const n = nameKey(name), e = emailKey(email), p = phoneKey(phone);
  if (!n || (!e && !p)) return null;
  return groups.find(g =>
    g.names.some(x => nameKey(x) === n) &&
    ((e && g.emails.includes(e)) || (p && g.phones.some(x => phoneKey(x) === p)))
  ) || null;
};

// Groups holding more than one record = duplicates to review.
export const findDuplicateGroups = (list: any[]): PersonGroup[] =>
  groupPatients(list).filter(g => g.records.length > 1)
    .sort((a, b) => b.records.length - a.records.length || nameOf(a.primary).localeCompare(nameOf(b.primary)));
