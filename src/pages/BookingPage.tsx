import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, setDoc, addDoc, serverTimestamp, onSnapshot, doc} from 'firebase/firestore';

const toMins = (t: string) => { 
  const [h, m] = t.split(':').map(Number); 
  return h * 60 + m; 
};

const fromMins = (m: number) => { 
  const h = Math.floor(m / 60); 
  const mm = m % 60; 
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`; 
};

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState({ 
    start: "09:00", 
    end: "17:00", 
    eyeCheck: 30, 
    contactLens: 20,
    buffer: 0,
    closedDates: [] as string[],
    openDates: [] as string[],
    weeklyOff: [] as number[],
    lunch: { start: "13:00", end: "14:00" },
    dailyOverrides: {} as Record<string, { start: string; end: string }>
  });
  
  const [booking, setBooking] = useState({
    service: '', 
    date: new Date().toISOString().split('T')[0],
    time: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    inFullTimeEducation: false,
    onBenefits: false,
    isDiabetic: false,
    familyGlaucoma: false
  });

  const [hearingForm, setHearingForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    wearsHearingAids: '' as 'Yes' | 'No' | '',
    noticedDecline: '' as 'Yes' | 'No' | '',
    anyTime: false,
    preferences: {
      Monday: { am: false, pm: false, all: false },
      Tuesday: { am: false, pm: false, all: false },
      Wednesday: { am: false, pm: false, all: false },
      Thursday: { am: false, pm: false, all: false },
      Friday: { am: false, pm: false, all: false },
      Saturday: { am: false, pm: false, all: false },
    } as Record<string, { am: boolean, pm: boolean, all: boolean }>,
    notes: ''
  });
  const [formErrors, setFormErrors] = useState({ email: '', phone: '' });

  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, "appointments"), (snap) => {
      setExistingBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const unsubSettings = onSnapshot(doc(db, "settings", "clinicConfig"), (d) => {
      if (d.exists()) {
        const data = d.data();
        setSettings(prev => ({
          ...prev,
          start: data.hours?.start || "09:00",
          end: data.hours?.end || "17:00",
          eyeCheck: Number(data.times?.eyeCheck) || 30,
          contactLens: Number(data.times?.contactLens) || 20,
          closedDates: data.closedDates || [],
          openDates: data.openDates || [],
          weeklyOff: data.weeklyOff || [],
          lunch: data.lunch || prev.lunch
        }));
      }
    });

    return () => {
      unsubBookings();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (existingBookings.length >= 0 && booking.service && booking.service !== 'Hearingcare') {
      const firstAvailable = findFirstAvailableDate();
      if (firstAvailable !== booking.date) {
        setBooking(prev => ({ ...prev, date: firstAvailable }));
      }
    }
  }, [existingBookings, booking.service]);

  const calculateSlotsForDate = (targetDate: string) => {
    const [year, month, day] = targetDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay(); 
  
    const { closedDates, openDates, weeklyOff, dailyOverrides } = settings;
  
    if (closedDates.includes(targetDate)) return [];

    const isStandardDayOff = weeklyOff.includes(dayOfWeek);
    const isManuallyOverriddenToOpen = openDates.includes(targetDate);

    if (isStandardDayOff && !isManuallyOverriddenToOpen) return [];
  
    const dayHours = dailyOverrides?.[targetDate] || settings;
    const clinicStart = toMins(dayHours.start || "09:00");
    const clinicEnd = toMins(dayHours.end || "17:00");

    const lunchConfig = settings.lunch as { start?: string; end?: string; enabled?: boolean } | undefined;
    const isLunchEnabled = lunchConfig?.enabled ?? true;

    const lunchStart = isLunchEnabled ? toMins(lunchConfig?.start || "13:00") : -1;
    const lunchEnd = isLunchEnabled ? toMins(lunchConfig?.end || "14:00") : -1;

    const now = new Date();
    const isToday = targetDate === now.toLocaleDateString('en-CA'); 
    const currentMins = (now.getHours() * 60) + now.getMinutes();
  
    const slots: string[] = [];
    const duration = booking.service === 'Eye Check' ? settings.eyeCheck : settings.contactLens;
  
    const dayBookings = existingBookings
      .filter(b => b.appointmentDate === targetDate)
      .map(b => {
        const d = b.appointmentType.includes('Contact') ? settings.contactLens : settings.eyeCheck;
        return { start: toMins(b.appointmentTime), end: toMins(b.appointmentTime) + d };
      });
  
    // CHANGED HERE: The loop now increments by `duration` instead of `5`. 
    // It also naturally stops before the clinic closes because of the <= clinicEnd check!
    for (let current = clinicStart; current + duration <= clinicEnd; current += duration) {
      const potentialEnd = current + duration;
      
      if (isToday && current <= currentMins) continue;

      if (isLunchEnabled) {
        const overlapsLunch = current < lunchEnd && potentialEnd > lunchStart;
        if (overlapsLunch) continue;
      }
      
      const isOverlap = dayBookings.some(b => (current < b.end && potentialEnd > b.start));

      if (!isOverlap) {
        slots.push(fromMins(current));
      }
    }
    
    return Array.from(new Set(slots)).sort();
};

  const findFirstAvailableDate = () => {
    let checkDate = new Date();
    for (let i = 0; i < 30; i++) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (calculateSlotsForDate(dateStr).length > 0) return dateStr;
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return new Date().toISOString().split('T')[0];
  };

  const getCategory = () => {
    if (booking.service === 'Contact Lens Check') return 'Contact Lens Check';
    const age = calculateAge(booking.dob);
    if (age >= 60) return 'Eye Check Over 60';
    if (age < 16) return 'Eye Check Child';
    if (age >= 16 && age <= 18) return booking.inFullTimeEducation ? 'Eye Check NHS' : 'Eye Check Private';
    if (age >= 19 && age <= 59) {
      if (booking.onBenefits || booking.isDiabetic) return 'Eye Check NHS';
      if (age >= 40 && booking.familyGlaucoma) return 'Eye Check NHS';
    }
    return 'Eye Check Private';
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

  const handleDayToggle = (day: string, time: 'am' | 'pm' | 'all') => {
    setHearingForm(prev => {
        const current = prev.preferences[day];
        let newVal = { ...current };

        if (time === 'all') {
            newVal.all = !current.all;
            if (newVal.all) { newVal.am = false; newVal.pm = false; }
        } else if (time === 'am') {
            newVal.am = !current.am;
            if (newVal.am) newVal.all = false;
        } else if (time === 'pm') {
            newVal.pm = !current.pm;
            if (newVal.pm) newVal.all = false;
        }

        return { ...prev, preferences: { ...prev.preferences, [day]: newVal } };
    });
  };

  const handleHearingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let valid = true;
    let errors = { email: '', phone: '' };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(hearingForm.email)) {
      errors.email = 'Please enter a valid email address';
      valid = false;
    }

    const cleanPhone = hearingForm.phone.replace(/[\s-]/g, '');
    const phoneRegex = /^((\+44)|(0))[1-9]\d{8,9}$/;
    if (!phoneRegex.test(cleanPhone)) {
      errors.phone = 'Please enter a valid UK mobile or landline number';
      valid = false;
    }

    setFormErrors(errors);
    if (!valid) return;

    setLoading(true);
    try {
      // Format the new Hearing Status info for Brevo Template
      let hearingStatusHtml = `<tr><td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Currently wears hearing aids?</td><td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${hearingForm.wearsHearingAids}</td></tr>`;
      
      if (hearingForm.wearsHearingAids === 'No' && hearingForm.noticedDecline) {
        hearingStatusHtml += `<tr><td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Noticed a decline in hearing?</td><td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${hearingForm.noticedDecline}</td></tr>`;
      }

      // Format preferences into a readable string
      let prefsHtml = '';
      
      if (hearingForm.anyTime) {
        prefsHtml = '<tr><td colspan="2" style="padding: 12px 10px; text-align: center; font-weight: bold; color: #3F9185; border-bottom: 1px solid #e2e8f0;">Fully Flexible (Any Day, Any Time)</td></tr>';
      } else {
        Object.entries(hearingForm.preferences).forEach(([day, times]) => {
          let timeStr = '-';
          if (times.all) timeStr = 'All Day';
          else if (times.am && times.pm) timeStr = 'AM & PM';
          else if (times.am) timeStr = 'AM';
          else if (times.pm) timeStr = 'PM';

          if (timeStr !== '-') {
            prefsHtml += `<tr><td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">${day}</td><td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${timeStr}</td></tr>`;
          }
        });
        if (prefsHtml === '') prefsHtml = '<tr><td colspan="2" style="padding: 12px 10px; text-align: center; color: #64748b; border-bottom: 1px solid #e2e8f0;">No specific preference selected</td></tr>';
      }

      // Send to Clinic
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_email",
          templateId: 5, 
          to_email: "enquiries@theeyecentre.com",
          patient_name: "Clinic Team",
          params: {
            patient_name: hearingForm.fullName,
            email: hearingForm.email,
            phone: hearingForm.phone,
            hearing_status: hearingStatusHtml,
            preferences: prefsHtml,
            notes: hearingForm.notes || 'None'
          }
        })
      });

      // Send to Customer
      await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_email",
          templateId: 6, 
          to_email: hearingForm.email.toLowerCase(),
          patient_name: hearingForm.fullName,
          params: {
            patient_name: hearingForm.fullName
          }
        })
      });

      setStep(6);
    } catch (e) {
      console.error("Error:", e);
      alert("Something went wrong sending your enquiry. Please try calling us instead.");
    }
    setLoading(false);
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const cleanPhone = booking.phone.trim();
      const formattedPhone = cleanPhone 
        ? (cleanPhone.startsWith('0') ? `+44${cleanPhone.substring(1)}` : (cleanPhone.startsWith('+') ? cleanPhone : `+44${cleanPhone}`)) 
        : '';

      const generatedNotes = [
        booking.inFullTimeEducation ? "In full-time education" : "",
        booking.onBenefits ? "Receiving income-related benefits" : "",
        booking.isDiabetic ? "Diabetic" : "",
        booking.familyGlaucoma ? "Family history of Glaucoma" : ""
      ].filter(Boolean).join(", ");

      const docRef = await addDoc(collection(db, "appointments"), {
        patientName: `${booking.firstName} ${booking.lastName}`,
        email: booking.email.toLowerCase(),
        phone: formattedPhone, 
        dob: booking.dob,
        appointmentType: getCategory(),
        appointmentDate: booking.date,
        appointmentTime: booking.time,
        notes: generatedNotes,
        createdAt: serverTimestamp(),
        source: 'Online',
      });

      const manageLink = `${window.location.origin}/manage/${docRef.id}`;

      if (booking.email) {
        await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "send_email",
            templateId: 1, 
            to_email: booking.email.toLowerCase(),
            patient_name: booking.firstName,
            params: {
              patient_name: booking.firstName,
              appointment_type: getCategory(),
              date: new Date(booking.date).toLocaleDateString('en-GB'),
              time: booking.time,
              manage_link: manageLink
            }
          })
        }).catch(e => console.error("Email error", e));
      }

      if (formattedPhone && formattedPhone.length > 5) {
        const appointmentDateObj = new Date(`${booking.date}T${booking.time}`);
        const reminderDate = new Date(appointmentDateObj.getTime() - (24 * 60 * 60 * 1000));
        const now = new Date();

        try {
          await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: formattedPhone,
              body: `Confirmation: ${booking.firstName}, your ${booking.service} is scheduled for ${new Date(booking.date).toLocaleDateString('en-GB')} @ ${booking.time}.\nOur expert team look forward to providing you with exceptional care.\n\nFor any enquiries, please call 0116 253 2788.\nThe Eye Centre, Leicester`
            })
          });

          if (reminderDate.getTime() > now.getTime() + (15 * 60 * 1000)) {
            const smsResponse = await fetch("https://twilio.yaseen-hussain18.workers.dev/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: formattedPhone,
                body: `Reminder: ${booking.firstName}, your ${booking.service} is tomorrow @ ${booking.time}.\nIf you need to reschedule, please call us on 0116 253 2788.\nThe Eye Centre, Leicester`,
                reminderTime: reminderDate.toISOString() 
              })
            });

            if (smsResponse.ok) {
              const smsData = await smsResponse.json();
              const sidToSave = smsData.sid || smsData.reminderSid;
              if (sidToSave) {
                await setDoc(docRef, { reminderSid: sidToSave }, { merge: true });
              }
            }
          }
        } catch (smsError) {
          console.error("SMS API Error:", smsError);
        }
      }

      setStep(4);
    } catch (e) {
      console.error("Error:", e);
      alert("Booking saved, but confirmation notifications may have failed.");
      setStep(4);
    }
    setLoading(false);
  };

  const isHearingFormValid = hearingForm.fullName && 
                             hearingForm.email && 
                             hearingForm.phone && 
                             hearingForm.wearsHearingAids !== '' && 
                             (hearingForm.wearsHearingAids === 'Yes' || hearingForm.noticedDecline !== '');
  
  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <header className="text-center mb-8 px-4">
        <div className="mb-4">
          <img src="/logo.png" alt="Leicester Eye Centre" className="h-14 sm:h-20 w-auto mx-auto drop-shadow-sm" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Optical Excellence</p>
          <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 rounded-full mt-1">
            <span className="w-1.5 h-1.5 bg-[#3F9185] rounded-full animate-pulse"></span>
            <span className="text-[9px] font-black text-[#3F9185] uppercase tracking-tighter">Live Availability</span>
          </div>
        </div>
      </header>

      <div className="glass-card rounded-[2.5rem] p-8 shadow-2xl shadow-teal-900/5 border border-white/50 bg-white/80 backdrop-blur-xl">
        
        {/* STEP 1: SERVICE SELECTION */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-slate-800 mb-4">How can we help?</h2>
            {['Eye Check', 'Contact Lens Check', 'Hearingcare'].map(s => (
              <button 
                key={s} 
                onClick={() => { 
                  setBooking({...booking, service: s}); 
                  if (s === 'Hearingcare') {
                    setStep(5);
                  } else {
                    setStep(2);
                  }
                }} 
                className="w-full p-6 text-left border-2 border-slate-50 rounded-2xl hover:border-[#3F9185] bg-white flex justify-between items-center group shadow-sm transition-all hover:shadow-md"
              >
                <span className="font-bold text-lg text-slate-700">{s}</span>
                <ChevronRight className="text-slate-300 group-hover:text-[#3F9185]" />
              </button>
            ))}
          </div>
        )}

        {/* STEP 2: STANDARD CALENDAR */}
        {step === 2 && booking.service !== 'Hearingcare' && (
          <div className="space-y-6 animate-in fade-in">
             <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600" /></button>
                <h2 className="text-xl font-bold text-slate-800">Available Slots</h2>
             </div>
             <div>
               <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Appointment Date</label>
               <input type="date" min={new Date().toISOString().split('T')[0]} value={booking.date} className="w-full p-4 mt-1 rounded-xl bg-slate-50 font-bold text-[#3F9185] border-none focus:ring-2 focus:ring-[#3F9185] outline-none transition-all" onChange={e => setBooking({...booking, date: e.target.value})} />
             </div>
             
             {(() => {
                const slots = calculateSlotsForDate(booking.date);
                const morning = slots.filter(t => parseInt(t.split(':')[0]) < 12);
                const afternoon = slots.filter(t => parseInt(t.split(':')[0]) >= 12);

                if (slots.length === 0) {
                   return <div className="py-10 text-center text-slate-400 font-bold italic">No slots available for this date.</div>;
                }

                return (
                   <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-6">
                      {morning.length > 0 && (
                         <div className="space-y-2">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 ml-1 flex items-center gap-2">
                               <span className="w-1.5 h-1.5 rounded-full bg-orange-300"></span> Morning
                            </h3>
                            <div className="grid grid-cols-3 gap-2">
                               {morning.map(t => (
                                  <button key={t} onClick={() => setBooking({...booking, time: t})} className={`py-3 rounded-xl font-bold border-2 transition-all ${booking.time === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-50 hover:border-[#3F9185]/30'}`}>{t}</button>
                               ))}
                            </div>
                         </div>
                      )}

                      {afternoon.length > 0 && (
                         <div className="space-y-2">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 ml-1 flex items-center gap-2">
                               <span className="w-1.5 h-1.5 rounded-full bg-indigo-300"></span> Afternoon
                            </h3>
                            <div className="grid grid-cols-3 gap-2">
                               {afternoon.map(t => (
                                  <button key={t} onClick={() => setBooking({...booking, time: t})} className={`py-3 rounded-xl font-bold border-2 transition-all ${booking.time === t ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-50 hover:border-[#3F9185]/30'}`}>{t}</button>
                               ))}
                            </div>
                         </div>
                      )}
                   </div>
                );
             })()}

             <button disabled={!booking.time} onClick={() => setStep(3)} className="w-full py-4 rounded-2xl text-white font-black shadow-lg shadow-teal-900/10 disabled:opacity-30 transition-all active:scale-95" style={{ backgroundColor: '#3F9185' }}>Continue</button>
          </div>
        )}

        {/* STEP 3: STANDARD PATIENT DETAILS */}
        {step === 3 && booking.service !== 'Hearingcare' && (
          <div className="space-y-5 animate-in fade-in">
            <h2 className="text-xl font-bold text-slate-800">Patient Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="First Name" className="p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, firstName: e.target.value})} />
              <input placeholder="Last Name" className="p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, lastName: e.target.value})} />
            </div>
            
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 px-1 mt-4">Please provide at least one contact method:</p>
              <input type="email" placeholder="Email Address" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, email: e.target.value})} />
              <input type="tel" placeholder="Mobile Number" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" onChange={e => setBooking({...booking, phone: e.target.value})} />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date of Birth</label>
              <input type="date" className="w-full p-4 mt-1 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-bold text-slate-600" onChange={e => setBooking({...booking, dob: e.target.value})} />
            </div>
            
            {booking.service === 'Eye Check' && booking.dob && (
              <div className="space-y-3 pt-2">
                {calculateAge(booking.dob) >= 16 && calculateAge(booking.dob) <= 18 && (
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                    <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, inFullTimeEducation: e.target.checked})} />
                    <span className="text-sm font-medium text-slate-600">Are you in full-time education?</span>
                  </label>
                )}
                {calculateAge(booking.dob) >= 19 && calculateAge(booking.dob) <= 59 && (
                  <>
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                      <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, onBenefits: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-600">Receiving income-related benefits?</span>
                    </label>
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                      <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, isDiabetic: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-600">Are you diabetic?</span>
                    </label>
                    {calculateAge(booking.dob) >= 40 && (
                      <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-all">
                        <input type="checkbox" className="accent-[#3F9185] w-5 h-5" onChange={e => setBooking({...booking, familyGlaucoma: e.target.checked})} />
                        <span className="text-sm font-medium text-slate-600">Glaucoma in parent or sibling?</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}
            <button 
              onClick={handleFinalSubmit} 
              disabled={loading || !booking.firstName || !booking.lastName || !booking.dob || (!booking.email && !booking.phone)} 
              className="w-full py-4 rounded-2xl font-black text-white shadow-lg flex justify-center items-center transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" 
              style={{ backgroundColor: '#3F9185' }}
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Confirm Appointment'}
            </button>
          </div>
        )}

        {/* STEP 4: STANDARD SUCCESS */}
        {step === 4 && (
          <div className="text-center py-10 space-y-4 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} style={{ color: '#3F9185' }} />
            </div>
            <h2 className="text-3xl font-black text-slate-900">Confirmed!</h2>
            <p className="text-slate-500 font-medium italic">Your slot is {booking.time} on {new Date(booking.date).toLocaleDateString('en-GB')}</p>
            <p className="text-xs font-bold text-[#3F9185] uppercase tracking-tighter">Category: {getCategory()}</p>
            <button onClick={() => window.location.reload()} className="text-[#3F9185] font-black hover:underline underline-offset-4 pt-4">Start Again</button>
          </div>
        )}

        {/* --- STEP 5: NEW HEARINGCARE FORM --- */}
        {step === 5 && (
          <form onSubmit={handleHearingSubmit} className="space-y-6 animate-in fade-in slide-in-from-right">
            <div className="flex items-center gap-2 mb-2">
              <button type="button" onClick={() => setStep(1)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600" /></button>
              <h2 className="text-xl font-bold text-slate-800">Hearingcare Enquiry</h2>
            </div>
            
            <p className="text-sm text-slate-500 px-1 pb-2">
              Our hearingcare diary is not currently live for direct bookings. Please provide your details and availability below, and our team will contact you to arrange an appointment.
            </p>

            <div className="space-y-4">
              <input required placeholder="Full Name" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none focus:ring-2 focus:ring-[#3F9185] font-medium" value={hearingForm.fullName} onChange={e => setHearingForm({...hearingForm, fullName: e.target.value})} />
              
              <div>
                <input required type="email" placeholder="Email Address" className={`w-full p-4 rounded-xl bg-slate-50 border outline-none focus:ring-2 focus:ring-[#3F9185] font-medium ${formErrors.email ? 'border-red-300' : 'border-transparent'}`} value={hearingForm.email} onChange={e => {setHearingForm({...hearingForm, email: e.target.value}); setFormErrors({...formErrors, email: ''});}} />
                {formErrors.email && <p className="text-xs text-red-500 font-bold mt-1 px-1">{formErrors.email}</p>}
              </div>

              <div>
                <input required type="tel" placeholder="Phone Number" className={`w-full p-4 rounded-xl bg-slate-50 border outline-none focus:ring-2 focus:ring-[#3F9185] font-medium ${formErrors.phone ? 'border-red-300' : 'border-transparent'}`} value={hearingForm.phone} onChange={e => {setHearingForm({...hearingForm, phone: e.target.value}); setFormErrors({...formErrors, phone: ''});}} />
                {formErrors.phone && <p className="text-xs text-red-500 font-bold mt-1 px-1">{formErrors.phone}</p>}
              </div>
            </div>

            {/* NEW: Hearing Status Questions */}
            <div className="pt-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1 block mb-3">Do you currently wear hearing aids?</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl cursor-pointer transition-all border-2 ${hearingForm.wearsHearingAids === 'Yes' ? 'border-[#3F9185] bg-teal-50 text-[#3F9185]' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-[#3F9185]/30'}`}>
                  <input type="radio" name="wearsAids" className="hidden" checked={hearingForm.wearsHearingAids === 'Yes'} onChange={() => setHearingForm({...hearingForm, wearsHearingAids: 'Yes'})} />
                  <span className="font-bold text-sm">Yes</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl cursor-pointer transition-all border-2 ${hearingForm.wearsHearingAids === 'No' ? 'border-[#3F9185] bg-teal-50 text-[#3F9185]' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-[#3F9185]/30'}`}>
                  <input type="radio" name="wearsAids" className="hidden" checked={hearingForm.wearsHearingAids === 'No'} onChange={() => setHearingForm({...hearingForm, wearsHearingAids: 'No', noticedDecline: ''})} />
                  <span className="font-bold text-sm">No</span>
                </label>
              </div>
            </div>

            {hearingForm.wearsHearingAids === 'No' && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 block mb-3">Have you noticed a decline in your hearing or feel you may benefit from hearing aids?</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl cursor-pointer transition-all border-2 ${hearingForm.noticedDecline === 'Yes' ? 'border-[#3F9185] bg-teal-50 text-[#3F9185]' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-[#3F9185]/30'}`}>
                    <input type="radio" name="decline" className="hidden" checked={hearingForm.noticedDecline === 'Yes'} onChange={() => setHearingForm({...hearingForm, noticedDecline: 'Yes'})} />
                    <span className="font-bold text-sm">Yes</span>
                  </label>
                  <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl cursor-pointer transition-all border-2 ${hearingForm.noticedDecline === 'No' ? 'border-[#3F9185] bg-teal-50 text-[#3F9185]' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-[#3F9185]/30'}`}>
                    <input type="radio" name="decline" className="hidden" checked={hearingForm.noticedDecline === 'No'} onChange={() => setHearingForm({...hearingForm, noticedDecline: 'No'})} />
                    <span className="font-bold text-sm">No</span>
                  </label>
                </div>
              </div>
            )}

            <div className="pt-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1 block mb-3">Which days and times work best for you?</label>
              
              <label className="flex items-center gap-3 p-4 mb-4 bg-teal-50 border border-[#3F9185]/30 rounded-xl cursor-pointer hover:bg-teal-100 transition-all shadow-sm">
                <input type="checkbox" className="accent-[#3F9185] w-5 h-5" checked={hearingForm.anyTime} onChange={e => setHearingForm({...hearingForm, anyTime: e.target.checked})} />
                <span className="text-sm font-black text-[#3F9185]">I am flexible (Any Day, Any Time)</span>
              </label>

              {!hearingForm.anyTime && (
                <div className="space-y-2 animate-in fade-in">
                  {Object.keys(hearingForm.preferences).map((day) => (
                    <div key={day} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 gap-2">
                      <span className="font-bold text-slate-600 text-sm sm:w-24 pl-1">{day}</span>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button type="button" onClick={() => handleDayToggle(day, 'am')} className={`flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-lg text-xs font-black transition-all border-2 ${hearingForm.preferences[day].am ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-100 hover:border-[#3F9185]/30'}`}>AM</button>
                        
                        <button type="button" onClick={() => handleDayToggle(day, 'pm')} className={`flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-lg text-xs font-black transition-all border-2 ${hearingForm.preferences[day].pm ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-100 hover:border-[#3F9185]/30'}`}>PM</button>

                        <button type="button" onClick={() => handleDayToggle(day, 'all')} className={`flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-lg text-xs font-black transition-all border-2 ${hearingForm.preferences[day].all ? 'bg-[#3F9185] text-white border-[#3F9185]' : 'bg-white text-slate-400 border-slate-100 hover:border-[#3F9185]/30'}`}>All Day</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1 block mb-1">Additional Information (Optional)</label>
              <textarea 
                className="w-full p-4 bg-slate-50 rounded-xl outline-none resize-none h-24 text-sm focus:ring-2 focus:ring-[#3F9185]" 
                placeholder="Any specific concerns or details we should know?"
                value={hearingForm.notes}
                onChange={e => setHearingForm({...hearingForm, notes: e.target.value})}
              />
            </div>

            <button type="submit" disabled={loading || !isHearingFormValid} className="w-full py-4 rounded-2xl text-white font-black shadow-lg shadow-teal-900/10 disabled:opacity-30 transition-all flex items-center justify-center gap-2" style={{ backgroundColor: '#3F9185' }}>
              {loading ? <Loader2 className="animate-spin" /> : 'Send Enquiry'}
            </button>
          </form>
        )}

        {/* STEP 6: HEARINGCARE SUCCESS */}
        {step === 6 && (
          <div className="text-center py-10 space-y-4 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} style={{ color: '#3F9185' }} />
            </div>
            <h2 className="text-3xl font-black text-slate-900">Enquiry Sent!</h2>
            <p className="text-slate-500 font-medium italic">Thank you for your interest in Hearingcare.</p>
            <p className="text-slate-500 text-sm">We have sent a confirmation to your email. Our team will be in touch shortly to arrange your appointment.</p>
            <button onClick={() => window.location.reload()} className="text-[#3F9185] font-black hover:underline underline-offset-4 pt-4">Return Home</button>
          </div>
        )}

      </div>
    </div>
  );
}