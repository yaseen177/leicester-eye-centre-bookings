// ============================================================================
// PATIENT DIRECTORY — "contains" search across name, email and phone, with
// duplicate CRM records collapsed into one person.
// ============================================================================
// Firestore can only do prefix matches, so "contains" search needs the list
// client-side. The patients collection is read once and cached for 10 minutes
// per browser session (one read per patient per load).
//
// Duplicate grouping: records sharing a normalised email OR phone number are
// treated as the same person. The most complete record (then the oldest) is
// the "primary" and is what sales get linked to.
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

export const loadPatientDirectory = async (force = false): Promise<any[]> => {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  if (inflight) return inflight;
  inflight = getDocs(collection(db, 'patients'))
    .then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cache = { at: Date.now(), list };
      return list;
    })
    .finally(() => { inflight = null; });
  return inflight;
};

// Keep the cache in step with records created from the till.
export const addToDirectoryCache = (p: any) => { if (cache) cache.list.push(p); };

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

const completeness = (p: any) =>
  (p.email ? 1 : 0) + (p.phone ? 1 : 0) + (p.dob ? 1 : 0) + (p.address && (p.address.line1 || typeof p.address === 'string') ? 1 : 0);

const createdSecs = (p: any) => p.createdAt?.seconds ?? (p.createdAt ? Date.parse(p.createdAt) / 1000 : Number.MAX_SAFE_INTEGER);

export const groupPatients = (list: any[]): PersonGroup[] => {
  // Union-find over shared email / phone.
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const seen = new Map<string, number>();
  list.forEach((p, i) => {
    for (const k of [emailKey(p.email) && `e:${emailKey(p.email)}`, phoneKey(p.phone) && `p:${phoneKey(p.phone)}`]) {
      if (!k) continue;
      if (seen.has(k)) union(seen.get(k)!, i); else seen.set(k, i);
    }
  });

  const buckets = new Map<number, any[]>();
  list.forEach((p, i) => { const r = find(i); (buckets.get(r) || buckets.set(r, []).get(r)!).push(p); });

  return Array.from(buckets.values()).map(records => {
    const sorted = [...records].sort((a, b) => completeness(b) - completeness(a) || createdSecs(a) - createdSecs(b) || String(a.id).localeCompare(String(b.id)));
    const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
    return {
      primary: sorted[0],
      records: sorted,
      names: uniq(records.map(nameOf)),
      emails: uniq(records.map(r => emailKey(r.email))),
      phones: uniq(records.map(r => r.phone || ''))
    };
  });
};

// Every word typed must appear somewhere in the person's name / email / phone.
export const searchGroups = (groups: PersonGroup[], text: string, max = 12): PersonGroup[] => {
  // A query that's all digits (with spaces/+/brackets) is one phone number.
  const compact = text.replace(/[\s+()-]/g, '');
  const words = /^\d{3,}$/.test(compact) ? [compact] : text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || text.trim().length < 2) return [];

  const scored: { g: PersonGroup; score: number }[] = [];
  for (const g of groups) {
    const names = g.names.map(n => n.toLowerCase());
    const phoneDigits = g.phones.map(phoneKey).filter(Boolean);
    const hay = [...names, ...g.emails, ...phoneDigits].join(' | ');

    const ok = words.every(w => {
      const stripped = w.replace(/[+()-]/g, '');
      if (/^\d{3,}$/.test(stripped)) {
        // Phone fragment: "+447700…" and "07700…" both match "07700…"
        const q = stripped.startsWith('44') ? `0${stripped.slice(2)}` : stripped;
        return phoneDigits.some(p => p.includes(q));
      }
      return hay.includes(w);
    });
    if (!ok) continue;

    const full = text.trim().toLowerCase();
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

// Find an existing person matching an email or phone (to avoid creating duplicates).
export const findExistingPerson = (groups: PersonGroup[], email: string, phone: string): PersonGroup | null => {
  const e = emailKey(email), p = phoneKey(phone);
  if (!e && !p) return null;
  return groups.find(g => (e && g.emails.includes(e)) || (p && g.phones.some(x => phoneKey(x) === p))) || null;
};
