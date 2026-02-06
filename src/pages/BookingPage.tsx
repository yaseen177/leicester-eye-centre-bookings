import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, setDoc, addDoc, serverTimestamp, onSnapshot, doc} from 'firebase/firestore';
import emailjs from '@emailjs/browser';

const toMins = (t: string) => { 
  const [h, m] = t.split(':').map(Number); 
  return h * 60 + m; 
};

const fromMins = (m: number) => { 
  const h = Math.floor(m / 60); 
  const mm = m % 60; 
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`; 
};

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState({ 
    start: "09:00", 
    end: "17:00", 
    eyeCheck: 30, 
    contactLens: 20,
    buffer: 0,
    closedDates: [] as string[],
    openDates: [] as string[],
    weeklyOff: [] as number[],
    lunch: { start: "13:00", end: "14:00" }, // Fix: Added property
    dailyOverrides: {} as Record<string, { start: string; end: string }>
  });
  
  const [booking, setBooking] = useState({
    service: '', 
    date: new Date().toISOString().split('T')[0],
    time: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    inFullTimeEducation: false,
    onBenefits: false,
    isDiabetic: false,
    familyGlaucoma: false
  });

  // 1. Setup Live Sync and Initial Settings
  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, "appointments"), (snap) => {
      setExistingBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const unsubSettings = onSnapshot(doc(db, "settings", "clinicConfig"), (d) => {
      if (d.exists()) {
        const data = d.data();
        setSettings(prev => ({
          ...prev,
          start: data.hours?.start || "09:00",
          end: data.hours?.end || "17:00",
          eyeCheck: Number(data.times?.eyeCheck) || 30,
          contactLens: Number(data.times?.contactLens) || 20,
          closedDates: data.closedDates || [],
          openDates: data.openDates || [],
          weeklyOff: data.weeklyOff || []
        }));
      }
    });

    return () => {
      unsubBookings();
      unsubSettings();
    };
  }, []);

  // 2. Logic: Find the first date that actually has slots
  useEffect(() => {
    if (existingBookings.length >= 0 && booking.service) {
      const firstAvailable = findFirstAvailableDate();
      if (firstAvailable !== booking.date) {
        setBooking(prev => ({ ...prev, date: firstAvailable }));
      }
    }
  }, [existingBookings, booking.service]);

  // --- SLOT CALCULATION ENGINE ---
  const calculateSlotsForDate = (targetDate: string) => {
    const [year, month, day] = targetDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();
  
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateObj < today) return [];
  
    const { closedDates, openDates, weeklyOff, dailyOverrides, lunch } = settings;
  
    if (closedDates.includes(targetDate)) return [];
    const isStandardDayOff = weeklyOff.includes(dayOfWeek);
    const isManuallyOverriddenToOpen = openDates.includes(targetDate);
    if (isStandardDayOff && !isManuallyOverriddenToOpen) return [];
  
    // Use Daily Override Hours if they exist, else use standard hours
    const dayHours = dailyOverrides?.[targetDate] || settings;
    const clinicStart = toMins(dayHours.start || "09:00");
    const clinicEnd = toMins(dayHours.end || "17:00");
    
    const lunchStart = toMins(lunch?.start || "13:00");
    const lunchEnd = toMins(lunch?.end || "14:00");
    const now = new Date();
    const isToday = targetDate === now.toISOString().split('T')[0];
    const currentMins = (now.getHours() * 60) + now.getMinutes();
  
    const slots: string[] = [];
    const duration = booking.service === 'Eye Check' ? settings.eyeCheck : settings.contactLens;
  
    const dayBookings = existingBookings
      .filter(b => b.appointmentDate === targetDate)
      .map(b => {
        const d = b.appointmentType.includes('Contact') ? settings.contactLens : settings.eyeCheck;
        return { start: toMins(b.appointmentTime), end: toMins(b.appointmentTime) + d };
      });
  
      for (let current = clinicStart; current + duration <= clinicEnd; current += 5) {
        const potentialEnd = current + duration;
        
        // Fix: Filter out times that have already passed today
        if (isToday && current <= currentMins) continue;
  
        // Fix: Check Lunch Break with precise minute matching
        if (current < lunchEnd && potentialEnd > lunchStart) continue;
        
        const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));
  
        if (!isOverlap) {
          slots.push(fromMins(current));
        }
      }
      
      return Array.from(new Set(slots)).sort();
    };
  const findFirstAvailableDate = () => {
    let checkDate = new Date();
    for (let i = 0; i < 30; i++) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (calculateSlotsForDate(dateStr).length > 0) return dateStr;
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return new Date().toISOString().split('T')[0];
  };

  const getCategory = () => {
    if (booking.service === 'Contact Lens Check') return 'Contact Lens Check';
    const age = calculateAge(booking.dob);
    if (age >= 60) return 'Eye Check Over 60';
    if (age < 16) return 'Eye Check Child';
    if (age >= 16 && age <= 18) return booking.inFullTimeEducation ? 'Eye Check NHS' : 'Eye Check Private';
    if (age >= 19 && age <= 59) {
      if (booking.onBenefits || booking.isDiabetic) return 'Eye Check NHS';
      if (age >= 40 && booking.familyGlaucoma) return 'Eye Check NHS';
    }
    return 'Eye Check Private';
  };

  const calculateAge = (dobString: string) => {
    if (!dobString) return 0;
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      // 1. Save to Firebase
      const docRef = await addDoc(collection(db, "appointments"), {
        patientName: `${booking.firstName} ${booking.lastName}`,
        email: booking.email,
        phone: booking.phone,
        dob: booking.dob,
        appointmentType: getCategory(),
        appointmentDate: booking.date,
        appointmentTime: booking.time,
        createdAt: serverTimestamp(),
      });

      // 2. Send Confirmation Email
      const emailParams = {
        to_email: booking.email,
        patient_name: booking.firstName,
        appointment_type: getCategory(),
        date: new Date(booking.date).toLocaleDateString('en-GB'),
        time: booking.time,
        reply_to: 'enquiries@theeyecentre.com'
      };
      await emailjs.send('service_et75v9m', 'template_prhl49a', emailParams, 'kjN74GNmFhu6fNch8');

      // 3. Send SMS via Cloudflare Worker
      const appointmentDate = new Date(`${booking.date}T${booking.time}`);
      const reminderDate = new Date(appointmentDate.getTime() - (24 * 60 * 60 * 1000));

      const smsResponse = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    to: booking.phone,
    body: `Hi ${booking.firstName}, your appointment at Leicester Eye Centre is confirmed for ${booking.time} on ${new Date(booking.date).toLocaleDateString('en-GB')}.`,
    reminderTime: reminderDate.toISOString() 
  })
});

if (!smsResponse.ok) {
  const errorData = await smsResponse.json();
  console.error("SMS Failure:", errorData.error);
}

      setStep(4);
    } catch (e) {
      console.error("Error:", e);
      alert("Booking saved, but notifications may have failed.");
      setStep(4);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <header className="text-center mb-8 px-4">
        <div className="mb-4">
          <img src="/logo.png" alt="Leicester Eye Centre" className="h-14 sm:h-20 w-auto mx-auto drop-shadow-sm" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Optical Excellence</p>
          <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 rounded-full mt-1">
            <span className="w-1.5 h-1.5 bg-[#3F9185] rounded-full animate-pulse"></span>
            <span className="text-[9px] font-black text-[#3F9185] uppercase tracking-tighter">Live Availability</span>
          </div>
        </div>
      </header>

      <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5 border border-white/50 bg-white/80 backdrop-blur-xl">
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-slate-800 mb-4">How can we help?</h2>
            {['Eye Check', 'Contact Lens Check'].map(s => (
              <button key={s} onClick={() => { setBooking({...booking, service: s}); setStep(2); }} className="w-full p-6 text-left border-2 border-slate-50 rounded-2xl hover:border-[#3F9185] bg-white flex justify-between items-center group shadow-sm transition-all hover:shadow-md">
                <span className="font-bold text-lg text-slate-700">{s}</span>
                <ChevronRight className="text-slate-300 group-hover:text-[#3F9185]" />
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in">
             <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600" /></button>
                <h2 className="text-xl font-bold text-slate-800">Available Slots</h2>
             </div>
             <div>
               <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Appointment Date</label>
               <input type="date" min={new Date().toISOString().split('T')[0]} value={booking.date} className="w-full p-4 mt-1 rounded-xl bg-slate-50 font-bold text-[#3F9185] border-none focus:ring-2 focus:ring-[#3F9185] outline-none transition-all" onChange={e => setBooking({...booking, date: e.target.value})} />
             </div>
             <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {calculateSlotsForDate(booking.date).length > 0 ? (
                  calculateSlotsForDate(booking.date).map(t => (
                    <button key={t} onClick={() => setBooking({...booking, time: t})} className={`py-3 rounded-xl font-bold border-2 transition-all ${booking.time === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-50 hover:border-[#3F9185]/30'}`}>{t}</button>
                  ))
                ) : (
                  <div className="col-span-3 py-10 text-center text-slate-400 font-bold italic">No slots available for this date.</div>
                )}
             </div>
             <button disabled={!booking.time} onClick={() => setStep(3)} className="w-full py-4 rounded-2xl text-white font-black shadow-lg shadow-teal-900/10 disabled:opacity-30 transition-all active:scale-95" style={{ backgroundColor: '#3F9185' }}>Continue</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-in fade-in">
            <h2 className="text-xl font-bold text-slate-800">Patient Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="First Name" className="p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, firstName: e.target.value})} />
              <input placeholder="Last Name" className="p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, lastName: e.target.value})} />
            </div>
            <div className="space-y-3">
              <input type="email" placeholder="Email Address" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, email: e.target.value})} required />
              <input type="tel" placeholder="Telephone Number" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, phone: e.target.value})} required />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date of Birth</label>
              <input type="date" className="w-full p-4 mt-1 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-bold text-slate-600" onChange={e => setBooking({...booking, dob: e.target.value})} />
            </div>
            
            {booking.service === 'Eye Check' && booking.dob && (
              <div className="space-y-3 pt-2">
                {calculateAge(booking.dob) >= 16 && calculateAge(booking.dob) <= 18 && (
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                    <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, inFullTimeEducation: e.target.checked})} />
                    <span className="text-sm font-medium text-slate-600">Are you in full-time education?</span>
                  </label>
                )}
                {calculateAge(booking.dob) >= 19 && calculateAge(booking.dob) <= 59 && (
                  <>
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                      <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, onBenefits: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-600">Receiving income-related benefits?</span>
                    </label>
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                      <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, isDiabetic: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-600">Are you diabetic?</span>
                    </label>
                    {calculateAge(booking.dob) >= 40 && (
                      <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                        <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, familyGlaucoma: e.target.checked})} />
                        <span className="text-sm font-medium text-slate-600">Glaucoma in parent or sibling?</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}
            <button onClick={handleFinalSubmit} disabled={loading || !booking.firstName || !booking.dob} className="w-full py-4 rounded-2xl font-black text-white shadow-lg flex justify-center items-center transition-all hover:brightness-110" style={{ backgroundColor: '#3F9185' }}>
              {loading ? <Loader2 className="animate-spin" /> : 'Confirm Appointment'}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-10 space-y-4 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} style={{ color: '#3F9185' }} />
            </div>
            <h2 className="text-3xl font-black text-slate-900">Confirmed!</h2>
            <p className="text-slate-500 font-medium italic">Your slot is {booking.time} on {new Date(booking.date).toLocaleDateString('en-GB')}</p>
            <p className="text-xs font-bold text-[#3F9185] uppercase tracking-tighter">Category: {getCategory()}</p>
            <button onClick={() => window.location.reload()} className="text-[#3F9185] font-black hover:underline underline-offset-4 pt-4">Start Again</button>
          </div>
        )}
      </div>
    </div>
  );
}