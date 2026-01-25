import React, { useState } from 'react';
import { Calendar, Clock, User, CheckCircle2 } from 'lucide-react';

const APPOINTMENT_TYPES = [
  { id: 'private', label: 'Eye Check Private', price: '£40' },
  { id: 'over60', label: 'Eye Check Over 60', price: 'Free (NHS)' },
  { id: 'child', label: 'Eye Check Child', price: 'Free (NHS)' },
  { id: 'nhs', label: 'Eye Check NHS', price: 'Free' },
];

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [booking, setBooking] = useState({ type: '', date: '', time: '', name: '' });

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Visionary Care</h1>
        <p className="text-slate-500 mt-2">Expert eye care, scheduled at your convenience.</p>
      </header>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-8">
        {step === 1 && (
          <section className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-semibold">Select Appointment Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {APPOINTMENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setBooking({...booking, type: t.label}); setStep(2); }}
                  className="p-6 border-2 border-slate-100 rounded-2xl text-left hover:border-blue-500 hover:bg-blue-50 transition-all group"
                >
                  <span className="block font-medium text-lg group-hover:text-blue-700">{t.label}</span>
                  <span className="text-slate-400 text-sm">{t.price}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-6 animate-in slide-in-from-right duration-500">
            <h2 className="text-xl font-semibold">Details & Time</h2>
            <div className="grid gap-4">
              <input type="text" placeholder="Full Name" className="w-full p-4 rounded-xl border border-slate-200" onChange={(e) => setBooking({...booking, name: e.target.value})} />
              <input type="date" className="w-full p-4 rounded-xl border border-slate-200" onChange={(e) => setBooking({...booking, date: e.target.value})} />
              <div className="flex gap-2">
                {['09:00', '10:30', '14:00', '16:00'].map(t => (
                  <button key={t} onClick={() => setBooking({...booking, time: t})} className={`px-4 py-2 rounded-lg border ${booking.time === t ? 'bg-blue-600 text-white' : 'bg-white'}`}>{t}</button>
                ))}
              </div>
              <button onClick={() => setStep(3)} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors">Confirm Booking</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <div className="text-center py-10 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
            <p className="text-slate-500">We look forward to seeing you, {booking.name}.</p>
            <button onClick={() => setStep(1)} className="text-blue-600 font-medium">Make another booking</button>
          </div>
        )}
      </div>
    </div>
  );
}