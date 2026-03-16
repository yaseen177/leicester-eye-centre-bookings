import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2, Mail, CheckCircle2, ArrowRight } from 'lucide-react';

export default function AddEmailPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [appointment, setAppointment] = useState<any>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const fetchAppt = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'appointments', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAppointment({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (err) {
        console.error("Failed to fetch appointment");
      }
      setLoading(false);
    };
    fetchAppt();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return alert("Please enter a valid email address.");
    
    setSubmitting(true);
    try {
      // 1. Update Database
      const docRef = doc(db, 'appointments', id!);
      await setDoc(docRef, { email: email.toLowerCase() }, { merge: true });

      const manageLink = `${window.location.origin}/manage/${id}`;

      // 2. Trigger Confirmation Email via Cloudflare Worker & Brevo
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_email",
          templateId: 1, // Booking Confirmation Template ID
          to_email: email.toLowerCase(),
          patient_name: appointment.patientName.split(' ')[0],
          params: {
            patient_name: appointment.patientName.split(' ')[0],
            appointment_type: appointment.appointmentType,
            date: new Date(appointment.appointmentDate).toLocaleDateString('en-GB'),
            time: appointment.appointmentTime,
            manage_link: manageLink
          }
        })
      });

      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Something went wrong saving your email.");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]"><Loader2 className="animate-spin text-[#3F9185]" size={40} /></div>;
  if (!appointment) return <div className="text-center mt-20 font-bold text-slate-500">Appointment not found.</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] px-6 py-12 flex items-center justify-center">
      <div className="max-w-md w-full glass-card rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 bg-white text-center">
        
        <div className="mb-6">
          <img src="/logo.png" alt="Leicester Eye Centre" className="h-16 w-auto mx-auto drop-shadow-sm" />
        </div>

        {!success ? (
          <div className="space-y-6 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={30} className="text-[#3F9185]" />
            </div>
            
            <h2 className="text-2xl font-black text-slate-800">Where should we send your receipt?</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Hi <strong>{appointment.patientName.split(' ')[0]}</strong>, your {appointment.appointmentType} is booked for <strong>{new Date(appointment.appointmentDate).toLocaleDateString('en-GB')} at {appointment.appointmentTime}</strong>. 
            </p>
            <p className="text-slate-500 text-sm leading-relaxed">
              Enter your email address below to receive your digital confirmation and a secure link to manage your booking.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <input 
                type="email" 
                placeholder="Your email address" 
                required 
                className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-[#3F9185] font-medium text-center"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <button 
                type="submit" 
                disabled={submitting || !email} 
                className="w-full py-4 rounded-2xl font-black text-white shadow-lg flex justify-center items-center gap-2 transition-all hover:brightness-110 disabled:opacity-50" 
                style={{ backgroundColor: '#3F9185' }}
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : <>Send My Receipt <ArrowRight size={18} /></>}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in zoom-in-95 py-6">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={40} className="text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-800">All Set!</h2>
            <p className="text-slate-500 text-sm">
              Your email has been saved securely and your confirmation receipt has just been sent to <strong>{email}</strong>.
            </p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-4">You can now close this page</p>
          </div>
        )}
      </div>
    </div>
  );
}