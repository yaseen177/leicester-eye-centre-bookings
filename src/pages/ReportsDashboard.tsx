import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Calendar, AlertTriangle, RefreshCcw, TrendingDown, PieChart, Activity, BarChart3, Clock } from 'lucide-react';

export default function ReportsDashboard({ appointments }: { appointments: any[] }) {
  const [selectedDay, setSelectedDay] = useState<string>('All');

  const stats = useMemo(() => {
    const total = appointments.length;
    if (total === 0) return null;

    let completed = 0, fta = 0, cancelled = 0, onlineBookings = 0, adminBookings = 0;
    let repeatBookings = 0, nhsCount = 0, privateCount = 0;
    let minors = 0, adults = 0, seniors = 0;
    
    const leadTimes: number[] = [];
    const patientIdentifiers = new Set();
    const uniqueClinicDates = new Set(); 
    
    const apptDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const apptHoursCount: Record<string, number> = {};
    const ftaDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };

    // Meta-Style Heatmap Engine
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const onlineCreationByDayAndHour: Record<string, number[]> = {
      'All': Array(24).fill(0),
      'Monday': Array(24).fill(0),
      'Tuesday': Array(24).fill(0),
      'Wednesday': Array(24).fill(0),
      'Thursday': Array(24).fill(0),
      'Friday': Array(24).fill(0),
      'Saturday': Array(24).fill(0),
      'Sunday': Array(24).fill(0)
    };

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
      if (app.status === 'Completed') completed++;
      if (app.status === 'FTA') fta++;
      if (app.status === 'Cancelled' || app.status === 'Canceled') cancelled++;
      
      const identifier = app.email || app.phone || app.patientName;
      if (identifier) {
          if (patientIdentifiers.has(identifier)) repeatBookings++;
          else patientIdentifiers.add(identifier);
      }

      // STRICT NHS/PRIVATE FINANCIAL SPLIT (BULLETPROOF VERSION)
      // 1. Grab the service name, force it to lowercase, and strip all accidental spaces
      const rawService = app.service || app.appointmentType || app.type || '';
      const serviceName = rawService.toLowerCase().trim();

      if (serviceName.includes('contact lens')) {
          // Do nothing - exclude from financial pie chart entirely
      } else if (serviceName === 'eye check private' || serviceName.includes('private')) {
          // Catch exact match OR anything that has the word 'private' in it
          privateCount++;
      } else if (serviceName !== '') {
          // Everything else (that isn't completely blank) is NHS
          nhsCount++;
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

      const sourceStr = (app.source || app.bookingSource || '').toLowerCase();
      const isOnline = sourceStr === 'online' || sourceStr === 'website' || sourceStr === 'web';
      if (isOnline) onlineBookings++;
      else adminBookings++;

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

      const rawCreationTime = app.timestamp || app.createdAt || app.created_at || app.dateBooked;
      if (rawCreationTime && app.appointmentDate) {
         let bDate: Date | null = null;
         try {
             if (typeof rawCreationTime.toDate === 'function') bDate = rawCreationTime.toDate();
             else if (rawCreationTime.seconds) bDate = new Date(rawCreationTime.seconds * 1000);
             else bDate = new Date(rawCreationTime);
         } catch(e) {}
         
         if (bDate && !isNaN(bDate.getTime())) {
            const hour = bDate.getHours();
            const bookedDayName = dayNames[bDate.getDay()];

            // Feed the Meta Heatmap Engine
            if (isOnline) {
                onlineCreationByDayAndHour['All'][hour]++;
                onlineCreationByDayAndHour[bookedDayName][hour]++;
            } else {
                adminCreationHoursCount[hour] = (adminCreationHoursCount[hour] || 0) + 1;
            }

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

    const getPeak = (record: Record<string | number, number>): string => {
       let peak = "N/A"; let max = 0;
       Object.entries(record).forEach(([key, count]) => { if (count > max) { max = count; peak = key; }});
       return max === 0 ? "N/A" : peak;
    };

    const formatHour = (hourIndex: string | number) => {
        if (hourIndex === "N/A") return "Insufficient Data";
        const h = typeof hourIndex === 'string' ? parseInt(hourIndex) : hourIndex;
        if (h === 0) return "12:00 AM";
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return "12:00 PM";
        return `${h - 12}:00 PM`;
    };

    const totalAgeTracked = minors + adults + seniors;
    const totalFinancialTracked = nhsCount + privateCount;

    return {
      total,
      completedRate: Math.round((completed / total) * 100) || 0,
      ftaRate: Math.round((fta / total) * 100) || 0,
      cancelledRate: Math.round((cancelled / total) * 100) || 0,
      leakageRate: Math.round(((fta + cancelled) / total) * 100) || 0,
      
      loyaltyRate: Math.round((repeatBookings / total) * 100) || 0,
      onlineRate: Math.round((onlineBookings / total) * 100) || 0,
      
      nhsRate: totalFinancialTracked ? Math.round((nhsCount / totalFinancialTracked) * 100) : 0,
      privateRate: totalFinancialTracked ? Math.round((privateCount / totalFinancialTracked) * 100) : 0,
      
      minorRate: totalAgeTracked ? Math.round((minors / totalAgeTracked) * 100) : 0,
      adultRate: totalAgeTracked ? Math.round((adults / totalAgeTracked) * 100) : 0,
      seniorRate: totalAgeTracked ? Math.round((seniors / totalAgeTracked) * 100) : 0,
      
      avgPatientsPerDay: uniqueClinicDates.size > 0 ? Math.round(total / uniqueClinicDates.size) : 0,

      busiestApptDay: getPeak(apptDaysCount) !== "N/A" ? dayNames[parseInt(getPeak(apptDaysCount))] : "N/A",
      busiestApptHour: getPeak(apptHoursCount) !== "N/A" ? getPeak(apptHoursCount) + ":00" : "N/A",
      worstFtaDay: getPeak(ftaDaysCount) !== "N/A" ? dayNames[parseInt(getPeak(ftaDaysCount))] : "N/A",
      
      peakAdminHour: formatHour(getPeak(adminCreationHoursCount)),
      
      avgLeadTime: leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0,
      sameDayRate: leadTimes.length ? Math.round((sameDay / leadTimes.length) * 100) : 0,
      plannerRate: leadTimes.length ? Math.round((overTwoWeeks / leadTimes.length) * 100) : 0,
      
      onlineCreationByDayAndHour,
      formatHour
    };
  }, [appointments]);

  // Derive active chart data
  const chartData = stats ? stats.onlineCreationByDayAndHour[selectedDay] : Array(24).fill(0);
  const maxChartVal = Math.max(...chartData, 1);
  
  let popHour = 0; let popVal = -1;
  let quietHour = 0; let quietVal = 999999;
  
  chartData.forEach((val, i) => {
      if (val > popVal) { popVal = val; popHour = i; }
      if (val < quietVal) { quietVal = val; quietHour = i; }
  });

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
    doc.text(`Comprehensive Commercial Report • Generated: ${today}`, 14, 32);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("1. Operations & Patient Demographics", 14, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [['Metric', 'Value', 'Insight']],
      body: [
        ['Diary Leakage (FTA+Cxl)', `${stats.leakageRate}%`, 'Percentage of diary lost to failed attendance.'],
        ['Busiest Clinic Day', stats.busiestApptDay, 'Ensure maximum reception cover.'],
        ['NHS Funded Flow', `${stats.nhsRate}%`, 'Predictable base income (Excludes CL Checks).'],
        ['Private Patient Flow', `${stats.privateRate}%`, 'Immediate cash-flow opportunities.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [63, 145, 133] }
    });

    // CUSTOM DRAWN BAR CHART FOR PDF
    doc.setFontSize(14);
    doc.text(`2. Digital Marketing Heatmap (${selectedDay})`, 14, (doc as any).lastAutoTable.finalY + 15);
    
    const chartY = (doc as any).lastAutoTable.finalY + 22;
    const chartHeight = 35;
    const chartWidth = 180;
    const barWidth = chartWidth / 24;
    
    // Background plate
    doc.setFillColor(248, 250, 252); 
    doc.rect(14, chartY, chartWidth, chartHeight, 'F');
    
    // Draw Bars
    for(let i=0; i<24; i++) {
        const val = chartData[i];
        const h = (val / maxChartVal) * chartHeight;
        
        if (val === popVal && val > 0) doc.setFillColor(79, 70, 229); // Highlight peak in Indigo
        else doc.setFillColor(45, 212, 191); // Standard Teal
        
        doc.rect(14 + (i * barWidth), chartY + chartHeight - h, barWidth - 1, h, 'F');
        
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        if (i % 2 === 0) doc.text(`${i}h`, 14 + (i * barWidth), chartY + chartHeight + 4);
    }

    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text(`Most Popular Time: ${stats.formatHour(popHour)} (${popVal} bookings)  |  Quietest Time: ${stats.formatHour(quietHour)}`, 14, chartY + chartHeight + 10);

    doc.setFontSize(14);
    doc.text("3. Consumer Booking Behaviour", 14, chartY + chartHeight + 25);

    autoTable(doc, {
      startY: chartY + chartHeight + 30,
      head: [['Behaviour Trend', 'Data Target', 'Actionable Marketing Strategy']],
      body: [
        ['Digital Adoption Rate', `${stats.onlineRate}%`, 'Bookings made online vs reception calls.'],
        ['Patient Loyalty Rate', `${stats.loyaltyRate}%`, 'Run retention campaigns if this drops.'],
        ['Spontaneous Bookers', `${stats.sameDayRate}%`, 'Bookings for same-day/next-day.'],
        ['Long-Term Planners', `${stats.plannerRate}%`, 'Booked 14+ days out (Higher FTA risk).']
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] } 
    });

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("CONFIDENTIAL - Internal Practice Owner Use Only", 14, 285);

    // OPEN PDF IN NEW TAB (BLOB)
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
      
      {/* ROW 1: DIGITAL MARKETING HEATMAP (META STYLE) */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><BarChart3 size={18}/> Digital Marketing Heatmap (Online Bookings)</h2>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
           
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                 <p className="font-bold text-slate-800">When do your patients book online?</p>
                 <p className="text-sm text-slate-500 mt-1">Target your Google/Meta Ad budgets towards your most popular hours.</p>
              </div>
              
              {/* Day Toggle Buttons */}
              <div className="flex flex-wrap gap-2">
                 {Object.keys(stats.onlineCreationByDayAndHour).map(day => (
                    <button 
                       key={day} 
                       onClick={() => setSelectedDay(day)}
                       className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${selectedDay === day ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                       {day === 'All' ? 'All Days' : day.slice(0,3)}
                    </button>
                 ))}
              </div>
           </div>

           {/* Popularity Insights */}
           <div className="flex gap-4 mb-6">
              <div className="bg-indigo-50 text-indigo-700 px-4 py-3 rounded-xl flex-1 flex items-center gap-3">
                 <div className="bg-indigo-100 p-2 rounded-lg"><TrendingDown className="rotate-180" size={20}/></div>
                 <div>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-70">Most Popular</p>
                    <p className="font-black text-lg">{stats.formatHour(popHour)} <span className="text-sm font-medium">({popVal} bookings)</span></p>
                 </div>
              </div>
              <div className="bg-slate-50 text-slate-600 px-4 py-3 rounded-xl flex-1 flex items-center gap-3 border border-slate-100">
                 <div className="bg-slate-200 p-2 rounded-lg"><Clock size={20}/></div>
                 <div>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-70">Quietest Time</p>
                    <p className="font-black text-lg">{stats.formatHour(quietHour)}</p>
                 </div>
              </div>
           </div>
           
           {/* The Dynamic Bar Chart */}
           <div className="flex items-end h-48 gap-1 md:gap-2 border-b-2 border-slate-100 pb-2 relative">
              {chartData.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                     <div 
                        className={`w-full rounded-t-sm transition-all duration-500 relative cursor-pointer ${val === popVal && val > 0 ? 'bg-indigo-500' : 'bg-teal-100 group-hover:bg-teal-400'}`} 
                        style={{ height: `${(val / maxChartVal) * 100}%`, minHeight: val > 0 ? '4px' : '0' }}
                     >
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

      {/* ROW 2: PATIENT DEMOGRAPHICS (NHS FIXED) */}
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

      {/* ROW 3: REVENUE INTEGRITY */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><TrendingDown size={18}/> Revenue Integrity & Logistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-3"><AlertTriangle size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.leakageRate}%</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Total Diary Leakage</p>
            <p className="text-xs text-slate-400 mt-1">({stats.ftaRate}% FTA + {stats.cancelledRate}% Cxl)</p>
          </div>
          
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center border-b-4 border-b-emerald-500">
             <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3"><Activity size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.avgPatientsPerDay}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Daily Clinic Density</p>
            <p className="text-xs text-slate-400 mt-1">Average patients per day</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-3"><Calendar size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.busiestApptDay}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Busiest Clinic Day</p>
            <p className="text-xs text-slate-400 mt-1">Max floor staff required</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mb-3"><RefreshCcw size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.loyaltyRate}%</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Returning Patients</p>
            <p className="text-xs text-slate-400 mt-1">Driven by loyalty & reminders</p>
          </div>
        </div>
      </div>

    </div>
  );
}