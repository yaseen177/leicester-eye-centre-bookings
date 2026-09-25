import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, HeartHandshake } from 'lucide-react';

// Shown straight after a successful online booking. The patient has to make an
// active choice ("I'll be there" or "change it now") -- a stated commitment is
// what moves attendance, not a message they can swipe away unread. So there's
// deliberately no backdrop-click or close (X) dismissal.

type Props = {
  open: boolean;
  firstName: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:mm
  service: string;
  durationMins: number;
  bookingId: string | null;
  onClose: () => void;
};

const PRACTICE_ADDRESS = 'The Eye Centre, 56 High Street, Leicester LE1 5YN';
const PRACTICE_PHONE = '0116 253 2788';

const track = (action: string) => {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'attendance_pledge', { pledge_action: action });
  }
};

const pad = (n: number) => n.toString().padStart(2, '0');

// Floating local time (no Z) so calendars show it as UK wall-clock time.
const toIcsStamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

function downloadIcs({ date, time, service, durationMins, bookingId }: Props) {
  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + (durationMins || 30) * 60000);
  const manage = bookingId ? `\\nNeed to change it? ${window.location.origin}/manage/${bookingId}` : '';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Eye Centre Leicester//Bookings//EN',
    'BEGIN:VEVENT',
    `UID:${bookingId || start.getTime()}@theeyecentre.com`,
    `DTSTAMP:${toIcsStamp(new Date())}`,
    `DTSTART:${toIcsStamp(start)}`,
    `DTEND:${toIcsStamp(end)}`,
    `SUMMARY:${service} - The Eye Centre`,
    `LOCATION:${PRACTICE_ADDRESS.replace(/,/g, '\\,')}`,
    `DESCRIPTION:Please bring your current glasses or contact lenses and a list of any medications.${manage}\\nQuestions? Call ${PRACTICE_PHONE}.`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Eye appointment in 2 hours',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'eye-centre-appointment.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AttendancePledge(props: Props) {
  const { open, firstName, date, time, bookingId, onClose } = props;
  const [calendarAdded, setCalendarAdded] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    track('shown');
    primaryRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const niceDate = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const confirm = () => { track('committed'); onClose(); };
  const addToCalendar = () => { downloadIcs(props); setCalendarAdded(true); track('calendar_added'); };
  const changeIt = () => {
    track('change_clicked');
    if (bookingId) window.location.href = `/manage/${bookingId}`;
    else window.location.href = `tel:${PRACTICE_PHONE.replace(/\s/g, '')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pledge-title"
    >
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-7 space-y-5 animate-in slide-in-from-bottom-4 max-h-[90vh] overflow-y-auto">
        <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
          <HeartHandshake size={28} style={{ color: '#3F9185' }} />
        </div>

        <h2 id="pledge-title" className="text-2xl font-black text-slate-900 text-center">
          One small favour, {firstName || 'there'}
        </h2>

        <div className="space-y-3 text-slate-600 text-[15px] leading-relaxed">
          <p>
            We're a small, independent, family-run practice on High Street, and we've been
            looking after Leicester's eyes since 1974. We're not a chain.
          </p>
          <p>
            Your appointment on <strong className="text-slate-900">{niceDate} at {time}</strong> is
            time set aside just for you. When someone doesn't turn up, that slot goes to waste,
            and it's often one another patient needed, sometimes with an urgent eye problem.
          </p>
          <p>
            If your plans change, that's completely fine. Just let us know, even on the day,
            and we'll offer it to someone else.
          </p>
          <p className="text-slate-900 font-semibold">Thank you, it genuinely means a lot to us.</p>
          <p className="text-sm text-slate-500 italic">Mr Hussain, Optometrist &amp; Director</p>
        </div>

        <div className="space-y-3 pt-1">
          <button
            ref={primaryRef}
            onClick={confirm}
            className="w-full py-4 rounded-2xl text-white font-black shadow-lg shadow-teal-900/10 transition-all active:scale-95"
            style={{ backgroundColor: '#3F9185' }}
          >
            I'll be there, or I'll let you know
          </button>

          <button
            onClick={addToCalendar}
            className="w-full py-3 rounded-2xl font-bold border-2 border-teal-100 text-[#3F9185] flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-teal-50"
          >
            <CalendarPlus size={18} />
            {calendarAdded ? 'Added, check your downloads' : 'Add to my calendar'}
          </button>

          <button
            onClick={changeIt}
            className="w-full text-sm text-slate-400 font-semibold hover:text-slate-600 underline underline-offset-4 pt-1"
          >
            Not sure you can make it? Change it now
          </button>
        </div>
      </div>
    </div>
  );
}