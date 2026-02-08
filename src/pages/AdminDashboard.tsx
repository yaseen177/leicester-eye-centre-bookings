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

  const [config, setConfig] = useState<ClinicConfig>({ 
    times: { eyeCheck: 30, contactLens: 20 }, 
    hours: { start: "09:00", end: "17:00" },
    lunch: { start: "13:00", end: "14:00", enabled: true },
    weeklyOff: [0],
    openDates: [],
    dailyOverrides: {}
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  

  // 2. Initial State with enabled property
  
  // Place this inside AdminDashboard component
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = appointments.filter(app => {
      // Format DOB to DD/MM/YYYY for searching
      const dobFormatted = app.dob ? new Date(app.dob).toLocaleDateString('en-GB') : '';
      
      return (
        app.patientName?.toLowerCase().includes(query) ||
        app.email?.toLowerCase().includes(query) ||
        app.phone?.includes(query) ||
        dobFormatted.includes(query)
      );
    });

    // Sort results by date (newest first)
    results.sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());

    setSearchResults(results);
    setCurrentResultIndex(0); // Reset to first result on new search
  }, [searchQuery, appointments]);

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

  const fromMins = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
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

  // Inside AdminDashboard component


  const handleAdminBooking = async () => {
    try {
      // FORMAT PHONE NUMBER (Fixes Twilio 21211 Error)
      const rawPhone = newBooking.phone.trim();
      const formattedPhone = rawPhone.startsWith('0') 
        ? `+44${rawPhone.substring(1)}` 
        : rawPhone;
  
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
  
      // 2. Save to Firestore (Save the formatted number!)
      const docRef = await addDoc(collection(db, "appointments"), {
        patientName: `${newBooking.firstName} ${newBooking.lastName}`,
        email: newBooking.email,
        phone: formattedPhone, // Use formattedPhone here
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
  
      // 3. EmailJS Logic
      if (newBooking.email) {
        const emailParams = {
          to_email: newBooking.email,
          patient_name: newBooking.firstName,
          appointment_type: category,
          date: new Date(selectedDate).toLocaleDateString('en-GB'),
          time: newBooking.time,
          reply_to: 'enquiries@theeyecentre.com'
        };
        
        try {
          await emailjs.send('service_et75v9m', 'template_prhl49a', emailParams, 'kjN74GNmFhu6fNch8');
        } catch (emailErr) {
          console.error("Failed to send email:", emailErr);
        }
      }
  
      // 4. SMS Logic
      const apptDate = new Date(`${selectedDate}T${newBooking.time}`);
      const newReminderDate = new Date(apptDate.getTime() - (24 * 60 * 60 * 1000));
      
      const smsRes = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: formattedPhone, // Use formattedPhone here
          body: `Confirmation: ${newBooking.firstName}, your ${newBooking.service} is scheduled for ${new Date(selectedDate).toLocaleDateString('en-GB')} at ${newBooking.time}.\nOur expert team look forward to providing you with exceptional care.\n\nFor any enquiries, please call 0116 253 2788.\nThe Eye Centre, Leicester`,
          reminderTime: newReminderDate.toISOString() 
        })
      });
  
      if (smsRes.ok) {
        const smsData = await smsRes.json();
        const sid = smsData.sid || smsData.reminderSid;
        if (sid) {
          await setDoc(docRef, { reminderSid: sid }, { merge: true });
        }
      }
  
      setIsBookingModalOpen(false);
      alert("Appointment successfully booked.");
    } catch (err) {
      console.error("Booking Error:", err);
      alert("Error saving booking. Check console.");
    }
  };

  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
  
    let newIndex = direction === 'next' ? currentResultIndex + 1 : currentResultIndex - 1;
  
    // Loop around logic
    if (newIndex >= searchResults.length) newIndex = 0;
    if (newIndex < 0) newIndex = searchResults.length - 1;
  
    setCurrentResultIndex(newIndex);
    
    // Jump to the date of the result
    const targetDate = searchResults[newIndex].appointmentDate;
    setSelectedDate(targetDate);
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

  

  const deleteApp = async (id: string) => {
    if (window.confirm("Are you sure you want to cancel this appointment?")) {
      try {
        await deleteDoc(doc(db, "appointments", id));
      } catch (err) {
        alert("Failed to delete appointment.");
      }
    }
  };

  // Place this inside AdminDashboard component
