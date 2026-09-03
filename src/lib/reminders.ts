import { setDoc, type DocumentReference } from 'firebase/firestore';

const WORKER_URL = "https://twilio.yaseen-hussain18.workers.dev/";

// Interprets dateStr ("YYYY-MM-DD") + timeStr ("HH:MM") as UK LOCAL time
// (handling BST/GMT automatically) and returns the correct UTC instant.
// `new Date(\`${dateStr}T${timeStr}\`)` (no "Z"/offset) is ambiguous -- it's
// parsed using whatever timezone the CUSTOMER'S OWN BROWSER/DEVICE reports
// as local, which only happens to be correct if that's set to UK time. For
// most UK customers on UK devices that's true, but it's fragile -- anyone
// travelling, on a VPN, or with a misconfigured system clock gets a wrong
// instant computed here, which is the most likely trigger for a reminder
// firing at the wrong time. This mirrors the exact UTC-offset technique the
// Twilio worker's own getSecondsUntilUkSixPM() already uses correctly, just
// generalised to an arbitrary date/time instead of "today at 6pm". The
// offset calculation is environment-agnostic (the runtime's own local
// timezone cancels out of the subtraction), so it's safe to reuse here in
// browser code even though the worker version runs in a different runtime.
function ukDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  const now = new Date();
  const utcRef = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const ukRef = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const offsetMs = ukRef.getTime() - utcRef.getTime(); // +1h during BST, 0 during GMT

  // Treat the UK wall-clock numbers as if they were UTC, then subtract the
  // UK offset to land on the correct UTC instant.
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(asIfUtc - offsetMs);
}

interface ScheduleParams {
  docRef: DocumentReference;
  phone: string;
  firstName: string;
  service: string;
  dateStr: string;   // "YYYY-MM-DD"
  timeStr: string;   // "HH:MM"
  manageLink: string;
}

// Schedules BOTH the 24-hour-before reminder and the 9am-same-day reminder.
// Bookings made for today are skipped for the 9am reminder (already same-day, per rule).
export async function scheduleAllReminders({ docRef, phone, firstName, service, dateStr, timeStr, manageLink }: ScheduleParams) {
  if (!phone || phone.length <= 5) return;

  const appointmentDateTime = ukDateTimeToUtc(dateStr, timeStr);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const isSameDayBooking = dateStr === todayStr;

  const sidsToSave: { reminderSid?: string; reminderSid9am?: string } = {};

  // --- 24-HOUR-BEFORE REMINDER ---
  const reminder24hDate = new Date(appointmentDateTime.getTime() - (24 * 60 * 60 * 1000));
  if (reminder24hDate.getTime() > now.getTime() + (15 * 60 * 1000)) {
    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phone,
          body: `Reminder: ${firstName}, your ${service} is tomorrow @ ${timeStr}.\nPlease confirm your attendance or reschedule here: ${manageLink}\nThe Eye Centre, Leicester`,
          reminderTime: reminder24hDate.toISOString()
        })
      });
      if (res.ok) {
        const resData = await res.json();
        const sid = resData.sid || resData.reminderSid;
        if (sid) sidsToSave.reminderSid = sid;
      }
    } catch (e) { console.error("24h reminder scheduling failed:", e); }
  }

  // --- 9AM SAME-DAY REMINDER (skipped entirely for same-day bookings) ---
  if (!isSameDayBooking) {
    const nineAmDate = ukDateTimeToUtc(dateStr, '09:00');

    if (nineAmDate.getTime() > now.getTime() + (15 * 60 * 1000)) {
      try {
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: phone,
            body: `Reminder: ${firstName}, your ${service} is TODAY @ ${timeStr}.\nThe Eye Centre, 56 High Street, Leicester. Call 0116 253 2788 if you need to reschedule.`,
            reminderTime: nineAmDate.toISOString()
          })
        });
        if (res.ok) {
          const resData = await res.json();
          const sid = resData.sid || resData.reminderSid;
          if (sid) sidsToSave.reminderSid9am = sid;
        }
      } catch (e) { console.error("9am reminder scheduling failed:", e); }
    }
  }

  if (Object.keys(sidsToSave).length > 0) {
    await setDoc(docRef, sidsToSave, { merge: true });
  }
}

// Cancels a single scheduled reminder SMS (no-op if no SID given).
export async function cancelReminder(phone: string, sid?: string | null) {
  if (!phone || !sid) return;
  try {
    await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, cancelSid: sid })
    });
  } catch (e) {
    console.error("Cancel reminder failed:", e);
  }
}