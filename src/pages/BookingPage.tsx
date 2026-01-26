import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, ChevronRight, ArrowLeft, Clock, Calendar as CalendarIcon } from 'lucide-react';
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
      if (d.exists()) setSettings(prev => ({ ...prev, ...d.data().times, ...d.data().hours }));
    });
    return () => unsub();
  }, []);

  const getCategory = () => {
    if (booking.service === 'Contact Lens Check') return 'Contact Lens Check';
    const birthDate = new Date(booking.dob);
    const age = new Date().getFullYear() - birthDate.getFullYear();
    if (age >= 60) return 'Eye Check Over 60';
    if (age < 16) return 'Eye Check Child';
    if (age >= 16 && age <= 18 && booking.inFullTimeEducation) return 'Eye Check NHS';
    if (booking.onBenefits || booking.isDiabetic) return 'Eye Check NHS';
    if (age >= 40 && booking.familyGlaucoma) return 'Eye Check NHS';
    return 'Eye Check Private';
  };

  const getAvailableSlots = () => {
    const slots = [];
    const duration = (booking.service === 'Eye Check' ? settings.eyeCheck : settings.contactLens) + settings.buffer;
    const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fromMins = (m: number) => { 
      const h = Math.floor(m / 60); const mm = m % 60; 
      return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`; 
    };

    const clinicStart = toMins(settings.start);
    const clinicEnd = toMins(settings.end);
    const dayBookings = existingBookings
      .filter(b => b.appointmentDate === booking.date)
      .map(b => {
        const d = b.appointmentType.includes('Contact') ? settings.contactLens : settings.eyeCheck;
        return { start: toMins(b.appointmentTime), end: toMins(b.appointmentTime) + d + settings.buffer };
      });

    for (let current = clinicStart; current + duration <= clinicEnd; current += 15) {
      const potentialEnd = current + duration;
      const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));
      if (!isOverlap) slots.push(fromMins(current));
    }
    return slots;
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

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-black" style={{ color: '#3F9185' }}>Leicester Eye Centre</h1>
        <p className="text-slate-500 mt-2 font-medium italic">Clinical Excellence in Vision</p>
      </header>

      <div className="glass-card rounded-[2.5rem] p-8">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Select Service</h2>
            {['Eye Check', 'Contact Lens Check'].map(s => (
              <button key={s} onClick={() => { setBooking({...booking, service: s}); setStep(2); }} className="w-full p-6 text-left border-2 border-slate-50 rounded-2xl hover:border-[#3F9185] bg-white flex justify-between items-center group">
                <span className="font-bold text-lg">{s}</span>
                <ChevronRight className="text-slate-300 group-hover:text-[#3F9185]" />
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
             <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)}><ArrowLeft size={20} className="text-slate-600" /></button>
                <h2 className="text-xl font-bold">Available Appointments</h2>
             </div>
             <input type="date" min={new Date().toISOString().split('T')[0]} value={booking.date} className="w-full p-4 rounded-xl bg-slate-50 font-bold text-[#3F9185] outline-none" onChange={e => setBooking({...booking, date: e.target.value})} />
             <div className="grid grid-cols-3 gap-2">
                {getAvailableSlots().map(t => (
                  <button key={t} onClick={() => setBooking({...booking, time: t})} className={`py-3 rounded-xl font-bold border-2 transition-all ${booking.time === t ? 'bg-[#3F9185] text-white' : 'bg-white text-slate-400 border-slate-50'}`}>{t}</button>
                ))}
             </div>
             <button disabled={!booking.time} onClick={() => setStep(3)} className="w-full py-4 rounded-2xl text-white font-black" style={{ backgroundColor: '#3F9185' }}>Continue</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-in fade-in">
            <h2 className="text-xl font-bold">Patient Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="First Name" className="p-4 rounded-xl bg-slate-50 outline-none" onChange={e => setBooking({...booking, firstName: e.target.value})} />
              <input placeholder="Last Name" className="p-4 rounded-xl bg-slate-50 outline-none" onChange={e => setBooking({...booking, lastName: e.target.value})} />
            </div>
            <input type="date" className="w-full p-4 rounded-xl bg-slate-50 outline-none" onChange={e => setBooking({...booking, dob: e.target.value})} />
            
            {booking.service === 'Eye Check' && (
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                  <input type="checkbox" onChange={e => setBooking({...booking, onBenefits: e.target.checked})} />
                  <span className="text-sm">Income-related benefits?</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                  <input type="checkbox" onChange={e => setBooking({...booking, isDiabetic: e.target.checked})} />
                  <span className="text-sm">Diabetic?</span>
                </label>
              </div>
            )}

            <button onClick={handleFinalSubmit} disabled={loading || !booking.firstName || !booking.dob} className="w-full py-4 rounded-2xl font-black text-white" style={{ backgroundColor: '#3F9185' }}>
              {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Confirm Booking'}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-10 space-y-4 animate-in zoom-in-95">
            <CheckCircle2 size={60} className="mx-auto text-emerald-500" />
            <h2 className="text-3xl font-black text-slate-900">Success!</h2>
            <p className="text-slate-500">Confirmed for {booking.time} on {booking.date}.</p>
            <button onClick={() => window.location.reload()} className="text-[#3F9185] font-bold">Finish</button>
          </div>
        )}
      </div>
    </div>
  );
}