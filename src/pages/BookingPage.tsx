import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

// Define the shape of our appointment types
interface AppointmentType {
  id: string;
  label: string;
  price: string;
}

// Define the shape of a booking
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
  const [booking, setBooking] = useState<BookingData>({ 
    type: '', 
    date: '', 
    time: '', 
    name: '' 
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Leicester Eye Centre</h1>
        <p className="text-slate-500 mt-2">Expert eye care, scheduled at your convenience.</p>
      </header>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-8 border border-slate-50">
        {step === 1 && (
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">Select Appointment Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {APPOINTMENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setBooking({...booking, type: t.label}); setStep(2); }}
                  className="p-6 border-2 border-slate-100 rounded-2xl text-left hover:border-blue-500 hover:bg-blue-50 transition-all group"
                >
                  <span className="block font-bold text-lg text-slate-800 group-hover:text-blue-700">{t.label}</span>
                  <span className="text-slate-400 text-sm">{t.price}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">Details & Time</h2>
            <div className="grid gap-4">
              <input 
                type="text" 
                placeholder="Full Name" 
                className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" 
                onChange={(e) => setBooking({...booking, name: e.target.value})} 
              />
              <input 
                type="date" 
                className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" 
                onChange={(e) => setBooking({...booking, date: e.target.value})} 
              />
              <div className="flex flex-wrap gap-2">
                {['09:00', '10:30', '14:00', '16:00'].map(t => (
                  <button 
                    key={t} 
                    onClick={() => setBooking({...booking, time: t})} 
                    className={`px-6 py-3 rounded-xl border font-medium transition-all ${booking.time === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setStep(3)} 
                disabled={!booking.name || !booking.time || !booking.date}
                className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Confirm Booking
              </button>
              <button onClick={() => setStep(1)} className="w-full text-slate-400 text-sm">Back</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <div className="text-center py-10 space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="w-20 h-20 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900">Booking Confirmed!</h2>
            <p className="text-slate-500 max-w-xs mx-auto">
              Thank you, <span className="font-semibold text-slate-800">{booking.name}</span>. We've scheduled your <span className="font-semibold text-slate-800">{booking.type}</span>.
            </p>
            <div className="pt-6">
              <button 
                onClick={() => { setBooking({type: '', date: '', time: '', name: ''}); setStep(1); }} 
                className="text-blue-600 font-semibold hover:underline"
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