// Find your existing updateStatus function and replace it with this:

const updateStatus = async (id: string, newStatus: string) => {
  try {
    const appRef = doc(db, "appointments", id);
    
    // 1. Update status in Firestore immediately
    await setDoc(appRef, { status: newStatus }, { merge: true });
    
    // 2. AUTOMATION: Trigger whenever status becomes 'Visit Complete'
    if (newStatus === 'Visit Complete') {
      const booking = appointments.find(a => a.id === id);
      
      // REMOVED check for "!booking.reviewEmailSent" to allow re-triggering
      if (booking && booking.email) {
        
        // Always ask for confirmation so you don't send accidental duplicates
        const confirmSend = window.confirm(
          `Status updated to 'Visit Complete'.\n\n(Re)Schedule the 10-minute automated Google Review email for ${booking.patientName}?`
        );

        if (!confirmSend) return; 

        // 3. Call Cloudflare Worker
        const WORKER_URL = "https://twilio.yaseen-hussain18.workers.dev/"; 
        
        fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: "schedule_review",
                email: booking.email,
                patientName: booking.patientName,
                reviewLink: "https://www.google.com/search?client=safari&hs=6XJp&sca_esv=a98330bec46d892d&hl=en-gb&sxsrf=ANbL-n7q1T411PmM5NcJOwroW6swm6hF1Q:1770557907167&q=the+eye+centre+leicester+reviews&uds=ALYpb_kHqLs5gcVMAt3VLSqkcdlMngXus-x9GFCSkvQn8dOI9knopxGU9LtrgKEndWds03AMNjaI5aH_9BC0i8ndBjxe0SsadfbbEnnBjLNMU7lLaqWGPqVSw1UkT5mz8-tC8KzEoKnmrcEYZqOyYsFStR9ixAAXYpnTFy_rHEtFibwKsz1Df_e0roHKvw_WTIdAN-O-V2wRmwFfijY7lRRcr8Fqsmzu4h6Uug98cMw3iZ6j4yDggD0DCXrHypYOBJgQy-e9BADe43T4RQ42gh2PduZz7fKKbuI2bYThxWuz0Qqw_WC07eCtysMbjvE1MHf-iD3PyHmiAKhimmwdFTIyWVYoesfaV6uHc10IAQRjorXWF7PoPE8DzWEcoiq69FCd_rlzM1cEvPzCQq53UdQAc9KQlB4iL33nJFRjrx76uuyN4T-8mYvsyV1TP_XmtTwZMp7KiXbH3yXrR-RdRB8kUNU_SwH3vBVSEhOoYBqRoYVTtUhCzyd3We2LXnedujTsoa4y54OSEmuSH4YgTWUUKmJUi8GTDQ&si=AL3DRZHrmvnFAVQPOO2Bzhf8AX9KZZ6raUI_dT7DG_z0kV2_x-NXv3ANlcDqRAVq-f0yXFMJFQ3KfdXqv9BUk7kRK8o1RdQyT1VtJMiyHySCLQPw_j7x1K2zM5lmjSef1pKTuZ7JpytYcGLwIoQL1NqkpHr5NiMPoQ%3D%3D&sa=X&ved=2ahUKEwjAovGYgsqSAxW2VUEAHctYDUsQk8gLegQIHBAB&ictx=1&biw=393&bih=659&dpr=3#ebo=2"
            })
        })
        .then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Worker failed");
            
            console.log(`✅ Automation Triggered. ID: ${data.id}`);
            alert(`Email scheduled! (Sent via Worker)`);
            
            // We still log it for your records, but the logic above no longer checks this flag
            await setDoc(appRef, { reviewEmailSent: true, reviewEmailLastSent: new Date().toISOString() }, { merge: true });
        })
        .catch(err => {
            console.error("Worker failed:", err);
            alert(`Failed to schedule: ${err.message}`);
        });
      }
    }
  } catch (err) {
    console.error("Error updating status:", err);
    alert("Failed to update status");
  }
};

