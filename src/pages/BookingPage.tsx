import { useState } from 'react';
import { CheckCircle2, Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [booking, setBooking] = useState({
    service: '', // "Eye Check" or "Contact Lens Check"
    date: '',
    time: '',
    firstName: '',
    lastName: '',
    dob: '',
    inFullTimeEducation: false,
    onBenefits: false,
    isDiabetic: false,
    familyGlaucoma: false
  });

  // Calculation Logic for Appointment Category
  const getCategory = () => {
    if (booking.service === 'Contact Lens Check') return 'Contact Lens Check';
    
    const birthDate = new Date(booking.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

    if (age >= 60) return 'Eye Check Over 60';
    if (age < 16) return 'Eye Check Child';
    if (age >= 16 && age <= 18 && booking.inFullTimeEducation) return 'Eye Check NHS';
    
    if (age >= 19 && age <= 59) {
      if (booking.onBenefits || booking.isDiabetic) return 'Eye Check NHS';
      if (age >= 40 && booking.familyGlaucoma) return 'Eye Check NHS';
      return 'Eye Check Private';
    }
    
    return 'Eye Check Private';
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
    } catch (e) {
      alert("Error booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <header className="text-center mb-10">
        <h1 className="text-4xl font-black text-slate-900" style={{ color: '#3F9185' }}>Leicester Eye Centre</h1>
        <p className="text-slate-500 mt-2 font-medium">Professional optical care</p>
      </header>

      <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5">
        
        {/* Step 1: Service Selection */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-slate-800 mb-4">How can we help today?</h2>
            {['Eye Check', 'Contact Lens Check'].map(service => (
              <button 
                key={service}
                onClick={() => { setBooking({...booking, service}); setStep(2); }}
                className="w-full p-6 text-left border-2 border-slate-50 rounded-2xl hover:border-[#3F9185] hover:bg-teal-50/30 transition-all flex justify-between items-center group bg-white shadow-sm"
              >
                <span className="font-bold text-lg text-slate-700">{service}</span>
                <ChevronRight className="text-slate-300 group-hover:text-[#3F9185]" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Time Selection */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in">
             <h2 className="text-xl font-bold text-slate-800">Select a convenient time</h2>
             <input type="date" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-medium text-slate-600 focus:ring-2 focus:ring-[#3F9185]" onChange={e => setBooking({...booking, date: e.target.value})} />
             <div className="grid grid-cols-3 gap-2">
                {['09:00', '10:30', '14:00', '16:00'].map(t => (
                  <button key={t} onClick={() => setBooking({...booking, time: t})} className={`py-3 rounded-xl font-bold border-2 transition-all ${booking.time === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-50'}`}>{t}</button>
                ))}
             </div>
             <button disabled={!booking.date || !booking.time} onClick={() => setStep(3)} className="w-full py-4 rounded-2xl font-black text-white shadow-lg shadow-teal-900/10 disabled:opacity-50" style={{ backgroundColor: '#3F9185' }}>Continue</button>
             <button onClick={() => setStep(1)} className="w-full text-slate-400 text-sm font-bold">Back</button>
          </div>
        )}

        {/* Step 3: Triage Questions */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
            <h2 className="text-xl font-bold text-slate-800">Patient Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="First Name" className="p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" onChange={e => setBooking({...booking, firstName: e.target.value})} />
              <input placeholder="Last Name" className="p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" onChange={e => setBooking({...booking, lastName: e.target.value})} />
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase ml-1">Date of Birth</label>
              <input type="date" className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" onChange={e => setBooking({...booking, dob: e.target.value})} />
            </div>

            {/* Conditional Logic UI */}
            <div className="space-y-3 pt-2">
              {/* Logic for 16-18 */}
              {(() => {
                const age = booking.dob ? Math.floor((new Date().getTime() - new Date(booking.dob).getTime()) / 31557600000) : 0;
                
                if (booking.service === 'Eye Check') {
                  if (age >= 16 && age <= 18) return (
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                      <input type="checkbox" checked={booking.inFullTimeEducation} onChange={e => setBooking({...booking, inFullTimeEducation: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-600">Are you in full-time education?</span>
                    </label>
                  );
                  if (age >= 19 && age <= 59) return (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                        <input type="checkbox" onChange={e => setBooking({...booking, onBenefits: e.target.checked})} />
                        <span className="text-sm font-medium text-slate-600">Are you in receipt of income-related benefits?</span>
                      </label>
                      <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                        <input type="checkbox" onChange={e => setBooking({...booking, isDiabetic: e.target.checked})} />
                        <span className="text-sm font-medium text-slate-600">Are you diabetic?</span>
                      </label>
                      {age >= 40 && (
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                          <input type="checkbox" onChange={e => setBooking({...booking, familyGlaucoma: e.target.checked})} />
                          <span className="text-sm font-medium text-slate-600">Do you have a parent/sibling with glaucoma?</span>
                        </label>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <button onClick={handleFinalSubmit} disabled={loading || !booking.firstName || !booking.dob} className="w-full py-4 rounded-2xl font-black text-white flex justify-center items-center gap-2" style={{ backgroundColor: '#3F9185' }}>
              {loading ? <Loader2 className="animate-spin" /> : 'Confirm Booking'}
            </button>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="text-center py-10 space-y-4 animate-in zoom-in-95">
            <div className="bg-teal-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
               <CheckCircle2 size={40} style={{ color: '#3F9185' }} />
            </div>
            <h2 className="text-3xl font-black text-slate-900">All set!</h2>
            <p className="text-slate-500 font-medium">Your <span className="font-bold text-slate-800">{getCategory()}</span> is confirmed for {booking.time}.</p>
            <button onClick={() => window.location.reload()} className="text-[#3F9185] font-bold">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}