// ============================================================================
// SENDER CLASSIFIER — splits the Inbox into Patients / Not in CRM / Companies
// ============================================================================
// Anyone matched to a CRM record is a patient. Everyone else is sorted into
// "company" or "person" by these rules, in order:
//   1. Manual rules (settings/senderRules) — "Mark as company" / "Not a company",
//      by exact address or whole domain. Always win.
//   2. Has an appointment on the system → person.
//   3. SMS from a text sender ID ("AMAZON") or a short code → company.
//   4. Address like noreply@, info@, sales@, notifications@ … → company.
//   5. Name contains Ltd / Limited / plc / Inc / Services … → company.
//   6. Personal mail provider (gmail, hotmail, icloud, btinternet …) or a
//      university/school address → person. Any other domain → company.
// ============================================================================

export type SenderKind = 'company' | 'person';

export interface SenderRules {
  companies: string[];   // "someone@acme.com" or "acme.com"
  people: string[];
}

export const EMPTY_RULES: SenderRules = { companies: [], people: [] };

const FREE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk',
  'msn.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.co.uk',
  'btinternet.com', 'btopenworld.com', 'sky.com', 'talktalk.net', 'tiscali.co.uk', 'virginmedia.com', 'virgin.net', 'blueyonder.co.uk',
  'ntlworld.com', 'plus.net', 'plusnet.com', 'o2.co.uk', 'orange.net', 'protonmail.com', 'proton.me', 'pm.me', 'gmx.com', 'gmx.co.uk', 'gmx.net',
  'mail.com', 'zoho.com', 'yandex.com', 'hushmail.com', 'fastmail.com', 'tutanota.com', 'mail.ru', 'rediffmail.com', 'qq.com', '163.com'
]);

const COMPANY_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|newsletters?|news|info|sales|support|marketing|hello|team|admin|billing|accounts?|invoices?|orders?|service|customerservices?|customer\.?care|enquiries|enquiry|contact|bounces?|mailer-daemon|postmaster|alerts?|updates?|reminders?|receipts?|bookings?|reservations|promotions?|offers?|feedback|surveys?|help|care|office|reception|operations|finance|payments?|statements?)([.+_-]|$)/i;

const COMPANY_NAME = /\b(ltd|limited|plc|inc|llc|llp|gmbh|group|services|solutions|team|holdings|bank|insurance|council|nhs|opticians?|optical|lenses|labs?|newsletter|support)\b/i;

const PERSONAL_EDU = /\.(ac|sch)\.uk$|\.edu$/i;

export const domainOf = (email: string) => String(email || '').toLowerCase().split('@')[1] || '';

export const classifySender = (s: { email?: string; phone?: string; name?: string }, rules: SenderRules, hasAppointment: boolean): SenderKind => {
  const email = String(s.email || '').trim().toLowerCase();
  const domain = domainOf(email);

  // 1. Manual rules
  if (email && (rules.people.includes(email) || (domain && rules.people.includes(domain)))) return 'person';
  if (email && (rules.companies.includes(email) || (domain && rules.companies.includes(domain)))) return 'company';
  const phoneKey = String(s.phone || '').trim();
  if (phoneKey && rules.people.includes(phoneKey)) return 'person';
  if (phoneKey && rules.companies.includes(phoneKey)) return 'company';

  // 2. Booked in → a real person
  if (hasAppointment) return 'person';

  // 3. SMS sender IDs / short codes
  if (!email && phoneKey) {
    if (/[a-z]/i.test(phoneKey)) return 'company';
    if (phoneKey.replace(/\D/g, '').length < 9) return 'company';
    return 'person';
  }

  // 4–6. Email
  if (email) {
    const local = email.split('@')[0];
    if (COMPANY_LOCAL.test(local)) return 'company';
    if (s.name && COMPANY_NAME.test(s.name)) return 'company';
    if (FREE_DOMAINS.has(domain) || PERSONAL_EDU.test(domain)) return 'person';
    return 'company';
  }

  return s.name && COMPANY_NAME.test(s.name) ? 'company' : 'person';
};
