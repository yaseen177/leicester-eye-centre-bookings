import { useState, useEffect, type ReactNode } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  Settings, 
  LayoutDashboard, 
  LogOut, 
  Activity 
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

export default function AdminDashboard() {
  const [view, setView] = useState<'diary' | 'settings'>('diary');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [config, setConfig] = useState({ 
    times: { eyeCheck: 30, contactLens: 20, buffer: 5 }, 
    hours: { start: "09:00", end: "17:00" } 
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "appointments"), (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    getDoc(doc(db, "settings", "clinicConfig")).then(d => { 
      if (d.exists()) setConfig(d.data() as any); 
    });
    return () => unsub();
  }, []);

  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const fromMins = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  };

  const deleteApp = async (id: string) => {
    if (confirm("Cancel this appointment?")) await deleteDoc(doc(db, "appointments", id));
  };

  const saveConfig = async () => {
    await setDoc(doc(db, "settings", "clinicConfig"), config);
    alert("Clinic configuration updated.");
  };

  const renderGrid = () => {
    const grid: ReactNode[] = [];
    const startMins = toMins(config.hours.start);
    const endMins = toMins(config.hours.end);
    
    // We'll show markers every 15 minutes for a clean grid
    for (let time = startMins; time < endMins; time += 15) {
      const timeStr = fromMins(time);
      const booking = appointments.find((a: any) => 
        a.appointmentDate === selectedDate && a.appointmentTime === timeStr
      );
  
      grid.push(
        <div key={timeStr} className="group relative flex items-center border-b border-slate-50 py-3 hover:bg-slate-50/50 transition-colors">
          {/* Time Sidebar */}
          <div className="w-20 text-xs font-black text-slate-300 tabular-nums">
            {timeStr}
          </div>
  
          {/* Slot Content */}
          <div className="flex-1 px-4">
            {booking ? (
              <div className="bg-white ring-1 ring-[#3F9185]/20 border-l-4 border-[#3F9185] p-3 rounded-xl shadow-sm flex justify-between items-center animate-in fade-in zoom-in-95">
                <div>
                  <p className="font-bold text-slate-800 text-sm">{booking.patientName}</p>
                  <p className="text-[10px] font-black text-[#3F9185] uppercase tracking-tighter">
                    {booking.appointmentType}
                  </p>
                </div>
                <button onClick={() => deleteApp(booking.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <div className="h-10 flex items-center border-2 border-dashed border-slate-100 rounded-xl px-4">
                <span className="text-[10px] font-bold text-slate-200 uppercase">Available Slot</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return grid;
  };

  return (
    <div className="min-h-screen p-6 bg-[#f8fafc]">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex gap-2">
            <button onClick={() => setView('diary')} className={`px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'diary' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <LayoutDashboard size={18} /> Diary
            </button>
            <button onClick={() => setView('settings')} className={`px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'settings' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Settings size={18} /> Settings
            </button>
          </div>
          <button onClick={() => window.location.href='/admin-login'} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><LogOut size={20}/></button>
        </div>

        {view === 'diary' && (
  <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5">
    <div className="flex justify-between items-center mb-8">
      <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
        <CalendarIcon className="text-[#3F9185]" /> Clinical Grid
      </h2>
      <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 bg-slate-100 border-none rounded-xl font-bold text-[#3F9185] outline-none" />
    </div>

    <div className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
      {renderGrid()}
    </div>
  </div>
)}

        {view === 'settings' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-8">
            <h2 className="text-2xl font-black text-slate-800">Clinic Settings</h2>
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Clock size={18}/> Durations (mins)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Eye Examination</label>
                    <input type="number" value={config.times.eyeCheck} onChange={e => setConfig({...config, times: {...config.times, eyeCheck: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Contact Lens Check</label>
                    <input type="number" value={config.times.contactLens} onChange={e => setConfig({...config, times: {...config.times, contactLens: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Activity size={18}/> Clinic Hours</h3>
                <div className="grid grid-cols-2 gap-4">
                  <input type="time" value={config.hours.start} onChange={e => setConfig({...config, hours: {...config.hours, start: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  <input type="time" value={config.hours.end} onChange={e => setConfig({...config, hours: {...config.hours, end: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185]" />
                </div>
              </div>
            </div>
            <button onClick={saveConfig} className="px-10 py-4 bg-[#3F9185] text-white font-black rounded-2xl shadow-lg hover:opacity-90 transition-all">Save Changes</button>
          </div>
        )}
      </div>
    </div>
  );
}