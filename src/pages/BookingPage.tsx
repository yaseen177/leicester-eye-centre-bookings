import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, doc, getDoc } from 'firebase/firestore';

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState({ 
    start: "09:00", 
    end: "17:00", 
    eyeCheck: 30, 
    contactLens: 20,
    buffer: 5 
  });
  
  const [booking, setBooking] = useState({
    service: '', 
    date: new Date().toISOString().split('T')[0],
    time: '',
    firstName: '',
    lastName: '',
    dob: '',
    inFullTimeEducation: false,
    onBenefits: false,
    isDiabetic: false,
    familyGlaucoma: false
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "appointments"), (snap) => {
      setExistingBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    getDoc(doc(db, "settings", "clinicConfig")).then(d => {
      if (d.exists()) {
        const data = d.data();
        setSettings(prev => ({ ...prev, ...data.times, ...data.hours }));
      }
    });
    return () => unsub();
  }, []);

  // --- TRIAGE LOGIC ENGINE ---
  const getCategory = () => {
    if (booking.service === 'Contact Lens Check') return 'Contact Lens Check';
    
    const birthDate = new Date(booking.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

    if (age >= 60) return 'Eye Check Over 60';
    if (age < 16) return 'Eye Check Child';
    
    // 16, 17, or 18
    if (age >= 16 && age <= 18) {
      return booking.inFullTimeEducation ? 'Eye Check NHS' : 'Eye Check Private';
    }

    // 19 to 59
    if (age >= 19 && age <= 59) {
      if (booking.onBenefits || booking.isDiabetic) return 'Eye Check NHS';
      // Glaucoma check for 40-59
      if (age >= 40 && booking.familyGlaucoma) return 'Eye Check NHS';
      return 'Eye Check Private';
    }
    
    return 'Eye Check Private';
  };

  const getAvailableSlots = () => {
    const slots: string[] = [];
    const duration = booking.service === 'Eye Check' ? settings.eyeCheck : settings.contactLens;
    
    const toMins = (t: string) => { 
      const [h, m] = t.split(':').map(Number); 
      return h * 60 + m; 
    };
    const fromMins = (m: number) => { 
      const h = Math.floor(m / 60); 
      const mm = m % 60; 
      return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`; 
    };

    const now = new Date();
    const isToday = booking.date === now.toISOString().split('T')[0];
    const currentMins = (now.getHours() * 60) + now.getMinutes();

    const clinicStart = toMins(settings.start);
    const clinicEnd = toMins(settings.end);
    const lunchStart = toMins("13:00");
    const lunchEnd = toMins("14:00");

    const dayBookings = existingBookings
      .filter(b => b.appointmentDate === booking.date)
      .map(b => ({
        start: toMins(b.appointmentTime),
        end: toMins(b.appointmentTime) + (b.appointmentType.includes('Contact') ? settings.contactLens : settings.eyeCheck)
      }));

    for (let current = clinicStart; current + duration <= clinicEnd; current += 5) {
      const potentialEnd = current + duration;
      
      // 1. If it's today, skip slots that have already started or are about to start
      if (isToday && current <= currentMins) continue;

      // 2. Skip lunch
      if (current < lunchEnd && potentialEnd > lunchStart) continue;
      
      // 3. Skip overlaps
      const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));

      if (!isOverlap) {
        slots.push(fromMins(current));
      }
    }
    
    return Array.from(new Set(slots)).sort();
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      await addDoc(collection(db, "appointments"), {
        patientName: `${booking.firstName} ${booking.lastName}`,
        dob: booking.dob,
        appointmentType: getCategory(),
        appointmentDate: booking.date,
        appointmentTime: booking.time,
        createdAt: serverTimestamp(),
      });
      setStep(4);
    } catch (e) { alert("Error booking. Please try again."); }
    setLoading(false);
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

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-black" style={{ color: '#3F9185' }}>Leicester Eye Centre</h1>
        <p className="text-slate-500 mt-2 font-medium italic text-sm tracking-wide">Optical Excellence</p>
      </header>

      <div className="glass-card rounded-[2.5rem] p-8">
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Start Booking</h2>
            {['Eye Check', 'Contact Lens Check'].map(s => (
              <button key={s} onClick={() => { setBooking({...booking, service: s}); setStep(2); }} className="w-full p-6 text-left border-2 border-slate-50 rounded-2xl hover:border-[#3F9185] bg-white flex justify-between items-center group shadow-sm transition-all">
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
                <h2 className="text-xl font-bold text-slate-800">Select Date & Time</h2>
             </div>
             <div>
               <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Appointment Date</label>
               <input type="date" min={new Date().toISOString().split('T')[0]} value={booking.date} className="w-full p-4 mt-1 rounded-xl bg-slate-50 font-bold text-[#3F9185] border-none focus:ring-2 focus:ring-[#3F9185] outline-none" onChange={e => setBooking({...booking, date: e.target.value})} />
             </div>
             <div className="grid grid-cols-3 gap-2">
                {getAvailableSlots().map(t => (
                  <button key={t} onClick={() => setBooking({...booking, time: t})} className={`py-3 rounded-xl font-bold border-2 transition-all ${booking.time === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-50 hover:border-[#3F9185]/30'}`}>{t}</button>
                ))}
             </div>
             <button disabled={!booking.time} onClick={() => setStep(3)} className="w-full py-4 rounded-2xl text-white font-black shadow-lg shadow-teal-900/10 disabled:opacity-30" style={{ backgroundColor: '#3F9185' }}>Continue</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-in fade-in">
            <h2 className="text-xl font-bold text-slate-800">Final Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="First Name" className="p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, firstName: e.target.value})} />
              <input placeholder="Last Name" className="p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, lastName: e.target.value})} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date of Birth</label>
              <input type="date" className="w-full p-4 mt-1 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-bold text-slate-600" onChange={e => setBooking({...booking, dob: e.target.value})} />
            </div>
            
            {/* --- CONDITIONAL TRIAGE QUESTIONS --- */}
            {booking.service === 'Eye Check' && booking.dob && (
              <div className="space-y-3 pt-2">
                {calculateAge(booking.dob) >= 16 && calculateAge(booking.dob) <= 18 && (
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                    <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, inFullTimeEducation: e.target.checked})} />
                    <span className="text-sm font-medium text-slate-600">Are you in full-time education?</span>
                  </label>
                )}
                {calculateAge(booking.dob) >= 19 && calculateAge(booking.dob) <= 59 && (
                  <>
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                      <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, onBenefits: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-600">Receiving income-related benefits?</span>
                    </label>
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                      <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, isDiabetic: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-600">Are you diabetic?</span>
                    </label>
                    {calculateAge(booking.dob) >= 40 && (
                      <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                        <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, familyGlaucoma: e.target.checked})} />
                        <span className="text-sm font-medium text-slate-600">Glaucoma in parent or sibling?</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            <button onClick={handleFinalSubmit} disabled={loading || !booking.firstName || !booking.dob} className="w-full py-4 rounded-2xl font-black text-white shadow-lg flex justify-center items-center" style={{ backgroundColor: '#3F9185' }}>
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
            <p className="text-slate-500 font-medium italic">Confirmed for {booking.time} on {new Date(booking.date).toLocaleDateString('en-GB')}</p>
            <p className="text-xs font-bold text-[#3F9185] uppercase tracking-tighter">Category: {getCategory()}</p>
            <button onClick={() => window.location.reload()} className="text-[#3F9185] font-black hover:underline underline-offset-4 pt-4">Start Again</button>
          </div>
        )}
      </div>
    </div>
  );
}