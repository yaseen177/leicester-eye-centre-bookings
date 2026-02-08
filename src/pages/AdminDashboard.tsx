import { useState, useEffect, type ReactNode } from 'react';
import { Calendar as CalendarIcon, Clock, Trash2, Settings, LayoutDashboard, LogOut, Activity } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import emailjs from '@emailjs/browser';

// 1. Updated Interface to fix TypeScript errors
interface ClinicConfig {
  times: { eyeCheck: number; contactLens: number };
  hours: { start: string; end: string };
  lunch: { start: string; end: string; enabled: boolean };
  weeklyOff: number[];
  openDates: string[];
  dailyOverrides: Record<string, { start: string; end: string }>;
  closedDates?: string[];
}

export default function AdminDashboard() {
  const [view, setView] = useState<'diary' | 'settings'>('diary');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [newBooking, setNewBooking] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    service: 'Eye Check',
    time: '',
    inFullTimeEducation: false,
    onBenefits: false,
    isDiabetic: false,
    familyGlaucoma: false
  });

  const calculateSlotsForDate = (targetDate: string) => {
    const dayHours = config.dailyOverrides?.[targetDate] || config.hours;
    const startMins = toMins(dayHours.start);
    const endMins = toMins(dayHours.end);

    const isLunchEnabled = config.lunch?.enabled ?? true;
    const lunchStartMins = toMins(config.lunch?.start || "13:00");
    const lunchEndMins = toMins(config.lunch?.end || "14:00");

    const duration = newBooking.service === 'Eye Check' ? config.times.eyeCheck : config.times.contactLens;
    const slots: string[] = [];

    // Map existing bookings for overlap checks
    const dayBookings = appointments
      .filter(b => b.appointmentDate === targetDate)
      .map(b => {
        const d = b.appointmentType.includes('Contact') ? config.times.contactLens : config.times.eyeCheck;
        return { start: toMins(b.appointmentTime), end: toMins(b.appointmentTime) + d };
      });

    for (let current = startMins; current + duration <= endMins; current += 5) {
      const potentialEnd = current + duration;
      const overlapsLunch = isLunchEnabled && (current < lunchEndMins && potentialEnd > lunchStartMins);
      const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));

      if (!overlapsLunch && !isOverlap) {
        slots.push(fromMins(current));
      }
    }
    return slots;
};

  // 2. Initial State with enabled property
  const [config, setConfig] = useState<ClinicConfig>({ 
    times: { eyeCheck: 30, contactLens: 20 }, 
    hours: { start: "09:00", end: "17:00" },
    lunch: { start: "13:00", end: "14:00", enabled: true },
    weeklyOff: [0],
    openDates: [],
    dailyOverrides: {}
  });

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "appointments"), (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const loadSettings = async () => {
      const docRef = doc(db, "settings", "clinicConfig");
      const d = await getDoc(docRef);
      if (d.exists()) {
        const cloudData = d.data();
        setConfig(prev => ({
          ...prev,
          times: cloudData.times || prev.times,
          hours: cloudData.hours || prev.hours,
          lunch: {
            start: cloudData.lunch?.start || "13:00",
            end: cloudData.lunch?.end || "14:00",
            enabled: cloudData.lunch?.enabled ?? true
          },
          weeklyOff: cloudData.weeklyOff || prev.weeklyOff,
          openDates: cloudData.openDates || prev.openDates,
          dailyOverrides: cloudData.dailyOverrides || prev.dailyOverrides
        }));
        setClosedDates(cloudData.closedDates || []);
      }
    };
    loadSettings();
    return () => unsub();
  }, []);

  // --- Helper Functions ---
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // Inside AdminDashboard component


  const handleAdminBooking = async () => {
    try {
      // 1. Calculate clinical category
      const age = calculateAge(newBooking.dob);
      let category = 'Eye Check Private';
      
      if (newBooking.service === 'Contact Lens Check') {
        category = 'Contact Lens Check';
      } else {
        if (age >= 60) category = 'Eye Check Over 60';
        else if (age < 16) category = 'Eye Check Child';
        else if (age <= 18 && newBooking.inFullTimeEducation) category = 'Eye Check NHS';
        else if (newBooking.onBenefits || newBooking.isDiabetic || (age >= 40 && newBooking.familyGlaucoma)) category = 'Eye Check NHS';
      }
  
      // 2. Capture docRef when adding to Firestore
      // This resolves the "Cannot find name 'docRef'" error
      const docRef = await addDoc(collection(db, "appointments"), {
        patientName: `${newBooking.firstName} ${newBooking.lastName}`,
        email: newBooking.email,
        phone: newBooking.phone,
        dob: newBooking.dob,
        appointmentType: category,
        appointmentDate: selectedDate,
        appointmentTime: newBooking.time,
        source: 'Admin',
        isDiabetic: newBooking.isDiabetic,
        onBenefits: newBooking.onBenefits,
        familyGlaucoma: newBooking.familyGlaucoma,
        inFullTimeEducation: newBooking.inFullTimeEducation,
        createdAt: serverTimestamp()
      });
  
      // 3. EmailJS Logic...
      if (newBooking.email) {
        const emailParams = {
          to_email: newBooking.email,
          patient_name: newBooking.firstName,
          appointment_type: category,
          date: new Date(selectedDate).toLocaleDateString('en-GB'),
          time: newBooking.time,
          reply_to: 'enquiries@theeyecentre.com'
        };
        
        await emailjs.send('service_et75v9a', 'template_prhl49a', emailParams, 'kjN74GNmFhu6fNch8');
      }
  
      // 4. SMS logic with corrected variable names
      const apptDate = new Date(`${selectedDate}T${newBooking.time}`);
      const newReminderDate = new Date(apptDate.getTime() - (24 * 60 * 60 * 1000));
      
      const smsRes = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: newBooking.phone,
          body: `Confirmation: ${newBooking.firstName}, your ${newBooking.service} is scheduled for ${new Date(selectedDate).toLocaleDateString('en-GB')} at ${newBooking.time}. The Eye Centre, Leicester.`,
          // FIX: Use newReminderDate here
          reminderTime: newReminderDate.toISOString() 
        })
      });
  
      if (smsRes.ok) {
        const smsData = await smsRes.json();
        const sid = smsData.sid || smsData.reminderSid;
        if (sid) {
          // FIX: docRef is now used here, resolving the 'never read' warning
          await setDoc(docRef, { reminderSid: sid }, { merge: true });
        }
      }
  
      setIsBookingModalOpen(false);
      alert("Appointment successfully booked.");
    } catch (err) {
      console.error("Booking Error:", err);
      alert("Error saving booking.");
    }
  };

  const fromMins = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  };

  const isDateClosed = () => {
    const dateObj = new Date(selectedDate);
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday...
    
    const isWeeklyOff = config.weeklyOff?.includes(dayOfWeek);
    const isManuallyOpened = config.openDates?.includes(selectedDate);
    const isManuallyClosed = closedDates.includes(selectedDate);
  
    // Logic: 
    // 1. If manually closed -> Closed
    // 2. If it's a Weekly Off day but NOT manually opened -> Closed
    // 3. Otherwise -> Open
    return isManuallyClosed || (isWeeklyOff && !isManuallyOpened);
  };

  const calculateAge = (dobString: string) => {
    if (!dobString) return 0;
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
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

  const updateAppointment = async () => {
  if (!editingApp) return;
  try {
    // 1. Define the document reference first so we can use it later
    const appRef = doc(db, "appointments", editingApp.id);
    
    // 2. Update Firestore
    await setDoc(appRef, {
      patientName: editingApp.patientName,
      email: editingApp.email,
      phone: editingApp.phone,
      dob: editingApp.dob,
      appointmentTime: editingApp.appointmentTime,
      appointmentDate: editingApp.appointmentDate
    }, { merge: true });

    // 3. Calculate new reminder time
    const newApptDate = new Date(`${editingApp.appointmentDate}T${editingApp.appointmentTime}`);
    const newReminderDate = new Date(newApptDate.getTime() - (24 * 60 * 60 * 1000));

    // 4. Send SMS (Fix: Use editingApp data, not newBooking)
    const smsRes = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: editingApp.phone, // Fixed
        body: `Update: ${editingApp.patientName.split(' ')[0]}, your appointment has been updated to ${new Date(editingApp.appointmentDate).toLocaleDateString('en-GB')} at ${editingApp.appointmentTime}. The Eye Centre, Leicester.`,
        reminderTime: newReminderDate.toISOString() // Fixed variable name
      })
    });

    // 5. Save SMS ID (Fix: Use appRef, not docRef)
    if (smsRes.ok) {
      const { sid } = await smsRes.json();
      if (sid) {
        await setDoc(appRef, { reminderSid: sid }, { merge: true }); // Fixed docRef -> appRef
      }
    }

    setEditingApp(null);
    alert("Patient details and SMS reminders updated.");
  } catch (err) {
    console.error(err);
    alert("Failed to update appointment.");
  }
};

  const handleDrop = async (e: React.DragEvent, newTime: string) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("appointmentId");
    if (!appointmentId) return;

    try {
      const appRef = doc(db, "appointments", appointmentId);
      await setDoc(appRef, { appointmentTime: newTime }, { merge: true });
    } catch (err) {
      alert("Failed to move appointment.");
    }
  };

  const toggleDayStatus = async (date: string) => {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();
    const isWeeklyOff = config.weeklyOff?.includes(dayOfWeek);

    let newClosed = [...closedDates];
    let newOpen = [...(config.openDates || [])];

    if (isWeeklyOff) {
      newOpen = newOpen.includes(date) ? newOpen.filter(d => d !== date) : [...newOpen, date];
    } else {
      newClosed = newClosed.includes(date) ? newClosed.filter(d => d !== date) : [...newClosed, date];
    }

    setClosedDates(newClosed);
    const updatedConfig = { ...config, openDates: newOpen, closedDates: newClosed };
    setConfig(updatedConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), updatedConfig, { merge: true });
  };

  const updateDailyHours = async (start: string, end: string) => {
    const newOverrides = { ...config.dailyOverrides, [selectedDate]: { start, end } };
    const newConfig = { ...config, dailyOverrides: newOverrides };
    setConfig(newConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), newConfig, { merge: true });
  };

  const toggleWeeklyDay = async (dayIndex: number) => {
    let newWeeklyOff = [...config.weeklyOff];
    newWeeklyOff = newWeeklyOff.includes(dayIndex) 
      ? newWeeklyOff.filter(d => d !== dayIndex) 
      : [...newWeeklyOff, dayIndex];
    
    const newConfig = { ...config, weeklyOff: newWeeklyOff };
    setConfig(newConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), newConfig, { merge: true });
  };

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
    const dayHours = config.dailyOverrides?.[selectedDate] || config.hours;
    const startMins = toMins(dayHours.start);
    const endMins = toMins(dayHours.end);

    const isLunchEnabled = config.lunch?.enabled ?? true;
    const lunchStartMins = toMins(config.lunch?.start || "13:00");
    const lunchEndMins = toMins(config.lunch?.end || "14:00");
    
    for (let time = startMins; time < endMins; time += 5) {
      const timeStr = fromMins(time);
      const isLunchSlot = isLunchEnabled && (time >= lunchStartMins && time < lunchEndMins);
      const booking = appointments.find((a: any) => a.appointmentDate === selectedDate && a.appointmentTime === timeStr);
  
      if (booking || time % 15 === 0 || isLunchSlot) {
        const duration = booking 
          ? (booking.appointmentType.includes('Contact') ? config.times.contactLens : config.times.eyeCheck)
          : 0;
        const endTimeStr = booking ? fromMins(time + duration) : '';
  
        grid.push(
          <div 
            key={timeStr} 
            className={`flex items-center border-b border-slate-50 py-3 transition-colors ${isLunchSlot ? 'bg-orange-50/30' : 'hover:bg-slate-50/50'}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, timeStr)}
          >
            <div className="w-20 text-xs font-black text-slate-300 tabular-nums">
              {timeStr}
              {isLunchSlot && <span className="block text-[8px] text-orange-400 uppercase font-bold">Lunch</span>}
            </div>
            <div className="flex-1 px-4">
              {booking ? (
                <div 
                  draggable 
                  onDragStart={(e) => e.dataTransfer.setData("appointmentId", booking.id)}
                  className="bg-white ring-1 ring-[#3F9185]/20 border-l-4 border-[#3F9185] p-4 rounded-xl flex justify-between items-center shadow-sm cursor-move"
                >
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-3">
                        <span className="text-[11px] font-black text-[#3F9185] bg-teal-50 px-2.5 py-1 rounded-md tabular-nums border border-[#3F9185]/10">
                          {timeStr} — {endTimeStr}
                        </span>
                        <p className="font-bold text-slate-800 text-base">{booking.patientName}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                         <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                           booking.source === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                         }`}>
                           {booking.source === 'Admin' ? 'Booked by Admin' : 'Booked Online'}
                         </span>
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                          booking.appointmentType?.includes('Contact') ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                        }`}>
                          {booking.appointmentType || 'Routine Eye Check'}
                        </span>
                      </div>
                    </div>
                    {/* ... rest of your appointment card (DOB, Age, Contact details) */}
                    <div className="flex items-center gap-4 ml-1">
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase">DOB:</span>
                        <span className="text-[11px] font-bold text-slate-600">{booking.dob || 'N/A'}</span>
                        <span className="text-[10px] font-medium text-slate-400 border-l border-slate-200 pl-1.5 ml-1">Age: {calculateAge(booking.dob)}</span>
                      </div>
                    </div>
  
                    <div className="flex flex-wrap gap-x-6 gap-y-1 ml-1 pt-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">E:</span> {booking.email}</span>
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">T:</span> {booking.phone}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => setEditingApp(booking)} className="text-slate-300 hover:text-[#3F9185] p-2 hover:bg-teal-50 rounded-full">
                      <Settings size={18} />
                    </button>
                    <button onClick={() => deleteApp(booking.id)} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-full">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`h-8 w-full border-b border-dashed ${isLunchSlot ? 'border-orange-100' : 'border-slate-100/50 hover:bg-teal-50/30'}`} />
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
          <button onClick={() => window.location.href='/admin-login'} className="p-2 text-slate-400 hover:text-red-500">
            <LogOut size={20}/>
          </button>
        </div>

        {view === 'diary' && (
          <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <CalendarIcon className="text-[#3F9185]" /> Daily Grid
                </h2>
                {/* NEW ADMIN BOOKING BUTTON */}
                <button 
                  onClick={() => setIsBookingModalOpen(true)}
                  className="bg-[#3F9185] text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-all shadow-md"
                >
                  + New Booking
                </button>
              </div>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 bg-slate-100 rounded-xl font-bold text-[#3F9185] outline-none" />
            </div>

            {/* Status Banner */}
            <div className={`mb-6 p-5 rounded-2xl border flex items-center justify-between transition-all ${isDateClosed() ? 'bg-red-50 border-red-100' : 'bg-[#3F9185]/5 border-[#3F9185]/10'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full animate-pulse ${isDateClosed() ? 'bg-red-500' : 'bg-[#3F9185]'}`}></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Clinic Status</p>
                  <p className="font-bold text-slate-800">{isDateClosed() ? 'Closed to Patients' : 'Open for Bookings'}</p>
                </div>
              </div>
              <button onClick={() => toggleDayStatus(selectedDate)} className={`px-6 py-2 rounded-xl font-black text-xs uppercase ${isDateClosed() ? 'bg-white text-red-500 border border-red-200 shadow-sm' : 'bg-[#3F9185] text-white hover:opacity-90'}`}>
                {isDateClosed() ? 'Mark as Open' : 'Mark as Closed'}
              </button>
            </div>

            {/* Shift Override */}
            <div className="mb-8 p-5 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-500">
                <Clock size={16} />
                <span className="text-xs font-bold uppercase">Shift for this specific day:</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="time" className="p-2 bg-slate-50 rounded-lg text-xs font-bold outline-none" value={config.dailyOverrides?.[selectedDate]?.start || config.hours.start} onChange={(e) => updateDailyHours(e.target.value, config.dailyOverrides?.[selectedDate]?.end || config.hours.end)} />
                <span className="text-slate-300">to</span>
                <input type="time" className="p-2 bg-slate-50 rounded-lg text-xs font-bold outline-none" value={config.dailyOverrides?.[selectedDate]?.end || config.hours.end} onChange={(e) => updateDailyHours(config.dailyOverrides?.[selectedDate]?.start || config.hours.start, e.target.value)} />
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pr-2">
              {renderGrid()}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-8">
            <h2 className="text-2xl font-black text-slate-800">Clinic Settings</h2>
            {/* ... rest of your settings UI (Durations, Hours, Lunch, Weekly Off) */}
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Clock size={18}/> Durations (mins)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Eye Examination</label>
                    <input type="number" value={config.times.eyeCheck} onChange={e => setConfig({...config, times: {...config.times, eyeCheck: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Contact Lens Check</label>
                    <input type="number" value={config.times.contactLens} onChange={e => setConfig({...config, times: {...config.times, contactLens: +e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Activity size={18}/> Clinic Hours</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Opens</label>
                    <input type="time" value={config.hours.start} onChange={e => setConfig({...config, hours: {...config.hours, start: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Closes</label>
                    <input type="time" value={config.hours.end} onChange={e => setConfig({...config, hours: {...config.hours, end: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><Clock size={18}/> Lunch Break</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={config.lunch.enabled} onChange={e => setConfig({...config, lunch: {...config.lunch, enabled: e.target.checked}})} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3F9185]"></div>
                  </label>
                </div>
                <div className={`grid grid-cols-2 gap-4 ${!config.lunch.enabled ? 'opacity-30 pointer-events-none' : ''}`}>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Starts</label>
                    <input type="time" value={config.lunch.start} onChange={e => setConfig({...config, lunch: {...config.lunch, start: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Ends</label>
                    <input type="time" value={config.lunch.end} onChange={e => setConfig({...config, lunch: {...config.lunch, end: e.target.value}})} className="w-full p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185]" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-[#3F9185] flex items-center gap-2"><CalendarIcon size={18}/> Weekly Off</h3>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map((day, idx) => (
                    <button key={day} onClick={() => toggleWeeklyDay(idx)} className={`px-4 py-2 rounded-xl font-bold text-xs ${config.weeklyOff.includes(idx) ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={saveConfig} className="px-10 py-4 bg-[#3F9185] text-white font-black rounded-2xl shadow-lg hover:opacity-90 transition-all">Save Changes</button>
          </div>
        )}
      </div>

      {/* MODAL 1: EDIT APPOINTMENT */}
      {editingApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full animate-in zoom-in-95 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-slate-800">Edit Patient Details</h3>
            <div className="space-y-4">
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.patientName} onChange={e => setEditingApp({...editingApp, patientName: e.target.value})} placeholder="Name" />
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.email} onChange={e => setEditingApp({...editingApp, email: e.target.value})} placeholder="Email" />
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.phone} onChange={e => setEditingApp({...editingApp, phone: e.target.value})} placeholder="Phone" />
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setEditingApp(null)} className="flex-1 p-4 font-bold text-slate-400">Cancel</button>
              <button onClick={updateAppointment} className="flex-1 p-4 font-black bg-[#3F9185] text-white rounded-xl">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW ADMIN BOOKING */}
      {isBookingModalOpen && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
    <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95">
      <h2 className="text-2xl font-black text-slate-800 mb-6">Direct Admin Booking</h2>
      
      <div className="space-y-4">
        {/* 1. Date Selection: Prevents past dates and blocks closed dates */}
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Appointment Date</label>
          <input 
            type="date" 
            min={new Date().toISOString().split('T')[0]} 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)} 
            className="w-full p-4 bg-slate-50 rounded-xl font-bold text-[#3F9185] outline-none border-none focus:ring-2 focus:ring-[#3F9185]"
          />
          {isDateClosed() && (
            <p className="text-red-500 text-[10px] font-bold mt-1 ml-1 uppercase">Clinic is closed on this date</p>
          )}
        </div>

        {/* 2. Patient Demographics */}
        <div className="grid grid-cols-2 gap-4">
          <input placeholder="First Name" className="p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, firstName: e.target.value})} />
          <input placeholder="Last Name" className="p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, lastName: e.target.value})} />
        </div>
        <input placeholder="Email" className="w-full p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, email: e.target.value})} />
        <input placeholder="Phone" className="w-full p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, phone: e.target.value})} />
        
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date of Birth</label>
          <input type="date" className="w-full p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, dob: e.target.value})} />
        </div>
        
        <select className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold" value={newBooking.service} onChange={e => setNewBooking({...newBooking, service: e.target.value})}>
          <option value="Eye Check">Eye Check</option>
          <option value="Contact Lens Check">Contact Lens Check</option>
        </select>

        {/* 3. Clinical Eligibility Checks: Exact Age-Dependent logic from BookingPage.tsx */}
        {newBooking.service === 'Eye Check' && newBooking.dob && (
          <div className="space-y-2 pt-2">
            {calculateAge(newBooking.dob) >= 16 && calculateAge(newBooking.dob) <= 18 && (
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.inFullTimeEducation} onChange={e => setNewBooking({...newBooking, inFullTimeEducation: e.target.checked})} />
                <span className="text-[11px] font-bold text-slate-600">In full-time education?</span>
              </label>
            )}
            {calculateAge(newBooking.dob) >= 19 && calculateAge(newBooking.dob) <= 59 && (
              <>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                  <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.onBenefits} onChange={e => setNewBooking({...newBooking, onBenefits: e.target.checked})} />
                  <span className="text-[11px] font-bold text-slate-600">Receiving benefits?</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                  <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.isDiabetic} onChange={e => setNewBooking({...newBooking, isDiabetic: e.target.checked})} />
                  <span className="text-[11px] font-bold text-slate-600">Diabetic?</span>
                </label>
                {calculateAge(newBooking.dob) >= 40 && (
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                    <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={newBooking.familyGlaucoma} onChange={e => setNewBooking({...newBooking, familyGlaucoma: e.target.checked})} />
                    <span className="text-[11px] font-bold text-slate-600">Family history of Glaucoma?</span>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {/* 4. Filtered Time Selection */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Available Times</label>
          <div className="grid grid-cols-4 gap-2">
            {calculateSlotsForDate(selectedDate).map((t: string) => (
              <button 
                key={t}
                onClick={() => setNewBooking({...newBooking, time: t})}
                className={`py-2 rounded-lg text-[11px] font-black transition-all border-2 ${
                  newBooking.time === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button onClick={() => setIsBookingModalOpen(false)} className="flex-1 p-4 font-bold text-slate-400">Cancel</button>
        <button 
          onClick={handleAdminBooking} 
          disabled={!newBooking.time || !newBooking.firstName || isDateClosed()} 
          className="flex-1 p-4 font-black bg-[#3F9185] text-white rounded-xl shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          Confirm Booking
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}