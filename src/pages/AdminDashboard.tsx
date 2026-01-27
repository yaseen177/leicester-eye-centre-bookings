import { useState, useEffect, type ReactNode } from 'react';
import { Calendar as CalendarIcon, Clock, Trash2, Settings, LayoutDashboard, LogOut, Activity } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

export default function AdminDashboard() {
  const [view, setView] = useState<'diary' | 'settings'>('diary');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [config, setConfig] = useState({ 
    times: { eyeCheck: 30, contactLens: 20 }, 
    hours: { start: "09:00", end: "17:00" },
    weeklyOff: [0],
    openDates: [] as string[] // Defaulting Sunday to Off
  });
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const toggleWeeklyDay = async (dayIndex: number) => {
    let newWeeklyOff = [...(config.weeklyOff || [])];
    if (newWeeklyOff.includes(dayIndex)) {
      newWeeklyOff = newWeeklyOff.filter(d => d !== dayIndex);
    } else {
      newWeeklyOff.push(dayIndex);
    }
    
    const newConfig = { ...config, weeklyOff: newWeeklyOff };
    setConfig(newConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), newConfig, { merge: true });
  };

  useEffect(() => {
    // 1. Listen for Appointments (Real-time)
    const unsub = onSnapshot(collection(db, "appointments"), (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch Clinic Settings (Persistent)
    // Inside AdminDashboard.tsx useEffect
    const loadSettings = async () => {
      const docRef = doc(db, "settings", "clinicConfig");
      const d = await getDoc(docRef);
      if (d.exists()) {
        const cloudData = d.data();
        setConfig({
          times: cloudData.times || { eyeCheck: 30, contactLens: 20 },
          hours: cloudData.hours || { start: "09:00", end: "17:00" },
          weeklyOff: cloudData.weeklyOff || [0],
          openDates: cloudData.openDates || [] // ADD THIS LINE
        });
        setClosedDates(cloudData.closedDates || []);
      }
    };
    // 3. Trigger the fetch immediately
    loadSettings();

    return () => unsub();
  }, []);

  // --- Helper Functions (Now properly scoped inside the component) ---
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
    if (window.confirm("Are you sure you want to cancel this appointment?")) {
      try {
        await deleteDoc(doc(db, "appointments", id));
      } catch (err) {
        alert("Failed to delete appointment.");
      }
    }
  };

  // Add this state to AdminDashboard.tsx
const [closedDates, setClosedDates] = useState<string[]>([]);

const calculateAge = (dobString: string) => {
  if (!dobString) return 0;
  const birthDate = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};


// Add this function to toggle days
const toggleDayStatus = async (date: string) => {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();
  const isWeeklyOff = config.weeklyOff?.includes(dayOfWeek);

  let newClosed = [...closedDates];
  let newOpen = [...(config.openDates || [])];

  if (isWeeklyOff) {
    // If it's a Sunday, toggle it in the 'openDates' override list
    newOpen = newOpen.includes(date) 
      ? newOpen.filter(d => d !== date) 
      : [...newOpen, date];
  } else {
    // If it's a weekday, toggle it in the 'closedDates' list
    newClosed = newClosed.includes(date) 
      ? newClosed.filter(d => d !== date) 
      : [...newClosed, date];
  }

  setClosedDates(newClosed);
  // We update config locally so the UI updates immediately
  setConfig(prev => ({ ...prev, openDates: newOpen }));

  await setDoc(doc(db, "settings", "clinicConfig"), { 
    ...config, 
    closedDates: newClosed,
    openDates: newOpen 
  }, { merge: true });
};
{/* Status Banner in Diary View */}
<div className={`mb-6 p-4 rounded-2xl border transition-all flex items-center justify-between ${
  closedDates.includes(selectedDate) 
  ? 'bg-red-50 border-red-100' 
  : 'bg-teal-50 border-teal-100'
}`}>
  <div>
    <h3 className={`text-sm font-black uppercase tracking-widest ${
      closedDates.includes(selectedDate) ? 'text-red-600' : 'text-[#3F9185]'
    }`}>
      {closedDates.includes(selectedDate) ? 'Clinic Closed' : 'Clinic Open'}
    </h3>
    <p className="text-xs text-slate-500 font-medium">For {new Date(selectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p>
  </div>

  <div className="space-y-4">
  <h3 className="font-bold text-[#3F9185] flex items-center gap-2">Standard Weekly Closures</h3>
  <p className="text-xs text-slate-400 font-medium italic">Select days the clinic is usually closed. You can still manually open specific dates in the Diary view.</p>
  <div className="flex flex-wrap gap-2">
    {daysOfWeek.map((day, index) => (
      <button
        key={day}
        onClick={() => toggleWeeklyDay(index)}
        className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
          config.weeklyOff?.includes(index)
            ? 'bg-red-100 text-red-600 border border-red-200'
            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:border-[#3F9185]'
        }`}
      >
        {day}
      </button>
    ))}
  </div>
</div>
  
  <button 
    onClick={() => toggleDayStatus(selectedDate)}
    className={`px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-tighter transition-all active:scale-95 ${
      closedDates.includes(selectedDate) 
      ? 'bg-white text-red-500 border border-red-200 shadow-sm' 
      : 'bg-[#3F9185] text-white shadow-md'
    }`}
  >
    {closedDates.includes(selectedDate) ? 'Mark as Open' : 'Mark as Closed'}
  </button>
</div>

  const saveConfig = async () => {
    try {
      await setDoc(doc(db, "settings", "clinicConfig"), config);
      alert("Clinic settings saved to database!");
    } catch (err) {
      alert("Error saving settings.");
    }
  };

  const renderGrid = () => {
    const grid: ReactNode[] = [];
    const startMins = toMins(config.hours.start);
    const endMins = toMins(config.hours.end);
    
    for (let time = startMins; time < endMins; time += 5) {
      const timeStr = fromMins(time);
      const booking = appointments.find((a: any) => 
        a.appointmentDate === selectedDate && a.appointmentTime === timeStr
      );

      if (booking || time % 15 === 0) {
        // Calculate the "Time To" based on the appointment type
        const duration = booking 
          ? (booking.appointmentType.includes('Contact') ? config.times.contactLens : config.times.eyeCheck)
          : 0;
        const endTimeStr = booking ? fromMins(time + duration) : '';

        grid.push(
          <div key={timeStr} className="flex items-center border-b border-slate-50 py-3 hover:bg-slate-50/50 transition-colors">
            <div className="w-20 text-xs font-black text-slate-300 tabular-nums">{timeStr}</div>
            <div className="flex-1 px-4">
            {booking ? (
  <div className="bg-white ring-1 ring-[#3F9185]/20 border-l-4 border-[#3F9185] p-4 rounded-xl flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
  <div className="flex flex-col gap-2 w-full">
    {/* Top Row: Time, Name and Service Badge */}
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-black text-[#3F9185] bg-teal-50 px-2.5 py-1 rounded-md tabular-nums border border-[#3F9185]/10">
          {timeStr} — {endTimeStr}
        </span>
        <p className="font-bold text-slate-800 text-base">{booking.patientName}</p>
      </div>
      
      {/* Service Type Badge */}
      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
        booking.appointmentType?.includes('Contact') 
          ? 'bg-blue-50 text-blue-600 border-blue-100' 
          : 'bg-slate-50 text-slate-500 border-slate-100'
      }`}>
        {booking.appointmentType || 'Routine Eye Check'}
      </span>
    </div>
    
    {/* Middle Row: DOB & Age */}
    <div className="flex items-center gap-4 ml-1">
      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">DOB:</span>
        <span className="text-[11px] font-bold text-slate-600">
          {booking.dob ? new Date(booking.dob).toLocaleDateString('en-GB') : 'N/A'}
        </span>
        {booking.dob && (
          <span className="text-[10px] font-medium text-slate-400 border-l border-slate-200 pl-1.5 ml-1">
            Age: {calculateAge(booking.dob)}
          </span>
        )}
      </div>
    </div>

    {/* Bottom Row: Contact Details */}
    <div className="flex flex-wrap gap-x-6 gap-y-1 ml-1 pt-1">
      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
        <span className="font-black text-[#3F9185]">E:</span> {booking.email}
      </span>
      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
        <span className="font-black text-[#3F9185]">T:</span> {booking.phone}
      </span>
    </div>
  </div>
  
  <div className="flex items-center ml-4">
    <button onClick={() => deleteApp(booking.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full">
      <Trash2 size={18} />
    </button>
  </div>
</div>
) : (
  <div className="h-4 w-full border-b border-slate-100/30" />
)}
            </div>
          </div>
        );
      }
    }
    return grid;
  };

  return (
    <div className="min-h-screen p-6 bg-[#f8fafc]">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex gap-2">
            <button onClick={() => setView('diary')} className={`px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'diary' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <LayoutDashboard size={18} /> Diary
            </button>
            <button onClick={() => setView('settings')} className={`px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'settings' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Settings size={18} /> Settings
            </button>
          </div>
          <button onClick={() => window.location.href='/admin-login'} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut size={20}/>
          </button>
        </div>

        {view === 'diary' && (
  <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5 animate-in fade-in">
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
      <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
        <CalendarIcon className="text-[#3F9185]" /> Daily Grid
      </h2>
      <input 
        type="date" 
        value={selectedDate} 
        onChange={e => setSelectedDate(e.target.value)} 
        className="p-3 bg-slate-100 border-none rounded-xl font-bold text-[#3F9185] outline-none cursor-pointer" 
      />
    </div>

    {/* --- NEW: Day Toggle Banner --- */}
    <div className={`mb-8 p-5 rounded-2xl border flex items-center justify-between transition-all ${
      closedDates.includes(selectedDate) 
      ? 'bg-red-50 border-red-100' 
      : 'bg-[#3F9185]/5 border-[#3F9185]/10'
    }`}>
      <div className="flex items-center gap-4">
        <div className={`w-3 h-3 rounded-full animate-pulse ${closedDates.includes(selectedDate) ? 'bg-red-500' : 'bg-[#3F9185]'}`}></div>
        <div>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Clinic Status</p>
          <p className="font-bold text-slate-800">
            {closedDates.includes(selectedDate) ? 'Closed to Patients' : 'Open for Bookings'}
          </p>
        </div>
      </div>
      
      <button 
        onClick={() => toggleDayStatus(selectedDate)}
        className={`px-6 py-2 rounded-xl font-black text-xs uppercase tracking-tighter transition-all active:scale-95 shadow-sm ${
          closedDates.includes(selectedDate) 
          ? 'bg-white text-red-500 border border-red-200 hover:bg-red-50' 
          : 'bg-[#3F9185] text-white hover:opacity-90'
        }`}
      >
        {closedDates.includes(selectedDate) ? 'Open this Day' : 'Close this Day'}
      </button>
    </div>
    {/* --- End of Banner --- */}

    <div className="max-h-[70vh] overflow-y-auto pr-2">
      {renderGrid()}
    </div>
  </div>
)}

        {/* Settings View */}
        {view === 'settings' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-8 animate-in slide-in-from-right-4">
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
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Opens</label>
                    <input type="time" value={config.hours.start} onChange={e => setConfig({...config, hours: {...config.hours, start: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Closes</label>
                    <input type="time" value={config.hours.end} onChange={e => setConfig({...config, hours: {...config.hours, end: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>
              {/* Standard Weekly Closures Section */}
<div className="space-y-4 pt-6 border-t border-slate-100">
  <h3 className="font-bold text-[#3F9185] flex items-center gap-2">
    <CalendarIcon size={18}/> Standard Weekly Closures
  </h3>
  <p className="text-xs text-slate-400 font-medium italic">
    Select the days your clinic is usually closed. Patients won't be able to book these days unless you manually "Open" a specific date in the Diary.
  </p>
  
  <div className="flex flex-wrap gap-2">
    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => {
      const isOff = config.weeklyOff?.includes(index);
      return (
        <button
          key={day}
          onClick={async () => {
            const newWeeklyOff = isOff
              ? config.weeklyOff.filter(d => d !== index)
              : [...(config.weeklyOff || []), index];
            
            // Update local state
            const newConfig = { ...config, weeklyOff: newWeeklyOff };
            setConfig(newConfig);
            
            // Save immediately to Firebase
            await setDoc(doc(db, "settings", "clinicConfig"), newConfig, { merge: true });
          }}
          className={`flex-1 min-w-[80px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border-2 ${
            isOff 
            ? 'bg-red-50 border-red-100 text-red-500' 
            : 'bg-white border-slate-100 text-slate-400 hover:border-[#3F9185]/30'
          }`}
        >
          {day}
          <div className={`text-[8px] mt-1 ${isOff ? 'text-red-400' : 'text-slate-300'}`}>
            {isOff ? 'CLOSED' : 'OPEN'}
          </div>
        </button>
      );
    })}
  </div>
</div>
            </div>
            <button onClick={saveConfig} className="px-10 py-4 bg-[#3F9185] text-white font-black rounded-2xl shadow-lg hover:opacity-90 transition-all">
              Save Changes to Database
            </button>
          </div>
        )}
      </div>
    </div>
  );
}