import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Trash2, Settings, List, LayoutDashboard, LogOut, Users, Activity } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

export default function AdminDashboard() {
  const [view, setView] = useState<'diary' | 'list' | 'settings'>('diary');
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
    getDoc(doc(db, "settings", "clinicConfig")).then(d => { if (d.exists()) setConfig(d.data() as any); });
    return () => unsub();
  }, []);

  const saveConfig = async () => {
    await setDoc(doc(db, "settings", "clinicConfig"), config);
    alert("Clinic configuration updated.");
  };

  const deleteApp = async (id: string) => {
    if (confirm("Cancel this appointment?")) await deleteDoc(doc(db, "appointments", id));
  };

  return (
    <div className="min-h-screen p-6 bg-[#f8fafc]">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex gap-2">
            {(['diary', 'list', 'settings'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-5 py-2 rounded-xl font-bold capitalize transition-all ${view === v ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => window.location.href='/admin-login'} className="p-2 text-slate-400 hover:text-red-500"><LogOut size={20}/></button>
        </div>

        {view === 'diary' && (
          <div className="glass-card rounded-[2.5rem] p-8">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black flex items-center gap-3"><CalendarIcon className="text-[#3F9185]" /> Diary View</h2>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-2 border rounded-xl font-bold text-[#3F9185] outline-none" />
            </div>
            <div className="space-y-2">
              {appointments.filter(a => a.appointmentDate === selectedDate).sort((a,b) => a.appointmentTime.localeCompare(b.appointmentTime)).map(app => (
                <div key={app.id} className="p-5 rounded-2xl border-2 border-[#3F9185]/10 bg-white flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-6">
                    <span className="font-black text-slate-400 w-16">{app.appointmentTime}</span>
                    <div>
                      <p className="font-bold text-slate-800 text-lg">{app.patientName}</p>
                      <p className="text-xs font-bold text-[#3F9185] uppercase tracking-wider">{app.appointmentType}</p>
                    </div>
                  </div>
                  <button onClick={() => deleteApp(app.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={20}/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-8">
            <h2 className="text-2xl font-black">Clinical Configuration</h2>
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Clock size={18}/> Testing Times (mins)</h3>
                <input type="number" value={config.times.eyeCheck} onChange={e => setConfig({...config, times: {...config.times, eyeCheck: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50" placeholder="Eye Check" />
                <input type="number" value={config.times.contactLens} onChange={e => setConfig({...config, times: {...config.times, contactLens: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50" placeholder="Contact Lens" />
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Activity size={18}/> Clinic Hours</h3>
                <input type="time" value={config.hours.start} onChange={e => setConfig({...config, hours: {...config.hours, start: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50" />
                <input type="time" value={config.hours.end} onChange={e => setConfig({...config, hours: {...config.hours, end: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50" />
              </div>
            </div>
            <button onClick={saveConfig} className="px-10 py-4 bg-[#3F9185] text-white font-black rounded-2xl shadow-lg">Save Settings</button>
          </div>
        )}
      </div>
    </div>
  );
}