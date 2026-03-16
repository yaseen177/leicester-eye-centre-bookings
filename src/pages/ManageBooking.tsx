import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, doc, getDoc, deleteDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { Calendar, Clock, AlertTriangle, Send, XCircle, Loader2, ArrowLeft } from 'lucide-react';

const toMins = (t: string) => { 
  const [h, m] = t.split(':').map(Number); 
  return h * 60 + m; 
};

const fromMins = (m: number) => { 
  const h = Math.floor(m / 60); 
  const mm = m % 60; 
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`; 
};

export default function ManageBooking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [appointment, setAppointment] = useState<any>(null);
  const [view, setView] = useState<'main' | 'cancel' | 'reschedule'>('main');

  // Booking Engine State
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState({ 
    start: "09:00", end: "17:00", eyeCheck: 30, contactLens: 20, buffer: 0,
    closedDates: [] as string[], openDates: [] as string[], weeklyOff: [] as number[],
    lunch: { start: "13:00", end: "14:00", enabled: true },
    dailyOverrides: {} as Record<string, { start: string; end: string }>
  });
  
  const [rescheduleDate, setRescheduleDate] = useState(new Date().toISOString().split('T')[0]);
  const [rescheduleTime, setRescheduleTime] = useState('');

  useEffect(() => {
    const fetchAppt = async () => {
      if (!id) return;
      const docRef = doc(db, 'appointments', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setAppointment(data);
      }
      setLoading(false);
    };

    const unsubBookings = onSnapshot(collection(db, "appointments"), (snap) => {
      setExistingBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const unsubSettings = onSnapshot(doc(db, "settings", "clinicConfig"), (d) => {
      if (d.exists()) {
        const data = d.data();
        setSettings(prev => ({
          ...prev,
          start: data.hours?.start || "09:00", end: data.hours?.end || "17:00",
          eyeCheck: Number(data.times?.eyeCheck) || 30, contactLens: Number(data.times?.contactLens) || 20,
          closedDates: data.closedDates || [], openDates: data.openDates || [],
          weeklyOff: data.weeklyOff || [], lunch: data.lunch || prev.lunch,
          dailyOverrides: data.dailyOverrides || {}
        }));
      }
    });

    fetchAppt();
    return () => { unsubBookings(); unsubSettings(); };
  }, [id]);

  // --- SLOT CALCULATION ENGINE ---
  const calculateSlotsForDate = (targetDate: string) => {
    const [year, month, day] = targetDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay(); 
  
    const { closedDates, openDates, weeklyOff, dailyOverrides } = settings;
  
    if (closedDates.includes(targetDate)) return [];
    if (weeklyOff.includes(dayOfWeek) && !openDates.includes(targetDate)) return [];
  
    const dayHours = dailyOverrides?.[targetDate] || settings;
    const clinicStart = toMins(dayHours.start || "09:00");
    const clinicEnd = toMins(dayHours.end || "17:00");

    const isLunchEnabled = settings.lunch?.enabled ?? true;
    const lunchStart = isLunchEnabled ? toMins(settings.lunch?.start || "13:00") : -1;
    const lunchEnd = isLunchEnabled ? toMins(settings.lunch?.end || "14:00") : -1;

    const now = new Date();
    const isToday = targetDate === now.toLocaleDateString('en-CA'); 
    const currentMins = (now.getHours() * 60) + now.getMinutes();
  
    const slots: string[] = [];
    const isContactLens = appointment?.appointmentType?.includes('Contact');
    const duration = isContactLens ? settings.contactLens : settings.eyeCheck;
  
    const dayBookings = existingBookings
      .filter(b => b.appointmentDate === targetDate && b.id !== appointment?.id) // IGNORE CURRENT APPOINTMENT
      .map(b => {
        const d = b.appointmentType?.includes('Contact') ? settings.contactLens : settings.eyeCheck;
        return { start: toMins(b.appointmentTime), end: toMins(b.appointmentTime) + d };
      });
  
    for (let current = clinicStart; current + duration <= clinicEnd; current += 5) {
      const potentialEnd = current + duration;
      if (isToday && current <= currentMins) continue;
      if (isLunchEnabled && current < lunchEnd && potentialEnd > lunchStart) continue;
      
      const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));
      if (!isOverlap) slots.push(fromMins(current));
    }
    
    return Array.from(new Set(slots)).sort();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#3F9185]" size={40} /></div>;
  if (!appointment) return <div className="text-center mt-20 font-bold text-slate-500">Appointment not found or already cancelled.</div>;

  // --- ACTIONS ---

  const handleResendSMS = async () => {
    setActionLoading(true);
    try {
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: appointment.phone,
          body: `Reminder: ${appointment.patientName.split(' ')[0]}, your appointment is on ${new Date(appointment.appointmentDate).toLocaleDateString('en-GB')} at ${appointment.appointmentTime} at The Eye Centre. Manage here: ${window.location.origin}/manage/${id}`
        })
      });
      alert("SMS Sent Successfully!");
    } catch (err) { alert("Failed to send SMS."); }
    setActionLoading(false);
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'appointments', id!));
      
      // 1. Send Cancellation Email via Brevo
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_email",
          templateId: 3, // <--- CANCELLATION TEMPLATE ID
          to_email: appointment.email,
          patient_name: appointment.patientName.split(' ')[0],
          params: {
            patient_name: appointment.patientName.split(' ')[0],
            date: new Date(appointment.appointmentDate).toLocaleDateString('en-GB'),
            time: appointment.appointmentTime
          }
        })
      });

      // 2. Send SMS & Cancel 24hr reminder
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: appointment.phone,
          body: `Cancellation: ${appointment.patientName.split(' ')[0]}, your appointment on ${new Date(appointment.appointmentDate).toLocaleDateString('en-GB')} @ ${appointment.appointmentTime} has been cancelled. The Eye Centre.`,
          cancelSid: appointment.reminderSid
        })
      });

      alert("Appointment Cancelled.");
      navigate('/');
    } catch (err) { alert("Error cancelling appointment."); setActionLoading(false); }
  };

  const handleReschedule = async () => {
    setActionLoading(true);
    try {
      const docRef = doc(db, 'appointments', id!);
      
      // 1. Update Firestore Date & Time
      await setDoc(docRef, { appointmentDate: rescheduleDate, appointmentTime: rescheduleTime }, { merge: true });

      // 2. Email - Reschedule Email via Brevo
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_email",
          templateId: 4, // <--- RESCHEDULE TEMPLATE ID
          to_email: appointment.email,
          patient_name: appointment.patientName.split(' ')[0],
          params: {
            patient_name: appointment.patientName.split(' ')[0],
            new_date: new Date(rescheduleDate).toLocaleDateString('en-GB'),
            new_time: rescheduleTime,
            manage_link: `${window.location.origin}/manage/${id}` // <--- ADDED MANAGE LINK HERE
          }
        })
      });

      const newApptDate = new Date(`${rescheduleDate}T${rescheduleTime}`);
      const newReminderDate = new Date(newApptDate.getTime() - (24 * 60 * 60 * 1000));

      // 3. Cancel old reminder & send Immediate Update SMS
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: appointment.phone,
          body: `Update: ${appointment.patientName.split(' ')[0]}, your appointment is rescheduled to ${new Date(rescheduleDate).toLocaleDateString('en-GB')} at ${rescheduleTime}. The Eye Centre.`,
          cancelSid: appointment.reminderSid // Kills old reminder
        })
      });

      // 4. Schedule new 24hr reminder
      const smsReminderRes = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: appointment.phone,
          body: `Reminder: ${appointment.patientName.split(' ')[0]}, your appointment is tomorrow at ${rescheduleTime} at The Eye Centre. If you need to manage this, click here: ${window.location.origin}/manage/${id}`,
          reminderTime: newReminderDate.toISOString() 
        })
      });

      if (smsReminderRes.ok) {
        const smsData = await smsReminderRes.json();
        const sidToSave = smsData.sid || smsData.reminderSid;
        if (sidToSave) await setDoc(docRef, { reminderSid: sidToSave }, { merge: true });
      }

      alert("Appointment successfully rescheduled!");
      window.location.reload();
    } catch (err) { alert("Error rescheduling appointment."); }
    setActionLoading(false);
  };

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 bg-white">
        
        {view === 'main' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-slate-800">Manage Appointment</h2>
              <p className="text-slate-500 font-medium">For {appointment.patientName}</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl space-y-3 border border-slate-100">
              <div className="flex items-center gap-3 text-slate-700">
                <Calendar className="text-[#3F9185]" size={20} />
                <span className="font-bold">{new Date(appointment.appointmentDate).toLocaleDateString('en-GB')}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Clock className="text-[#3F9185]" size={20} />
                <span className="font-bold">{appointment.appointmentTime}</span>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <button onClick={handleResendSMS} disabled={actionLoading} className="w-full py-3 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 flex justify-center items-center gap-2">
                <Send size={18} /> Resend SMS Confirmation
              </button>
              <button onClick={() => { setRescheduleDate(appointment.appointmentDate); setView('reschedule'); }} className="w-full py-3 rounded-xl font-bold bg-[#3F9185] text-white hover:brightness-110 flex justify-center items-center gap-2 shadow-md">
                <Calendar size={18} /> Reschedule
              </button>
              <button onClick={() => setView('cancel')} className="w-full py-3 rounded-xl font-bold bg-red-50 text-red-600 hover:bg-red-100 flex justify-center items-center gap-2">
                <XCircle size={18} /> Cancel Appointment
              </button>
            </div>
          </div>
        )}

        {view === 'cancel' && (
          <div className="space-y-6 text-center animate-in slide-in-from-right">
            <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-xl font-black text-slate-800">Are you sure?</h2>
            <p className="text-slate-500">This will permanently cancel your appointment for <strong>{appointment.appointmentTime}</strong> on <strong>{new Date(appointment.appointmentDate).toLocaleDateString('en-GB')}</strong>.</p>
            <div className="space-y-3 pt-4">
              <button onClick={handleCancel} disabled={actionLoading} className="w-full py-4 rounded-xl font-black bg-red-500 text-white hover:bg-red-600 flex justify-center shadow-md">
                {actionLoading ? <Loader2 className="animate-spin" /> : 'Yes, Cancel Appointment'}
              </button>
              <button onClick={() => setView('main')} disabled={actionLoading} className="w-full py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-50">No, go back</button>
            </div>
          </div>
        )}

        {view === 'reschedule' && (
          <div className="space-y-6 animate-in slide-in-from-right">
             <div className="flex items-center gap-2">
                <button onClick={() => setView('main')} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600" /></button>
                <h2 className="text-xl font-bold text-slate-800">Pick a new time</h2>
             </div>
             <div>
               <input type="date" min={new Date().toISOString().split('T')[0]} value={rescheduleDate} className="w-full p-4 rounded-xl bg-slate-50 font-bold text-[#3F9185] border-none focus:ring-2 focus:ring-[#3F9185] outline-none" onChange={e => { setRescheduleDate(e.target.value); setRescheduleTime(''); }} />
             </div>
             
             {(() => {
                const slots = calculateSlotsForDate(rescheduleDate);
                const morning = slots.filter(t => parseInt(t.split(':')[0]) < 12);
                const afternoon = slots.filter(t => parseInt(t.split(':')[0]) >= 12);

                if (slots.length === 0) return <div className="py-10 text-center text-slate-400 font-bold italic">No slots available for this date.</div>;

                return (
                   <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-6">
                      {morning.length > 0 && (
                         <div className="space-y-2">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 ml-1">Morning</h3>
                            <div className="grid grid-cols-3 gap-2">
                               {morning.map(t => (
                                  <button key={t} onClick={() => setRescheduleTime(t)} className={`py-3 rounded-xl font-bold border-2 transition-all ${rescheduleTime === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-50 hover:border-[#3F9185]/30'}`}>{t}</button>
                               ))}
                            </div>
                         </div>
                      )}
                      {afternoon.length > 0 && (
                         <div className="space-y-2">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 ml-1">Afternoon</h3>
                            <div className="grid grid-cols-3 gap-2">
                               {afternoon.map(t => (
                                  <button key={t} onClick={() => setRescheduleTime(t)} className={`py-3 rounded-xl font-bold border-2 transition-all ${rescheduleTime === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-50 hover:border-[#3F9185]/30'}`}>{t}</button>
                               ))}
                            </div>
                         </div>
                      )}
                   </div>
                );
             })()}

             <button disabled={!rescheduleTime || actionLoading} onClick={handleReschedule} className="w-full py-4 rounded-2xl text-white font-black shadow-lg shadow-teal-900/10 disabled:opacity-30 flex justify-center" style={{ backgroundColor: '#3F9185' }}>
               {actionLoading ? <Loader2 className="animate-spin" /> : 'Confirm New Time'}
             </button>
          </div>
        )}

      </div>
    </div>
  );
}