// Helper to get color based on status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Arrived': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'In Progress': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Visit Complete': return 'bg-green-100 text-green-700 border-green-200';
      case 'FTA': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200'; // Booked
    }
  };

  const updateAppointment = async () => {
    if (!editingApp) return;
    try {
      // FORMAT PHONE NUMBER (Fixes Twilio 21211 Error)
      const rawPhone = editingApp.phone.trim();
      const formattedPhone = rawPhone.startsWith('0') 
        ? `+44${rawPhone.substring(1)}` 
        : rawPhone;
  
      const appRef = doc(db, "appointments", editingApp.id);
      
      // 1. Update Firestore
      await setDoc(appRef, {
        patientName: editingApp.patientName,
        email: editingApp.email,
        phone: formattedPhone, // Save formatted number
        dob: editingApp.dob,
        appointmentTime: editingApp.appointmentTime,
        appointmentDate: editingApp.appointmentDate
      }, { merge: true });
  
      // 2. Calculate new reminder time
      const newApptDate = new Date(`${editingApp.appointmentDate}T${editingApp.appointmentTime}`);
      const newReminderDate = new Date(newApptDate.getTime() - (24 * 60 * 60 * 1000));
  
      // 3. Send SMS
      const smsRes = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: formattedPhone, // Use formatted number
          body: `Update: ${editingApp.patientName.split(' ')[0]}, your appointment has been updated to ${new Date(editingApp.appointmentDate).toLocaleDateString('en-GB')} at ${editingApp.appointmentTime}. The Eye Centre, Leicester.`,
          reminderTime: newReminderDate.toISOString()
        })
      });
  
      if (smsRes.ok) {
        const { sid } = await smsRes.json();
        if (sid) {
          await setDoc(appRef, { reminderSid: sid }, { merge: true });
        }
      }
  
      setEditingApp(null);
      alert("Appointment updated and new SMS reminder scheduled.");
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

        // Search Highlighting Logic
        const isHighlighted = searchResults.length > 0 && 
                              booking && 
                              searchResults[currentResultIndex]?.id === booking.id;
  
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
                  className={`relative p-4 rounded-xl flex justify-between items-center shadow-sm cursor-move transition-all duration-500 ${
                    isHighlighted 
                      ? 'bg-yellow-50 ring-2 ring-yellow-400 border-l-4 border-yellow-500 shadow-lg scale-[1.01] z-10' 
                      : 'bg-white ring-1 ring-[#3F9185]/20 border-l-4 border-[#3F9185]'
                  }`}
                >
                  {/* Highlight Badge */}
                  {isHighlighted && (
                    <div className="absolute -top-3 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-2 py-1 rounded-full shadow-sm animate-bounce z-20">
                      RESULT {currentResultIndex + 1}/{searchResults.length}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 w-full">
                    {/* Top Row: Time, Name, Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-3">
                        <span className="text-[11px] font-black text-[#3F9185] bg-teal-50 px-2.5 py-1 rounded-md tabular-nums border border-[#3F9185]/10">
                          {timeStr} — {endTimeStr}
                        </span>
                        <p className="font-bold text-slate-800 text-base">{booking.patientName}</p>
                      </div>

                      <div className="flex items-center gap-2">
                         {/* Source Tag */}
                         <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider ${
                           booking.source === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                         }`}>
                           {booking.source === 'Admin' ? 'Admin' : 'Online'}
                         </span>

                         {/* STATUS DROPDOWN */}
                         <select 
                           value={booking.status || 'Booked'} 
                           onChange={(e) => updateStatus(booking.id, e.target.value)}
                           className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border cursor-pointer outline-none transition-colors appearance-none text-center ${getStatusColor(booking.status || 'Booked')}`}
                           // Stop propagation so clicking the select doesn't start a drag
                           onClick={(e) => e.stopPropagation()} 
                         >
                           <option value="Booked">Booked</option>
                           <option value="Arrived">Arrived</option>
                           <option value="In Progress">In Progress</option>
                           <option value="Visit Complete">Completed</option>
                           <option value="FTA">FTA</option>
                         </select>
                      </div>
                    </div>
                    
                    {/* Middle Row: DOB & Type */}
                    <div className="flex items-center gap-4 ml-1">
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase">DOB:</span>
                        <span className="text-[11px] font-bold text-slate-600">{booking.dob || 'N/A'}</span>
                        <span className="text-[10px] font-medium text-slate-400 border-l border-slate-200 pl-1.5 ml-1">Age: {calculateAge(booking.dob)}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                          booking.appointmentType?.includes('Contact') ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                        }`}>
                          {booking.appointmentType || 'Routine Eye Check'}
                      </span>
                    </div>
  
                    {/* Bottom Row: Contacts */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 ml-1 pt-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">E:</span> {booking.email}</span>
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">T:</span> {booking.phone}</span>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 ml-4 border-l border-slate-100 pl-4">
                    <button onClick={() => setEditingApp(booking)} className="text-slate-300 hover:text-[#3F9185] p-2 hover:bg-teal-50 rounded-full transition-colors" title="Edit">
                      <Settings size={18} />
                    </button>
                    <button onClick={() => deleteApp(booking.id)} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition-colors" title="Delete">
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
    
    {/* 1. Header & Controls */}
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
          <CalendarIcon className="text-[#3F9185]" /> Daily Grid
        </h2>
        <button 
          onClick={() => setIsBookingModalOpen(true)}
          className="bg-[#3F9185] text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-all shadow-md"
        >
          + New Booking
        </button>
      </div>
      <input 
        type="date" 
        value={selectedDate} 
        onChange={e => setSelectedDate(e.target.value)} 
        className="p-3 bg-slate-100 rounded-xl font-bold text-[#3F9185] outline-none cursor-pointer hover:bg-slate-200 transition-colors" 
      />
    </div>

    {/* 2. SEARCH BAR */}
    <div className="bg-white p-2 rounded-2xl border border-slate-100 mb-6 flex items-center justify-between gap-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center gap-3 flex-1 bg-slate-50 p-3 rounded-xl transition-all focus-within:ring-2 focus-within:ring-[#3F9185]/20">
        <span className="text-slate-400">🔍</span>
        <input 
          type="text" 
          placeholder="Search patient name, email, phone..." 
          className="bg-transparent outline-none w-full font-bold text-slate-700 placeholder:font-medium placeholder:text-slate-400 text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 font-bold text-xs">CLEAR</button>
        )}
      </div>

      {searchResults.length > 0 && (
        <div className="flex items-center gap-3 bg-slate-800 text-white pl-4 pr-2 py-2 rounded-xl shadow-lg animate-in fade-in slide-in-from-right-4">
          <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
            Match {currentResultIndex + 1} / {searchResults.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => navigateSearch('prev')} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors">⬆️</button>
            <button onClick={() => navigateSearch('next')} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors">⬇️</button>
          </div>
        </div>
      )}
      
      {searchQuery && searchResults.length === 0 && (
        <span className="text-xs font-bold text-red-400 px-4 animate-in fade-in">No matches found</span>
      )}
    </div>

    {/* 3. Status Banner */}
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

    {/* 4. Shift Override */}
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

    <div className="max-h-[70vh] overflow-y-auto pr-2 scroll-smooth">
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
        {/* 4. Filtered Time Selection */}
<div className="space-y-2">
  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Available Times</label>
  
  {/* CONDITIONAL RENDERING: Check if date is closed or no slots exist */}
  {isDateClosed() || calculateSlotsForDate(selectedDate).length === 0 ? (
    <div className="w-full p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-2 text-slate-400">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
        <span className="font-black text-xs">✕</span>
      </div>
      <span className="text-xs font-bold uppercase tracking-wider">No slots available</span>
    </div>
  ) : (
    <div className="grid grid-cols-4 gap-2">
      {calculateSlotsForDate(selectedDate).map((t: string) => (
        <button 
          key={t}
          onClick={() => setNewBooking({...newBooking, time: t})}
          className={`py-2 rounded-lg text-[11px] font-black transition-all border-2 ${
            newBooking.time === t 
              ? 'bg-[#3F9185] text-white border-[#3F9185]' 
              : 'bg-white text-slate-400 border-slate-100 hover:border-[#3F9185]/30'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )}
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