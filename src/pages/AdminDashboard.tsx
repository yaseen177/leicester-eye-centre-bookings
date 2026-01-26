import { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  Edit3, 
  LogOut, 
  Users, 
  TrendingUp, 
  Activity 
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc } from 'firebase/firestore';

// Updated interface to match Firebase data structure
interface Appointment {
  id: string; // Firebase IDs are strings
  patientName: string;
  appointmentType: string;
  appointmentTime: string;
  appointmentDate: string;
}

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time listener for Firebase
  useEffect(() => {
    const q = query(collection(db, "appointments"), orderBy("appointmentDate", "asc"));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const appointmentsArray: Appointment[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        appointmentsArray.push({
          id: doc.id,
          patientName: data.patientName,
          appointmentType: data.appointmentType,
          appointmentTime: data.appointmentTime,
          appointmentDate: data.appointmentDate,
        } as Appointment);
      });
      setAppointments(appointmentsArray);
      setLoading(false);
    });

    return () => unsubscribe(); // Stop listening when page closes
  }, []);

  const deleteAppointment = async (id: string) => {
    if (window.confirm("Are you sure you want to cancel this appointment?")) {
      try {
        await deleteDoc(doc(db, "appointments", id));
      } catch (error) {
        console.error("Error deleting appointment: ", error);
        alert("Could not delete. Check your Firebase permissions.");
      }
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
        
        {/* Top Navigation Bar */}
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Practice Portal</h1>
            <p className="text-slate-500 font-medium text-lg">Live Clinical Diary</p>
          </div>
          <button 
            onClick={() => window.location.href = '/admin-login'}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold hover:bg-red-50 hover:text-red-600 transition-all shadow-sm shadow-slate-100"
          >
            <LogOut size={18} /> Exit
          </button>
        </div>

        {/* Stats Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-[2rem] space-y-2">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Users size={24} />
            </div>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">Bookings</p>
            <p className="text-3xl font-black text-slate-900">{loading ? '...' : appointments.length}</p>
          </div>
          <div className="glass-card p-6 rounded-[2rem] space-y-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">Est. Revenue</p>
            <p className="text-3xl font-black text-slate-900">£{appointments.filter(a => a.appointmentType.includes('Private')).length * 40}</p>
          </div>
          <div className="glass-card p-6 rounded-[2rem] space-y-2">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
              <Activity size={24} />
            </div>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">Status</p>
            <p className="text-3xl font-black text-slate-900">Live</p>
          </div>
        </div>

        {/* Main Diary Section */}
        <div className="glass-card rounded-[2.5rem] overflow-hidden border-none ring-1 ring-slate-100">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white/50 backdrop-blur-md">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <CalendarIcon className="text-indigo-600" size={20} /> Active Appointments
            </h2>
            <div className="flex gap-2">
              <span className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-full uppercase">
                Real-time
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-50 bg-white/30">
            {!loading && appointments.length === 0 && (
              <div className="p-20 text-center text-slate-400 font-medium italic">
                No appointments found in the diary.
              </div>
            )}
            
            {appointments.map((app) => (
              <div key={app.id} className="p-6 flex items-center justify-between hover:bg-white/60 transition-all group">
                <div className="flex items-center gap-6">
                  <div className="text-center min-w-[70px] flex flex-col items-center">
                    <Clock size={16} className="text-indigo-400 mb-1" />
                    <p className="text-lg font-black text-slate-900 leading-none">{app.appointmentTime}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{app.appointmentDate}</p>
                  </div>
                  <div className="h-12 w-[2px] bg-slate-100 group-hover:bg-indigo-200 transition-colors" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">{app.patientName}</h3>
                    <span className="inline-flex items-center text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg mt-1 border border-indigo-100/50">
                      {app.appointmentType}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                    <Edit3 size={20} />
                  </button>
                  <button 
                    onClick={() => deleteAppointment(app.id)}
                    className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}