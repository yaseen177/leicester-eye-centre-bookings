import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase'; // Ensure this path matches your firebase file
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface AppointmentType {
  id: string;
  label: string;
  price: string;
}

interface BookingData {
  type: string;
  date: string;
  time: string;
  name: string;
}

const APPOINTMENT_TYPES: AppointmentType[] = [
  { id: 'private', label: 'Eye Check Private', price: '£40' },
  { id: 'over60', label: 'Eye Check Over 60', price: 'Free (NHS)' },
  { id: 'child', label: 'Eye Check Child', price: 'Free (NHS)' },
  { id: 'nhs', label: 'Eye Check NHS', price: 'Free' },
];

export default function BookingPage() {
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [booking, setBooking] = useState<BookingData>({ 
    type: '', 
    date: '', 
    time: '', 
    name: '' 
  });

  const handleConfirmBooking = async () => {
    setIsSubmitting(true);
    try {
      // Save to Firebase Firestore
      await addDoc(collection(db, "appointments"), {
        patientName: booking.name,
        appointmentType: booking.type,
        appointmentDate: booking.date,
        appointmentTime: booking.time,
        createdAt: serverTimestamp(),
        status: 'pending' // You can use this for the admin to 'approve' if needed
      });
      
      setStep(3);
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("Something went wrong. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-black tracking-tight text-slate-900">Leicester Eye Centre</h1>
        <p className="text-slate-500 mt-2 font-medium">Expert eye care, scheduled at your convenience.</p>
      </header>

      <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-xl shadow-slate-200/60 p-8 border border-white">
        {step === 1 && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-slate-800">Select Appointment Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {APPOINTMENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setBooking({...booking, type: t.label}); setStep(2); }}
                  className="p-6 border-2 border-slate-50 rounded-2xl text-left hover:border-blue-500 hover:bg-blue-50 transition-all group bg-white shadow-sm"
                >
                  <span className="block font-bold text-lg text-slate-800 group-hover:text-blue-700">{t.label}</span>
                  <span className="text-slate-400 text-sm font-medium">{t.price}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-6 animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-bold text-slate-800">Details & Time</h2>
            <div className="grid gap-4">
              <input 
                type="text" 
                placeholder="Full Name" 
                className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                onChange={(e) => setBooking({...booking, name: e.target.value})} 
              />
              <input 
                type="date" 
                className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-600" 
                onChange={(e) => setBooking({...booking, date: e.target.value})} 
              />
              <div className="flex flex-wrap gap-2">
                {['09:00', '10:30', '14:00', '16:00'].map(t => (
                  <button 
                    key={t} 
                    onClick={() => setBooking({...booking, time: t})} 
                    className={`px-6 py-3 rounded-xl border-2 font-bold transition-all ${booking.time === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-50 hover:bg-slate-50'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button 
                onClick={handleConfirmBooking} 
                disabled={!booking.name || !booking.time || !booking.date || isSubmitting}
                className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-lg hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmitting ? <><Loader2 className="animate-spin" /> Processing...</> : 'Confirm Booking'}
              </button>
              <button onClick={() => setStep(1)} className="w-full text-slate-400 text-sm font-bold hover:text-slate-600 transition-colors">Back</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <div className="text-center py-10 space-y-4 animate-in zoom-in-90">
            <div className="flex justify-center">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-900">Booking Confirmed!</h2>
            <p className="text-slate-500 max-w-xs mx-auto font-medium">
              Thank you, <span className="font-bold text-slate-800">{booking.name}</span>. We've scheduled your <span className="font-bold text-slate-800">{booking.type}</span>.
            </p>
            <div className="pt-6">
              <button 
                onClick={() => { setBooking({type: '', date: '', time: '', name: ''}); setStep(1); }} 
                className="text-blue-600 font-bold hover:text-blue-700 transition-colors"
              >
                Make another booking
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}