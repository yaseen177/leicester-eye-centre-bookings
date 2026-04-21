import { useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Calendar, AlertTriangle, TrendingDown, PieChart, Activity, BarChart3 } from 'lucide-react';

export default function ReportsDashboard({ appointments }: { appointments: any[] }) {
  const stats = useMemo(() => {
    const total = appointments.length;
    if (total === 0) return null;

    let completed = 0, fta = 0, cancelled = 0, onlineBookings = 0, adminBookings = 0;
    let repeatBookings = 0, nhsCount = 0, privateCount = 0;
    let minors = 0, adults = 0, seniors = 0;
    
    const leadTimes: number[] = [];
    const patientIdentifiers = new Set();
    
    const apptDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const apptHoursCount: Record<string, number> = {};
    const ftaDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const uniqueClinicDates = new Set(); 

    const creationDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const onlineCreationHoursCount: Record<number, number> = {};
    const adminCreationHoursCount: Record<number, number> = {};

    let sameDay = 0, underAWeek = 0, overTwoWeeks = 0;

    const parseDateSafely = (dateStr: string) => {
      if (!dateStr) return null;
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (parts[2].length === 4) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return new Date(dateStr);
    };

    appointments.forEach(app => {
      // 1. Status & Leakage
      if (app.status === 'Completed') completed++;
      if (app.status === 'FTA') fta++;
      if (app.status === 'Cancelled' || app.status === 'Canceled') cancelled++;
      
      // 2. Loyalty Engine
      const identifier = app.email || app.phone || app.patientName;
      if (identifier) {
          if (patientIdentifiers.has(identifier)) repeatBookings++;
          else patientIdentifiers.add(identifier);
      }

      // 3. Financial Profiling (NHS Bug Fix: Exact Service Name Matching)
      const serviceName = app.service || '';
      if (serviceName !== 'Eye Check Private' && serviceName !== 'Contact Lens Check') {
          nhsCount++;
      } else {
          privateCount++;
      }

      if (app.dob) {
         const birthDate = parseDateSafely(app.dob);
         if (birthDate && !isNaN(birthDate.getTime())) {
            const age = Math.floor((new Date().getTime() - birthDate.getTime()) / 31557600000);
            if (age >= 0 && age < 16) minors++;
            else if (age >= 16 && age < 60) adults++;
            else if (age >= 60 && age < 120) seniors++;
         }
      }

      // 4. Digital Adoption
      const sourceStr = (app.source || app.bookingSource || '').toLowerCase();
      const isOnline = sourceStr === 'online' || sourceStr === 'website' || sourceStr === 'web';
      if (isOnline) onlineBookings++;
      else adminBookings++;

      // 5. Appointment Logistics
      if (app.appointmentDate) {
        uniqueClinicDates.add(app.appointmentDate); 
        const dateObj = parseDateSafely(app.appointmentDate);
        if (dateObj && !isNaN(dateObj.getTime())) {
            apptDaysCount[dateObj.getDay()]++;
            if (app.status === 'FTA') ftaDaysCount[dateObj.getDay()]++;
        }
      }

      if (app.appointmentTime) {
        const hour = app.appointmentTime.split(':')[0];
        apptHoursCount[hour] = (apptHoursCount[hour] || 0) + 1;
      }

      // 6. Aggressive Timestamp Hunter
      const rawCreationTime = app.timestamp || app.createdAt || app.created_at || app.dateBooked;
      if (rawCreationTime && app.appointmentDate) {
         let bDate: Date | null = null;
         try {
             if (typeof rawCreationTime.toDate === 'function') bDate = rawCreationTime.toDate();
             else if (rawCreationTime.seconds) bDate = new Date(rawCreationTime.seconds * 1000);
             else bDate = new Date(rawCreationTime);
         } catch(e) {}
         
         if (bDate && !isNaN(bDate.getTime())) {
            creationDaysCount[bDate.getDay()]++;
            
            const hour = bDate.getHours();
            if (isOnline) onlineCreationHoursCount[hour] = (onlineCreationHoursCount[hour] || 0) + 1;
            else adminCreationHoursCount[hour] = (adminCreationHoursCount[hour] || 0) + 1;

            const aDate = parseDateSafely(app.appointmentDate);
            if (aDate && !isNaN(aDate.getTime())) {
               aDate.setHours(0,0,0,0);
               const creationDateOnly = new Date(bDate.getTime());
               creationDateOnly.setHours(0,0,0,0);
               
               const diffDays = Math.round((aDate.getTime() - creationDateOnly.getTime()) / (1000 * 60 * 60 * 24));
               
               if (diffDays >= 0 && diffDays < 365) {
                 leadTimes.push(diffDays);
                 if (diffDays <= 1) sameDay++;
                 else if (diffDays <= 7) underAWeek++;
                 else if (diffDays > 14) overTwoWeeks++;
               }
            }
         }
      }
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const getPeak = (record: Record<string | number, number>): string => {
       let peak = "N/A"; let max = 0;
       Object.entries(record).forEach(([key, count]) => { if (count > max) { max = count; peak = key; }});
       return max === 0 ? "N/A" : peak;
    };

    const formatHour = (hourIndex: string) => {
        if (hourIndex === "N/A") return "Insufficient Data";
        const h = parseInt(hourIndex);
        if (h === 0) return "12:00 AM";
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return "12:00 PM";
        return `${h - 12}:00 PM`;
    };

    const totalAgeTracked = minors + adults + seniors;
    
    // NEW: Hourly Array for the Bar Graph (0 to 23 hours)
    const onlineHourlyArray = Array.from({ length: 24 }, (_, i) => onlineCreationHoursCount[i] || 0);
    const maxOnlineHour = Math.max(...onlineHourlyArray, 1); // Ensures we don't divide by zero if empty

    return {
      total,
      completedRate: Math.round((completed / total) * 100) || 0,
      ftaRate: Math.round((fta / total) * 100) || 0,
      cancelledRate: Math.round((cancelled / total) * 100) || 0,
      leakageRate: Math.round(((fta + cancelled) / total) * 100) || 0,
      
      loyaltyRate: Math.round((repeatBookings / total) * 100) || 0,
      onlineRate: Math.round((onlineBookings / total) * 100) || 0,
      
      nhsRate: Math.round((nhsCount / total) * 100) || 0,
      privateRate: Math.round((privateCount / total) * 100) || 0,
      minorRate: totalAgeTracked ? Math.round((minors / totalAgeTracked) * 100) : 0,
      adultRate: totalAgeTracked ? Math.round((adults / totalAgeTracked) * 100) : 0,
      seniorRate: totalAgeTracked ? Math.round((seniors / totalAgeTracked) * 100) : 0,
      
      avgPatientsPerDay: uniqueClinicDates.size > 0 ? Math.round(total / uniqueClinicDates.size) : 0,

      busiestApptDay: getPeak(apptDaysCount) !== "N/A" ? dayNames[parseInt(getPeak(apptDaysCount))] : "N/A",
      busiestApptHour: getPeak(apptHoursCount) !== "N/A" ? getPeak(apptHoursCount) + ":00" : "N/A",
      worstFtaDay: getPeak(ftaDaysCount) !== "N/A" ? dayNames[parseInt(getPeak(ftaDaysCount))] : "N/A",
      
      peakBrowsingDay: getPeak(creationDaysCount) !== "N/A" ? dayNames[parseInt(getPeak(creationDaysCount))] : "Insufficient Data",
      peakOnlineHour: formatHour(getPeak(onlineCreationHoursCount)),
      peakAdminHour: formatHour(getPeak(adminCreationHoursCount)),
      
      avgLeadTime: leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0,
      sameDayRate: leadTimes.length ? Math.round((sameDay / leadTimes.length) * 100) : 0,
      plannerRate: leadTimes.length ? Math.round((overTwoWeeks / leadTimes.length) * 100) : 0,
      
      // For Graph
      onlineHourlyArray,
      maxOnlineHour
    };
  }, [appointments]);

  const generatePDF = () => {
    if (!stats) return;
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString('en-GB');

    doc.setFillColor(63, 145, 133); 
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("The Eye Centre", 14, 22);
    doc.setFontSize(11);
    doc.text(`Comprehensive Commercial & Patient Report • Generated: ${today}`, 14, 32);

    // SECTION 1: LEAKAGE & ACQUISITION
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("1. Revenue Integrity & Logistics", 14, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [['Metric', 'Value', 'Business Insight']],
      body: [
        ['Total Diary Leakage', `${stats.leakageRate}%`, 'Combined total of all Cancellations and FTAs.'],
        ['Highest FTA Risk Day', stats.worstFtaDay, 'Patients are most likely to no-show on this day. Consider deposits.'],
        ['Busiest Day of Week', stats.busiestApptDay, 'Ensure maximum reception cover. Restrict staff annual leave.'],
        ['Average Daily Density', `${stats.avgPatientsPerDay} Patients`, 'Average number of appointments per working day.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [185, 28, 28] } 
    });

    // SECTION 2: PATIENT DEMOGRAPHICS
    doc.setFontSize(14);
    doc.text("2. Patient & Commercial Profiling", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Demographic Segment', 'Percentage', 'Commercial Implication']],
      body: [
        ['NHS Funded Flow', `${stats.nhsRate}%`, 'Predictable, structured base income via GOS forms.'],
        ['Private Patient Flow', `${stats.privateRate}%`, 'Higher margin, immediate cash-flow opportunities.'],
        ['Minors (<16 Years)', `${stats.minorRate}%`, 'Ensure adequate stock of robust, child-friendly frames.'],
        ['Working Adults (16-59)', `${stats.adultRate}%`, 'Prime demographic for premium contact lenses & designer frames.'],
        ['Seniors (60+ Years)', `${stats.seniorRate}%`, 'High likelihood for complex dispensing (varifocals) and frequent visits.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [63, 145, 133] }
    });

    // SECTION 3: DIGITAL MARKETING & ACQUISITION (NEW!)
    doc.setFontSize(14);
    doc.text("3. Digital Marketing Strategy & Action Plan", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Behaviour Trend', 'Data Target', 'Actionable Marketing Strategy']],
      body: [
        ['Digital Ad Schedule Target', `${stats.peakBrowsingDay} at ${stats.peakOnlineHour}`, 'Turn ON heavy Google/Meta Ad budgets during this specific window.'],
        ['Digital Adoption Rate', `${stats.onlineRate}%`, 'Percentage of bookings made self-service online vs reception calls.'],
        ['Patient Loyalty Rate', `${stats.loyaltyRate}%`, 'Run retention campaigns if this drops below 60%.'],
        ['Spontaneous Bookers', `${stats.sameDayRate}%`, 'Percentage of patients booking a same-day or next-day appointment.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] } // Eye-catching Indigo for Marketing
    });

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("CONFIDENTIAL - Internal Practice Owner Use Only", 14, 285);

    // NEW PDF LOGIC: Open directly in a new tab instead of downloading!
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    window.open(blobUrl, '_blank');
  };

  if (!stats) return <div className="p-8 text-center text-slate-500 font-bold">Awaiting Booking Data...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-in fade-in pb-20">
      {/* HEADER */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Commercial Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Live business intelligence generated from {stats.total} patient records.</p>
        </div>
        <button onClick={generatePDF} className="bg-[#3F9185] hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
          <FileText size={18} />
          View PDF Report
        </button>
      </div>
      
      {/* ROW 1: REVENUE INTEGRITY & DENSITY */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><TrendingDown size={18}/> Revenue Integrity & Logistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-3"><AlertTriangle size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.leakageRate}%</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Total Diary Leakage</p>
            <p className="text-xs text-slate-400 mt-1">({stats.ftaRate}% FTA + {stats.cancelledRate}% Cxl)</p>
          </div>
          
          <div className="bg-slate-800 p-5 rounded-2xl shadow-sm flex flex-col items-center text-center text-white">
            <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mb-3"><AlertTriangle size={24} /></div>
            <p className="text-3xl font-black">{stats.worstFtaDay}</p>
            <p className="text-sm font-bold mt-1 text-red-200">Highest FTA Risk Day</p>
            <p className="text-xs text-slate-400 mt-1">Consider taking deposits</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-3"><Calendar size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.busiestApptDay}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Busiest Clinic Day</p>
            <p className="text-xs text-slate-400 mt-1">Max floor staff required</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center border-b-4 border-b-emerald-500">
             <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3"><Activity size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.avgPatientsPerDay}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Daily Clinic Density</p>
            <p className="text-xs text-slate-400 mt-1">Average patients per day</p>
          </div>
        </div>
      </div>

      {/* ROW 2: DIGITAL MARKETING HEATMAP (NEW GRAPH) */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><BarChart3 size={18}/> Digital Marketing: Website Booking Heatmap</h2>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
           <div className="flex justify-between items-start mb-6">
              <div>
                 <p className="font-bold text-slate-800">Online Booking Frequency by Hour (24h)</p>
                 <p className="text-sm text-slate-500">Focus your Google/Facebook Ad budgets around the highest peaks shown below.</p>
              </div>
              <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm">
                 Target Window: {stats.peakBrowsingDay}s at {stats.peakOnlineHour}
              </div>
           </div>
           
           <div className="flex items-end h-40 gap-1 md:gap-2 border-b-2 border-slate-100 pb-2 relative">
              {stats.onlineHourlyArray.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                     <div 
                        className={`w-full rounded-t-sm transition-all duration-500 relative cursor-pointer ${val === stats.maxOnlineHour ? 'bg-indigo-500' : 'bg-teal-100 group-hover:bg-teal-400'}`} 
                        style={{ height: `${(val / stats.maxOnlineHour) * 100}%`, minHeight: val > 0 ? '4px' : '0' }}
                     >
                        {/* Tooltip bubble on hover */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                           {val} Bookings
                           <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                        </div>
                     </div>
                     <span className="text-[10px] md:text-xs text-slate-400 mt-2 font-bold">{i}h</span>
                  </div>
              ))}
           </div>
        </div>
      </div>

      {/* ROW 3: PATIENT DEMOGRAPHICS */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><PieChart size={18}/> Commercial Patient Profiling</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl flex flex-col items-center text-center lg:col-span-1">
             <p className="text-sm font-bold text-indigo-800 mb-1">NHS Split</p>
             <p className="text-3xl font-black text-indigo-900">{stats.nhsRate}%</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl flex flex-col items-center text-center lg:col-span-1">
             <p className="text-sm font-bold text-indigo-800 mb-1">Private Split</p>
             <p className="text-3xl font-black text-indigo-900">{stats.privateRate}%</p>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col items-center text-center lg:col-span-1 shadow-sm">
             <p className="text-sm font-bold text-slate-500 mb-1">Minors (&lt;16)</p>
             <p className="text-3xl font-black text-slate-800">{stats.minorRate}%</p>
          </div>
          <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col items-center text-center lg:col-span-1 shadow-sm">
             <p className="text-sm font-bold text-slate-500 mb-1">Adults (16-59)</p>
             <p className="text-3xl font-black text-slate-800">{stats.adultRate}%</p>
          </div>
          <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col items-center text-center lg:col-span-1 shadow-sm">
             <p className="text-sm font-bold text-slate-500 mb-1">Seniors (60+)</p>
             <p className="text-3xl font-black text-slate-800">{stats.seniorRate}%</p>
          </div>
        </div>
      </div>

    </div>
  );
}