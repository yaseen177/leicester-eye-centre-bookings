import { setDoc, type DocumentReference } from 'firebase/firestore';

const WORKER_URL = "https://twilio.yaseen-hussain18.workers.dev/";

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

  const appointmentDateTime = new Date(`${dateStr}T${timeStr}`);
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
    const [year, month, day] = dateStr.split('-').map(Number);
    const nineAmDate = new Date(year, month - 1, day, 9, 0, 0);

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