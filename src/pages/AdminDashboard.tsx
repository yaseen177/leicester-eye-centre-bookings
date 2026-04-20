import { useState, useEffect, type ReactNode } from 'react';
import { Calendar as CalendarIcon, Clock, Trash2, Settings, LayoutDashboard, LogOut, Activity, ExternalLink, FileText, CheckCircle2, XCircle, MessageSquare, Send, Paperclip, Mail, User, Search } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';

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
  const [view, setView] = useState<'diary' | 'settings' | 'logs' | 'messages'>('diary');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [newBooking, setNewBooking] = useState({
    firstName: '', lastName: '', email: '', phone: '', dob: '', service: 'Eye Check', time: '', inFullTimeEducation: false, onBenefits: false, isDiabetic: false, familyGlaucoma: false
  });

  const [config, setConfig] = useState<ClinicConfig>({ 
    times: { eyeCheck: 30, contactLens: 20 }, 
    hours: { start: "09:00", end: "17:00" },
    lunch: { start: "13:00", end: "14:00", enabled: true },
    weeklyOff: [0], openDates: [], dailyOverrides: {}
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  const [logSearch, setLogSearch] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("All");
  const [logStatusFilter, setLogStatusFilter] = useState("All");

  // --- MESSAGES STATE ---
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [selectedChatPatient, setSelectedChatPatient] = useState<any>(null);
  const [commsType, setCommsType] = useState<'SMS' | 'Email'>('SMS');
  const [outboundSMS, setOutboundSMS] = useState('');
  const [emailData, setEmailData] = useState({ subject: '', body: '', attachment: null as File | null });
  const [isSendingComms, setIsSendingComms] = useState(false);

  // --- NEW: SEARCH STATES ---
  const [patientSearch, setPatientSearch] = useState('');
  const [globalMessageSearch, setGlobalMessageSearch] = useState('');

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const queryStr = searchQuery.toLowerCase();
    const results = appointments.filter(app => {
      const dobFormatted = app.dob ? new Date(app.dob).toLocaleDateString('en-GB') : '';
      return (
        app.patientName?.toLowerCase().includes(queryStr) ||
        app.email?.toLowerCase().includes(queryStr) ||
        app.phone?.includes(queryStr) ||
        dobFormatted.includes(queryStr)
      );
    });
    results.sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
    setSearchResults(results);
    setCurrentResultIndex(0);
  }, [searchQuery, appointments]);

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    const unsubAppts = onSnapshot(collection(db, "appointments"), (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qLogs = query(collection(db, "logs"), orderBy("timestamp", "desc"));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qMessages = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    return () => { unsubAppts(); unsubLogs(); unsubMessages(); };
  }, []);

  const writeLog = async (type: 'Email' | 'SMS', patientName: string, contactInfo: string, status: 'Sent' | 'Failed', action: string, apptDate: string, apptTime: string, errorMsg = '') => {
    try {
      await addDoc(collection(db, "logs"), {
        type, patientName, contactInfo, status, action, apptDate, apptTime, errorMsg, timestamp: serverTimestamp()
      });
    } catch (e) { console.error("Failed to write log", e); }
  };

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

    const now = new Date();
    const localDateStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const isToday = targetDate === localDateStr;
    const currentMins = (now.getHours() * 60) + now.getMinutes();

    const dayBookings = appointments
      .filter(b => b.appointmentDate === targetDate)
      .map(b => {
        const d = b.appointmentType.includes('Contact') ? config.times.contactLens : config.times.eyeCheck;
        return { start: toMins(b.appointmentTime), end: toMins(b.appointmentTime) + d };
      });

    for (let current = startMins; current + duration <= endMins; current += duration) {
      const potentialEnd = current + duration;
      
      if (isToday && current <= currentMins) continue;

      const overlapsLunch = isLunchEnabled && (current < lunchEndMins && potentialEnd > lunchStartMins);
      const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));

      if (!overlapsLunch && !isOverlap) {
        slots.push(fromMins(current));
      }
    }
    return slots;
  };

  const handleSendSMS = async () => {
    if (!outboundSMS.trim() || !selectedChatPatient?.phone) return;
    setIsSendingComms(true);
    try {
      const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: selectedChatPatient.phone, body: outboundSMS, isCustomChat: true })
      });
      if (res.ok) {
        await addDoc(collection(db, "messages"), {
          phone: selectedChatPatient.phone,
          patientName: selectedChatPatient.patientName,
          text: outboundSMS,
          direction: 'outbound',
          type: 'sms',
          timestamp: serverTimestamp()
        });
        await writeLog('SMS', selectedChatPatient.patientName, selectedChatPatient.phone, 'Sent', 'Direct Chat Message', new Date().toISOString().split('T')[0], '');
        setOutboundSMS('');
      } else {
         alert("Failed to send SMS via Twilio.");
      }
    } catch (e) { console.error(e); alert("Network error sending SMS."); }
    setIsSendingComms(false);
  };

  const handleSendEmail = async () => {
    if (!emailData.body.trim() || !selectedChatPatient?.email) return;
    setIsSendingComms(true);
    try {
       let attachmentBase64 = null;
       let attachmentName = null;
       if (emailData.attachment) {
          const reader = new FileReader();
          reader.readAsDataURL(emailData.attachment);
          await new Promise((resolve) => {
             reader.onload = () => {
                attachmentBase64 = (reader.result as string).split(',')[1];
                attachmentName = emailData.attachment?.name;
                resolve(null);
             };
          });
       }

       const payload: any = {
        type: "send_email",
        templateId: 7, 
        to_email: selectedChatPatient.email,
        patient_name: selectedChatPatient.patientName.split(' ')[0],
        params: {
          patient_name: selectedChatPatient.patientName.split(' ')[0],
          custom_message: emailData.body,
          subject: emailData.subject // <-- MOVED THIS BACK HERE!
        }
     };
       
       if (attachmentBase64) {
          payload.attachment = [{ name: attachmentName, content: attachmentBase64 }];
       }

       const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
         method: "POST", headers: { "Content-Type": "application/json" },
         body: JSON.stringify(payload)
       });

       if (res.ok) {
         await writeLog('Email', selectedChatPatient.patientName, selectedChatPatient.email, 'Sent', `Direct Email: ${emailData.subject}`, new Date().toISOString().split('T')[0], '');
         
         // NEW: Save the email payload directly into the messages collection so it appears in chat & is searchable!
         await addDoc(collection(db, "messages"), {
            phone: selectedChatPatient.phone || '',
            email: selectedChatPatient.email || '',
            patientName: selectedChatPatient.patientName,
            text: `Subject: ${emailData.subject}\n\n${emailData.body}`,
            attachmentName: attachmentName || null,
            direction: 'outbound',
            type: 'email',
            timestamp: serverTimestamp()
         });

         setEmailData({ subject: '', body: '', attachment: null });
         alert("Email sent successfully!");
       } else {
         alert("Failed to send email via Brevo.");
       }
    } catch(e) { console.error(e); alert("Network error sending email."); }
    setIsSendingComms(false);
  };

  const handleAdminBooking = async () => {
    try {
      const rawPhone = newBooking.phone.trim();
      const formattedPhone = rawPhone ? (rawPhone.startsWith('0') ? `+44${rawPhone.substring(1)}` : rawPhone) : '';
  
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

      const generatedNotes = [
        newBooking.inFullTimeEducation ? "In full-time education" : "",
        newBooking.onBenefits ? "Receiving income-related benefits" : "",
        newBooking.isDiabetic ? "Diabetic" : "",
        newBooking.familyGlaucoma ? "Family history of Glaucoma" : ""
      ].filter(Boolean).join(", ");
  
      const docRef = await addDoc(collection(db, "appointments"), {
        patientName: `${newBooking.firstName} ${newBooking.lastName}`,
        email: newBooking.email,
        phone: formattedPhone,
        dob: newBooking.dob,
        appointmentType: category,
        appointmentDate: selectedDate,
        appointmentTime: newBooking.time,
        source: 'Admin',
        isDiabetic: newBooking.isDiabetic,
        onBenefits: newBooking.onBenefits,
        familyGlaucoma: newBooking.familyGlaucoma,
        inFullTimeEducation: newBooking.inFullTimeEducation,
        notes: generatedNotes,
        createdAt: serverTimestamp()
      });

      const manageLink = `${window.location.origin}/manage/${docRef.id}`;
      const receiptLink = `${window.location.origin}/receipt/${docRef.id}`;
  
      if (newBooking.email) {
        try {
          const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "send_email", templateId: 1, to_email: newBooking.email, patient_name: newBooking.firstName,
              params: { patient_name: newBooking.firstName, appointment_type: category, date: new Date(selectedDate).toLocaleDateString('en-GB'), time: newBooking.time, manage_link: manageLink }
            })
          });
          if (res.ok) await writeLog('Email', newBooking.firstName, newBooking.email, 'Sent', 'Booking Confirmation', selectedDate, newBooking.time);
          else await writeLog('Email', newBooking.firstName, newBooking.email, 'Failed', 'Booking Confirmation', selectedDate, newBooking.time, 'API Error');
        } catch (emailErr) {
          await writeLog('Email', newBooking.firstName, newBooking.email, 'Failed', 'Booking Confirmation', selectedDate, newBooking.time, 'Network Error');
        }
      }
  
      if (formattedPhone && formattedPhone.length > 5) {
        let smsMessage = `Confirmation: ${newBooking.firstName}, your ${newBooking.service} is scheduled for ${new Date(selectedDate).toLocaleDateString('en-GB')} @ ${newBooking.time}.\nOur expert team look forward to providing you with exceptional care.\n\nFor any enquiries, please reply to this message or call 0116 253 2788.\nThe Eye Centre, Leicester`;

        if (!newBooking.email) {
          smsMessage = `Confirmation: ${newBooking.firstName}, your ${newBooking.service} is booked for ${new Date(selectedDate).toLocaleDateString('en-GB')} @ ${newBooking.time}.\n\nTo receive your full digital receipt and manage your booking online, please tap here to securely add your email address: ${receiptLink}`;
        }

        try {
          const smsRes = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: formattedPhone, body: smsMessage })
          });
          if (smsRes.ok) {
            await writeLog('SMS', newBooking.firstName, formattedPhone, 'Sent', 'Booking Confirmation', selectedDate, newBooking.time);
          }
        } catch(e) {
          await writeLog('SMS', newBooking.firstName, formattedPhone, 'Failed', 'Booking Confirmation', selectedDate, newBooking.time, 'Network Error');
        }
      }
  
      setIsBookingModalOpen(false);
      setNewBooking({
        firstName: '', lastName: '', email: '', phone: '', dob: '', service: 'Eye Check', time: '', inFullTimeEducation: false, onBenefits: false, isDiabetic: false, familyGlaucoma: false
      });
      alert("Appointment successfully booked.");
    } catch (err) {
      console.error("Booking Error:", err);
      alert("Error saving booking.");
    }
  };

  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    let newIndex = direction === 'next' ? currentResultIndex + 1 : currentResultIndex - 1;
    if (newIndex >= searchResults.length) newIndex = 0;
    if (newIndex < 0) newIndex = searchResults.length - 1;
    setCurrentResultIndex(newIndex);
    const targetDate = searchResults[newIndex].appointmentDate;
    setSelectedDate(targetDate);
  };

  const isDateClosed = () => {
    const dateObj = new Date(selectedDate);
    const dayOfWeek = dateObj.getDay(); 
    const isWeeklyOff = config.weeklyOff?.includes(dayOfWeek);
    const isManuallyOpened = config.openDates?.includes(selectedDate);
    const isManuallyClosed = closedDates.includes(selectedDate);
    return isManuallyClosed || (isWeeklyOff && !isManuallyOpened);
  };

  const deleteApp = async (bookingData: any) => {
    if (window.confirm("Are you sure you want to cancel this appointment and notify the patient?")) {
      try {
        if (bookingData.email) {
          const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "send_email", templateId: 3, to_email: bookingData.email, patient_name: bookingData.patientName.split(' ')[0],
              params: { patient_name: bookingData.patientName.split(' ')[0], date: new Date(bookingData.appointmentDate).toLocaleDateString('en-GB'), time: bookingData.appointmentTime }
            })
          });
          if (res.ok) await writeLog('Email', bookingData.patientName, bookingData.email, 'Sent', 'Cancellation', bookingData.appointmentDate, bookingData.appointmentTime);
        }

        if (bookingData.phone) {
          const cancelMsg = `Cancellation: ${bookingData.patientName.split(' ')[0]}, your appointment on ${new Date(bookingData.appointmentDate).toLocaleDateString('en-GB')} @ ${bookingData.appointmentTime} has been cancelled. The Eye Centre.`;
          const res = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: bookingData.phone,
              body: cancelMsg,
              cancelSid: bookingData.reminderSid
            })
          });
          if (res.ok) {
            await writeLog('SMS', bookingData.patientName, bookingData.phone, 'Sent', 'Cancellation', bookingData.appointmentDate, bookingData.appointmentTime);
          }
        }

        await deleteDoc(doc(db, "appointments", bookingData.id));
      } catch (err) {
        alert("Failed to delete appointment.");
      }
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const appRef = doc(db, "appointments", id);
      await setDoc(appRef, { status: newStatus }, { merge: true });
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Arrived': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'In Progress': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Visit Complete': return 'bg-green-100 text-green-700 border-green-200';
      case 'FTA': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const updateAppointment = async () => {
    if (!editingApp) return;
    try {
      const rawPhone = editingApp.phone.trim();
      const formattedPhone = rawPhone ? (rawPhone.startsWith('0') ? `+44${rawPhone.substring(1)}` : rawPhone) : '';
  
      const appRef = doc(db, "appointments", editingApp.id);
      
      await setDoc(appRef, {
        patientName: editingApp.patientName,
        email: editingApp.email,
        phone: formattedPhone,
        dob: editingApp.dob,
        appointmentTime: editingApp.appointmentTime,
        appointmentDate: editingApp.appointmentDate,
        notes: editingApp.notes || "" 
      }, { merge: true });
  
      setEditingApp(null);
      alert("Patient details updated successfully.");
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
    newWeeklyOff = newWeeklyOff.includes(dayIndex) ? newWeeklyOff.filter(d => d !== dayIndex) : [...newWeeklyOff, dayIndex];
    const newConfig = { ...config, weeklyOff: newWeeklyOff };
    setConfig(newConfig);
    await setDoc(doc(db, "settings", "clinicConfig"), newConfig, { merge: true });
  };

  const saveConfig = async () => {
    try {
      await setDoc(doc(db, "settings", "clinicConfig"), config);
      alert("Clinic settings saved to database!");
    } catch (err) { alert("Error saving settings."); }
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
  
      const isGridLine = time % config.times.eyeCheck === 0;

      if (booking || isGridLine) {
        const duration = booking 
          ? (booking.appointmentType.includes('Contact') ? config.times.contactLens : config.times.eyeCheck)
          : 0;
        const endTimeStr = booking ? fromMins(time + duration) : '';

        const isHighlighted = searchResults.length > 0 && booking && searchResults[currentResultIndex]?.id === booking.id;
  
        grid.push(
          <div key={timeStr} className={`flex items-start py-3 transition-colors border-b-2 border-slate-100 ${isLunchSlot ? 'bg-orange-50/20' : 'hover:bg-slate-50/50'}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, timeStr)}>
            <div className="w-20 text-xs font-black text-slate-400 tabular-nums mt-3 pl-2">
              {timeStr}
              {isLunchSlot && <span className="block text-[8px] text-orange-400 uppercase font-bold mt-1">Lunch</span>}
            </div>
            <div className="flex-1 px-4">
              {booking ? (
                <div draggable onDragStart={(e) => e.dataTransfer.setData("appointmentId", booking.id)} className={`relative p-4 rounded-xl flex justify-between items-center shadow-sm cursor-move transition-all duration-500 ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-400 border-l-4 border-yellow-500 shadow-lg scale-[1.01] z-10' : 'bg-white ring-1 ring-[#3F9185]/20 border-l-4 border-[#3F9185]'}`}>
                  {isHighlighted && (
                    <div className="absolute -top-3 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-black px-2 py-1 rounded-full shadow-sm animate-bounce z-20">RESULT {currentResultIndex + 1}/{searchResults.length}</div>
                  )}
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-3">
                        <span className="text-[11px] font-black text-[#3F9185] bg-teal-50 px-2.5 py-1 rounded-md tabular-nums border border-[#3F9185]/10">{timeStr} — {endTimeStr}</span>
                        <p className="font-bold text-slate-800 text-base">{booking.patientName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                         <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider ${booking.source === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{booking.source === 'Admin' ? 'Admin' : 'Online'}</span>
                         <select value={booking.status || 'Booked'} onChange={(e) => updateStatus(booking.id, e.target.value)} className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border cursor-pointer outline-none transition-colors appearance-none text-center ${getStatusColor(booking.status || 'Booked')}`} onClick={(e) => e.stopPropagation()}>
                           <option value="Booked">Booked</option><option value="Arrived">Arrived</option><option value="In Progress">In Progress</option><option value="Visit Complete">Completed</option><option value="FTA">FTA</option>
                         </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-1">
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase">DOB:</span>
                        <span className="text-[11px] font-bold text-slate-600">{booking.dob || 'N/A'}</span>
                        <span className="text-[10px] font-medium text-slate-400 border-l border-slate-200 pl-1.5 ml-1">Age: {calculateAge(booking.dob)}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${booking.appointmentType?.includes('Contact') ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{booking.appointmentType || 'Routine Eye Check'}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 ml-1 pt-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">E:</span> {booking.email ? booking.email : <span className="text-orange-400 italic">No email provided</span>}</span>
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><span className="font-black text-[#3F9185]">T:</span> {booking.phone ? booking.phone : <span className="text-orange-400 italic">No phone provided</span>}</span>
                    </div>
                    {booking.notes && (
                      <div className="ml-1 pt-2">
                        <div className="bg-yellow-50/70 border border-yellow-100/50 rounded-lg p-2.5 shadow-sm">
                          <p className="text-[11px] font-medium text-slate-600 leading-snug">
                            <span className="font-black text-yellow-600 uppercase tracking-wider mr-1">Notes:</span> 
                            {booking.notes}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 border-l border-slate-100 pl-4">
                    <button onClick={() => {
                      setSelectedChatPatient(booking);
                      setView('messages');
                    }} className="text-slate-300 hover:text-[#3F9185] p-2 hover:bg-teal-50 rounded-full transition-colors" title="Message Patient"><MessageSquare size={18} /></button>
                    <button onClick={() => setEditingApp(booking)} className="text-slate-300 hover:text-[#3F9185] p-2 hover:bg-teal-50 rounded-full transition-colors" title="Edit"><Settings size={18} /></button>
                    <button onClick={() => deleteApp(booking)} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition-colors" title="Delete"><Trash2 size={18} /></button>
                    <button onClick={() => window.open(`/manage/${booking.id}`, '_blank')} className="text-slate-300 hover:text-blue-500 p-2 hover:bg-blue-50 rounded-full transition-colors" title="Manage Booking"><ExternalLink size={18} /></button>
                  </div>
                </div>
              ) : (
                <div className={`min-h-[5rem] w-full rounded-xl border-2 border-dashed transition-all flex items-center justify-center ${isLunchSlot ? 'border-orange-200/50 bg-orange-50/30' : 'border-slate-200 hover:border-[#3F9185]/30 hover:bg-[#3F9185]/5'}`}>
                   <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest opacity-0 hover:opacity-100 transition-opacity">Available ({config.times.eyeCheck} min)</span>
                </div>
              )}
            </div>
          </div>
        );
      }
    }
    return grid;
  };

  const handlePreviousDay = () => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const handleNextDay = () => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const handleToday = () => {
    const d = new Date();
    const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    setSelectedDate(localDate.toISOString().split('T')[0]);
  };

  // NEW: Refined Unique Patients to allow those with only emails
  const uniquePatientsMap = new Map();
  appointments.forEach(app => {
    const key = app.phone || app.email;
    if (key && !uniquePatientsMap.has(key)) {
      uniquePatientsMap.set(key, app);
    }
  });
  const uniquePatients = Array.from(uniquePatientsMap.values());

  return (
    <div className="min-h-screen p-6 bg-[#f8fafc]">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex justify-between items-center bg-white p-2 rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          <div className="flex gap-2">
            <button onClick={() => setView('diary')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'diary' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <LayoutDashboard size={18} /> Diary
            </button>
            <button onClick={() => setView('messages')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'messages' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <MessageSquare size={18} /> Messages
            </button>
            <button onClick={() => setView('logs')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'logs' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <FileText size={18} /> Logs
            </button>
            <button onClick={() => setView('settings')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${view === 'settings' ? 'bg-[#3F9185] text-white' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Settings size={18} /> Settings
            </button>
          </div>
          <button onClick={() => window.location.href='/admin-login'} className="p-2 text-slate-400 hover:text-red-500">
            <LogOut size={20}/>
          </button>
        </div>

        {/* --- DIARY VIEW --- */}
        {view === 'diary' && (
          <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><CalendarIcon className="text-[#3F9185]" /> Daily Grid</h2>
                <button onClick={() => setIsBookingModalOpen(true)} className="bg-[#3F9185] text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-all shadow-md">+ New Booking</button>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                <button onClick={handlePreviousDay} className="px-3 py-2 bg-white rounded-xl font-bold text-slate-500 hover:text-[#3F9185] hover:shadow-sm transition-all text-xs uppercase">&larr; Prev</button>
                <button onClick={handleToday} className="px-4 py-2 bg-[#3F9185]/10 rounded-xl font-black text-[#3F9185] hover:bg-[#3F9185]/20 transition-all text-xs uppercase">Today</button>
                <button onClick={handleNextDay} className="px-3 py-2 bg-white rounded-xl font-bold text-slate-500 hover:text-[#3F9185] hover:shadow-sm transition-all text-xs uppercase">Next &rarr;</button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-2 bg-transparent font-black text-[#3F9185] outline-none cursor-pointer text-sm" />
              </div>
            </div>

            <div className="bg-white p-2 rounded-2xl border border-slate-100 mb-6 flex items-center justify-between gap-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-3 flex-1 bg-slate-50 p-3 rounded-xl transition-all focus-within:ring-2 focus-within:ring-[#3F9185]/20">
                <span className="text-slate-400">🔍</span>
                <input type="text" placeholder="Search patient name, email, phone..." className="bg-transparent outline-none w-full font-bold text-slate-700 placeholder:font-medium placeholder:text-slate-400 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 font-bold text-xs">CLEAR</button>}
              </div>
              {searchResults.length > 0 && (
                <div className="flex items-center gap-3 bg-slate-800 text-white pl-4 pr-2 py-2 rounded-xl shadow-lg animate-in fade-in slide-in-from-right-4">
                  <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">Match {currentResultIndex + 1} / {searchResults.length}</span>
                  <div className="flex gap-1">
                    <button onClick={() => navigateSearch('prev')} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors">⬆️</button>
                    <button onClick={() => navigateSearch('next')} className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors">⬇️</button>
                  </div>
                </div>
              )}
            </div>

            <div className={`mb-6 p-5 rounded-2xl border flex items-center justify-between transition-all ${isDateClosed() ? 'bg-red-50 border-red-100' : 'bg-[#3F9185]/5 border-[#3F9185]/10'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full animate-pulse ${isDateClosed() ? 'bg-red-500' : 'bg-[#3F9185]'}`}></div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Clinic Status</p>
                  <p className="font-bold text-slate-800">{isDateClosed() ? 'Closed to Patients' : 'Open for Bookings'}</p>
                </div>
              </div>
              <button onClick={() => toggleDayStatus(selectedDate)} className={`px-6 py-2 rounded-xl font-black text-xs uppercase ${isDateClosed() ? 'bg-white text-red-500 border border-red-200 shadow-sm' : 'bg-[#3F9185] text-white hover:opacity-90'}`}>{isDateClosed() ? 'Mark as Open' : 'Mark as Closed'}</button>
            </div>

            <div className="mb-8 p-5 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-500"><Clock size={16} /><span className="text-xs font-bold uppercase">Shift for this specific day:</span></div>
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

        {/* --- NEW MESSAGES VIEW --- */}
        {view === 'messages' && (
          <div className="glass-card rounded-[2.5rem] overflow-hidden shadow-2xl flex h-[calc(100vh-10rem)] min-h-[500px] border border-slate-100">
            {/* LEFT SIDEBAR: Search and Patient List */}
            <div className="w-1/3 bg-slate-50 border-r border-slate-200 flex flex-col">
              
              {/* NEW: Dual Search Area */}
              <div className="p-4 bg-white border-b border-slate-200 space-y-3">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><MessageSquare className="text-[#3F9185]"/> Conversations</h2>
                
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search customers (Name, Email, Phone)..." 
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-xs font-bold text-slate-600"
                    value={patientSearch}
                    onChange={e => { setPatientSearch(e.target.value); setGlobalMessageSearch(''); }}
                  />
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search all messages & emails..." 
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 outline-none focus:border-[#3F9185] text-xs font-bold text-slate-600"
                    value={globalMessageSearch}
                    onChange={e => { setGlobalMessageSearch(e.target.value); setPatientSearch(''); }}
                  />
                </div>
              </div>

              {/* Patient / Message List Rendering */}
              <div className="flex-1 overflow-y-auto">
                {globalMessageSearch.trim() ? (
                  /* Display Global Message Search Results */
                  chatMessages
                    .filter(m => (m.text || '').toLowerCase().includes(globalMessageSearch.toLowerCase()))
                    .map(msg => (
                      <button 
                        key={msg.id}
                        onClick={() => {
                          const patient = uniquePatients.find(p => (p.phone && p.phone === msg.phone) || (p.email && p.email === msg.email));
                          if (patient) {
                            setSelectedChatPatient(patient);
                            setGlobalMessageSearch(''); 
                          }
                        }}
                        className="w-full text-left p-4 border-b border-slate-100 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-black text-[#3F9185] truncate">{msg.patientName || msg.phone || msg.email}</p>
                          {msg.type === 'email' && <Mail size={12} className="text-slate-400" />}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{msg.text}</p>
                        <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                          {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleString('en-GB') : ''}
                        </p>
                      </button>
                    ))
                ) : (
                  /* Display Filtered Patient List */
                  uniquePatients
                    .filter(p => 
                      (p.patientName || '').toLowerCase().includes(patientSearch.toLowerCase()) ||
                      (p.email || '').toLowerCase().includes(patientSearch.toLowerCase()) ||
                      (p.phone || '').toLowerCase().includes(patientSearch.toLowerCase())
                    )
                    .map((patient: any) => (
                      <button 
                        key={patient.phone || patient.email} 
                        onClick={() => setSelectedChatPatient(patient)}
                        className={`w-full text-left p-4 border-b border-slate-100 hover:bg-white transition-colors flex items-center gap-3 ${selectedChatPatient?.id === patient.id ? 'bg-white border-l-4 border-l-[#3F9185]' : ''}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold shrink-0">
                          <User size={20} />
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-bold text-slate-800 text-sm truncate">{patient.patientName}</p>
                          <p className="text-xs text-slate-500 truncate">{patient.phone || patient.email}</p>
                        </div>
                      </button>
                    ))
                )}

                {/* Empty States */}
                {!globalMessageSearch.trim() && uniquePatients.length === 0 && (
                  <p className="p-6 text-center text-slate-400 font-bold text-sm">No patients available.</p>
                )}
                {globalMessageSearch.trim() && chatMessages.filter(m => (m.text || '').toLowerCase().includes(globalMessageSearch.toLowerCase())).length === 0 && (
                  <p className="p-6 text-center text-slate-400 font-bold text-sm">No messages found.</p>
                )}
              </div>
            </div>

            {/* Right Pane - Chat/Email Area */}
            <div className="flex-1 bg-white flex flex-col">
              {selectedChatPatient ? (
                <>
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shadow-sm z-10">
                    <div>
                      <h3 className="text-lg font-black text-slate-800">{selectedChatPatient.patientName}</h3>
                      <p className="text-xs font-bold text-slate-400">{selectedChatPatient.phone} | {selectedChatPatient.email || 'No email'}</p>
                    </div>
                    <div className="flex bg-slate-100 rounded-lg p-1">
                      <button onClick={() => setCommsType('SMS')} className={`px-4 py-2 rounded-md text-xs font-black transition-all ${commsType === 'SMS' ? 'bg-white shadow text-[#3F9185]' : 'text-slate-500'}`}>SMS / Timeline</button>
                      <button onClick={() => setCommsType('Email')} className={`px-4 py-2 rounded-md text-xs font-black transition-all ${commsType === 'Email' ? 'bg-white shadow text-[#3F9185]' : 'text-slate-500'}`}>New Email</button>
                    </div>
                  </div>

                  {commsType === 'SMS' && (
                    // ADDED: overflow-hidden here
                    <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-hidden">
                      <div className="flex-1 p-6 overflow-y-auto space-y-4">
                        <p className="text-center text-xs font-bold text-slate-400 bg-slate-200/50 py-1 px-3 rounded-full w-max mx-auto">This timeline includes two-way SMS and outbound emails.</p>
                        
                        {chatMessages
                          .filter(m => (m.phone && m.phone === selectedChatPatient.phone) || (m.email && m.email === selectedChatPatient.email))
                          .map(msg => (
                          <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] p-4 rounded-2xl shadow-sm ${msg.direction === 'outbound' ? 'bg-[#3F9185] text-white rounded-tr-sm' : 'bg-white text-slate-800 rounded-tl-sm border border-slate-100'}`}>
                              
                              {/* Visual Indicator for Emails + Attachments */}
                              {msg.type === 'email' && (
                                <div className="flex items-center justify-between gap-4 mb-2 pb-2 border-b border-teal-500/30">
                                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                                    <Mail size={14} /> Email Sent
                                  </div>
                                  
                                  {/* NEW: Displays the attachment name if it exists */}
                                  {msg.attachmentName && (
                                    <div className="flex items-center gap-1 bg-black/10 px-2 py-1 rounded-md text-[10px] font-bold truncate max-w-[150px]" title={msg.attachmentName}>
                                      <Paperclip size={12} className="shrink-0" />
                                      <span className="truncate">{msg.attachmentName}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                              <p className={`text-[9px] mt-2 text-right ${msg.direction === 'outbound' ? 'text-teal-100' : 'text-slate-400'}`}>
                                {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'Sending...'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* ADDED: shrink-0 here so it never gets squished off screen */}
                      <div className="p-4 bg-white border-t border-slate-200 flex gap-2 shrink-0">
                        <input 
                          type="text" 
                          placeholder="Type an SMS message..." 
                          className="flex-1 p-4 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#3F9185] text-sm font-medium"
                          value={outboundSMS}
                          onChange={e => setOutboundSMS(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSendSMS()}
                        />
                        <button onClick={handleSendSMS} disabled={isSendingComms || !outboundSMS} className="p-4 bg-[#3F9185] text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center">
                          <Send size={20} />
                        </button>
                      </div>
                    </div>
                  )}

                  {commsType === 'Email' && (
                    <div className="flex-1 p-8 overflow-y-auto bg-white">
                      {!selectedChatPatient.email ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                           <Mail size={48} className="opacity-20" />
                           <p className="font-bold">No email address on file for this patient.</p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-w-2xl mx-auto">
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Subject / Header</label>
                            <input 
                              type="text" placeholder="e.g. Your requested documentation" 
                              className="w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border border-transparent focus:border-[#3F9185] text-sm font-bold"
                              value={emailData.subject} onChange={e => setEmailData({...emailData, subject: e.target.value})}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Message Body</label>
                            <textarea 
                              placeholder="Dear patient..." 
                              className="w-full p-4 mt-1 rounded-xl bg-slate-50 outline-none border border-transparent focus:border-[#3F9185] h-64 text-sm resize-none"
                              value={emailData.body} onChange={e => setEmailData({...emailData, body: e.target.value})}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-1 block mb-2">Attachments (Optional)</label>
                            <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-[#3F9185] bg-slate-50 cursor-pointer transition-colors w-max">
                               <Paperclip size={18} className="text-slate-400" />
                               <span className="text-sm font-bold text-slate-500">{emailData.attachment ? emailData.attachment.name : 'Select a file to attach'}</span>
                               <input type="file" className="hidden" onChange={e => setEmailData({...emailData, attachment: e.target.files?.[0] || null})} />
                            </label>
                          </div>
                          <button onClick={handleSendEmail} disabled={isSendingComms || !emailData.body} className="w-full py-4 mt-4 bg-[#3F9185] text-white rounded-xl font-black shadow-lg shadow-teal-900/10 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                             {isSendingComms ? 'Sending...' : 'Send Email'} <Send size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <MessageSquare size={64} className="opacity-20 mb-4" />
                  <p className="font-bold text-lg text-slate-400">Select a patient to start messaging</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- LOGS VIEW --- */}
        {view === 'logs' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <FileText className="text-[#3F9185]" /> Communication Logs
              </h2>
            </div>
            <div className="flex gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex-1">
                <input type="text" placeholder="Search by Patient, Phone, or Email..." className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-[#3F9185] text-sm font-medium" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} />
              </div>
              <select className="p-3 rounded-xl border border-slate-200 outline-none text-sm font-bold text-slate-600 bg-white" value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value)}>
                <option value="All">All Types</option><option value="SMS">SMS</option><option value="Email">Email</option>
              </select>
              <select className="p-3 rounded-xl border border-slate-200 outline-none text-sm font-bold text-slate-600 bg-white" value={logStatusFilter} onChange={(e) => setLogStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option><option value="Sent">Sent</option><option value="Failed">Failed</option>
              </select>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Time Sent</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Patient</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Type</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Contact / Destination</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Action Triggered</th>
                      <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {logs.filter(log => logTypeFilter === "All" || log.type === logTypeFilter).filter(log => logStatusFilter === "All" || log.status === logStatusFilter).filter(log => (log.patientName || '').toLowerCase().includes(logSearch.toLowerCase()) || (log.contactInfo || '').toLowerCase().includes(logSearch.toLowerCase())).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-xs font-bold text-slate-500 tabular-nums">{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}</td>
                        <td className="p-4"><p className="font-bold text-slate-800 text-sm">{log.patientName}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Appt: {new Date(log.apptDate).toLocaleDateString('en-GB')} @ {log.apptTime}</p></td>
                        <td className="p-4"><span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${log.type === 'SMS' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>{log.type}</span></td>
                        <td className="p-4 font-medium text-sm text-slate-600">{log.contactInfo}</td>
                        <td className="p-4 font-medium text-sm text-slate-500">{log.action}</td>
                        <td className="p-4 text-right">
                          {log.status === 'Sent' ? <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100"><CheckCircle2 size={14} /> <span className="text-xs font-bold">Sent</span></div> : <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100" title={log.errorMsg}><XCircle size={14} /> <span className="text-xs font-bold">Failed</span></div>}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold italic">No communication logs found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- SETTINGS VIEW --- */}
        {view === 'settings' && (
          <div className="glass-card rounded-[2.5rem] p-10 space-y-8">
            <h2 className="text-2xl font-black text-slate-800">Clinic Settings</h2>
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

      {editingApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full animate-in zoom-in-95 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-slate-800">Edit Patient Details</h3>
            <div className="space-y-4">
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.patientName} onChange={e => setEditingApp({...editingApp, patientName: e.target.value})} placeholder="Name" />
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.email} onChange={e => setEditingApp({...editingApp, email: e.target.value})} placeholder="Email" />
              <input className="w-full p-4 bg-slate-50 rounded-xl outline-none" value={editingApp.phone} onChange={e => setEditingApp({...editingApp, phone: e.target.value})} placeholder="Phone" />
              <textarea className="w-full p-4 bg-slate-50 rounded-xl outline-none resize-none h-24 text-sm" value={editingApp.notes || ''} onChange={e => setEditingApp({...editingApp, notes: e.target.value})} placeholder="Admin Notes (Internal only)" />
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setEditingApp(null)} className="flex-1 p-4 font-bold text-slate-400">Cancel</button>
              <button onClick={updateAppointment} className="flex-1 p-4 font-black bg-[#3F9185] text-white rounded-xl">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-slate-800 mb-6">Direct Admin Booking</h2>
            
            <div className="space-y-4">
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

              <div className="grid grid-cols-2 gap-4">
                <input placeholder="First Name" className="p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, firstName: e.target.value})} />
                <input placeholder="Last Name" className="p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, lastName: e.target.value})} />
              </div>
              
              <div className="col-span-full space-y-2">
                <input 
                  type="email"
                  placeholder="Email Address (Optional - skip if struggling over phone)" 
                  className="w-full p-4 bg-slate-50 rounded-xl outline-none placeholder:text-slate-400" 
                  value={newBooking.email}
                  onChange={e => setNewBooking({...newBooking, email: e.target.value.toLowerCase()})} 
                />
              </div>
              
              <input placeholder="Phone (Optional if Email provided)" className="w-full p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, phone: e.target.value})} />
              
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date of Birth</label>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-xl outline-none" onChange={e => setNewBooking({...newBooking, dob: e.target.value})} />
              </div>
              
              <select className="w-full p-4 bg-slate-50 rounded-xl outline-none font-bold" value={newBooking.service} onChange={e => setNewBooking({...newBooking, service: e.target.value})}>
                <option value="Eye Check">Eye Check</option>
                <option value="Contact Lens Check">Contact Lens Check</option>
              </select>

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

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Available Times</label>
                {isDateClosed() || calculateSlotsForDate(selectedDate).length === 0 ? (
                  <div className="w-full p-6 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-2 text-slate-400">
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
              <button onClick={handleAdminBooking} disabled={!newBooking.time || !newBooking.firstName || (!newBooking.email && !newBooking.phone) || isDateClosed()} className="flex-1 p-4 font-black bg-[#3F9185] text-white rounded-xl shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Confirm Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}