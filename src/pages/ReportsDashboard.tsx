import { useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Calendar, AlertTriangle, Clock, MousePointerClick, Smartphone, BarChart3 } from 'lucide-react';

export default function ReportsDashboard({ appointments }: { appointments: any[] }) {
  const stats = useMemo(() => {
    const total = appointments.length;
    if (total === 0) return null;

    let completed = 0, fta = 0, onlineBookings = 0, adminBookings = 0;
    const leadTimes: number[] = [];
    
    // Appointment Logistics (When is the actual appointment)
    const apptDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const apptHoursCount: Record<string, number> = {};

    // Consumer Behaviour (When did they sit down to book it)
    const creationDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const creationHoursCount: Record<number, number> = {};

    // Booking Window Buckets
    let sameDay = 0, underAWeek = 0, overTwoWeeks = 0;

    appointments.forEach(app => {
      // 1. Core Status
      if (app.status === 'Completed') completed++;
      if (app.status === 'FTA') fta++;
      
      // 2. Digital Adoption (Online vs Admin)
      if (app.source?.toLowerCase() === 'online') onlineBookings++;
      else adminBookings++; // Default to admin if booked over phone/in-person

      // 3. Appointment Logistics (The Clinic Diary)
      if (app.appointmentDate) {
        const dateObj = new Date(app.appointmentDate);
        if (!isNaN(dateObj.getTime())) apptDaysCount[dateObj.getDay()]++;
      }

      if (app.appointmentTime) {
        const hour = app.appointmentTime.split(':')[0];
        apptHoursCount[hour] = (apptHoursCount[hour] || 0) + 1;
      }

      // 4. Consumer Behaviour (The Action of Booking)
      if (app.timestamp) {
         // Handle both Firestore Timestamp objects and standard ISO strings
         const bookedDate = app.timestamp.seconds ? new Date(app.timestamp.seconds * 1000) : new Date(app.timestamp);
         
         if (!isNaN(bookedDate.getTime())) {
            creationDaysCount[bookedDate.getDay()]++;
            const hour = bookedDate.getHours();
            creationHoursCount[hour] = (creationHoursCount[hour] || 0) + 1;

            // 5. Booking Window Calculation
            if (app.appointmentDate) {
               const apptTime = new Date(app.appointmentDate).getTime();
               const diffDays = Math.floor((apptTime - bookedDate.getTime()) / (1000 * 60 * 60 * 24));
               
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
    
    // Calculating Peak Modes
    const busiestApptDay = Object.keys(apptDaysCount).reduce((a, b) => apptDaysCount[parseInt(a)] > apptDaysCount[parseInt(b)] ? a : b);
    const busiestApptHour = Object.keys(apptHoursCount).length > 0 ? Object.keys(apptHoursCount).reduce((a, b) => apptHoursCount[a] > apptHoursCount[b] ? a : b) + ":00" : "N/A";
    
    const peakBrowsingDay = Object.keys(creationDaysCount).reduce((a, b) => creationDaysCount[parseInt(a)] > creationDaysCount[parseInt(b)] ? a : b);
    const peakBrowsingHourIndex = Object.keys(creationHoursCount).length > 0 ? Object.keys(creationHoursCount).reduce((a, b) => creationHoursCount[parseInt(a)] > creationHoursCount[parseInt(b)] ? a : b) : "12";
    
    // Formatting the browsing hour nicely (e.g., 20 -> 8:00 PM)
    const browseHourNum = parseInt(peakBrowsingHourIndex);
    const peakBrowsingHourFormatted = browseHourNum === 0 ? "12:00 AM" : browseHourNum < 12 ? `${browseHourNum}:00 AM` : browseHourNum === 12 ? "12:00 PM" : `${browseHourNum - 12}:00 PM`;

    return {
      total,
      completedRate: Math.round((completed / total) * 100) || 0,
      ftaRate: Math.round((fta / total) * 100) || 0,
      onlineRate: Math.round((onlineBookings / total) * 100) || 0,
      
      busiestApptDay: dayNames[parseInt(busiestApptDay)],
      busiestApptHour,
      
      peakBrowsingDay: dayNames[parseInt(peakBrowsingDay)],
      peakBrowsingHour: peakBrowsingHourFormatted,
      
      avgLeadTime: leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0,
      sameDayRate: Math.round((sameDay / leadTimes.length) * 100) || 0,
      plannerRate: Math.round((overTwoWeeks / leadTimes.length) * 100) || 0,
    };
  }, [appointments]);

  const generatePDF = () => {
    if (!stats) return;
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString('en-GB');

    // Branding Header
    doc.setFillColor(63, 145, 133); 
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("The Eye Centre", 14, 22);
    doc.setFontSize(11);
    doc.text(`Commercial Intelligence & Operations Report • Generated: ${today}`, 14, 32);

    // Section 1: Financials & Operations
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("1. Operational KPI Health", 14, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [['Metric', 'Value', 'Business Impact']],
      body: [
        ['Total Bookings Tracked', stats.total.toString(), 'Overall volume in the current dataset.'],
        ['Completion Rate', `${stats.completedRate}%`, 'Patients who successfully generated clinic revenue.'],
        ['Fail-To-Attend (FTA)', `${stats.ftaRate}%`, 'Critical metric for unrecoverable lost diary time.'],
        ['Digital Adoption Rate', `${stats.onlineRate}%`, 'Percentage of bookings made self-service online vs reception phone calls.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [63, 145, 133] }
    });

    // Section 2: Consumer Behaviour (Marketing)
    doc.setFontSize(14);
    doc.text("2. Consumer Booking Behaviour (Marketing Insights)", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Behaviour Trend', 'Data Insight', 'Marketing Action']],
      body: [
        ['Peak Browsing Day', stats.peakBrowsingDay, 'The exact day customers sit down to browse your website.'],
        ['Peak Browsing Time', stats.peakBrowsingHour, 'Target your Google/Social Media Ads to run heavily during this hour.'],
        ['Average Booking Window', `${stats.avgLeadTime} Days`, 'How far in advance the average patient plans their visit.'],
        ['Spontaneous Bookers', `${stats.sameDayRate}%`, 'Percentage of patients booking a same-day or next-day appointment.'],
        ['Long-Term Planners', `${stats.plannerRate}%`, 'Patients booking 14+ days out (Statistically higher risk of FTA).']
      ],
      theme: 'striped',
      headStyles: { fillColor: [44, 62, 80] } // Darker blue for marketing section
    });

    // Section 3: Logistics
    doc.setFontSize(14);
    doc.text("3. Clinic Floor Logistics", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Clinic Trend', 'Peak Value', 'Staffing Recommendation']],
      body: [
        ['Busiest Day of Week', stats.busiestApptDay, 'Ensure maximum reception and optical floor coverage. Restrict staff annual leave.'],
        ['Busiest Time of Day', stats.busiestApptHour, 'Avoid scheduling staff lunch breaks or admin blocks during this hour.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [63, 145, 133] }
    });

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("CONFIDENTIAL - Internal Practice Owner Use Only", 14, 285);

    doc.save(`Eye_Centre_Commercial_Report_${today.replace(/\//g, '-')}.pdf`);
  };

  if (!stats) return <div className="p-8 text-center text-slate-500 font-bold">Awaiting Booking Data...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Commercial Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Live business intelligence generated from {stats.total} patient records.</p>
        </div>
        <button onClick={generatePDF} className="bg-[#3F9185] hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
          <FileText size={18} />
          Export PDF Report
        </button>
      </div>
      
      {/* ROW 1: Operations */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><BarChart3 size={18}/> Clinic Operations</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-3"><AlertTriangle size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.ftaRate}%</p>
            <p className="text-sm font-bold text-slate-500 mt-1">FTA Rate</p>
          </div>
          
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mb-3"><Smartphone size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.onlineRate}%</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Booked Online</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-3"><Calendar size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.busiestApptDay}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Busiest Clinic Day</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mb-3"><Clock size={24} /></div>
            <p className="text-3xl font-black text-slate-800">{stats.busiestApptHour}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Peak Clinic Hour</p>
          </div>
        </div>
      </div>

      {/* ROW 2: Consumer Behaviour */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><MousePointerClick size={18}/> Consumer Browsing Behaviour</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 p-5 rounded-2xl shadow-sm flex flex-col items-center text-center text-white">
            <p className="text-sm font-bold text-slate-400 mb-1">Peak Website Action Day</p>
            <p className="text-3xl font-black">{stats.peakBrowsingDay}</p>
            <p className="text-xs text-slate-400 mt-2">Customers are most likely to actively book on this day.</p>
          </div>

          <div className="bg-slate-800 p-5 rounded-2xl shadow-sm flex flex-col items-center text-center text-white">
            <p className="text-sm font-bold text-slate-400 mb-1">Peak Browsing Time</p>
            <p className="text-3xl font-black">{stats.peakBrowsingHour}</p>
            <p className="text-xs text-slate-400 mt-2">Target your ad spend heavily during this specific hour.</p>
          </div>

          <div className="bg-slate-800 p-5 rounded-2xl shadow-sm flex flex-col items-center text-center text-white">
            <p className="text-sm font-bold text-slate-400 mb-1">Avg Booking Window</p>
            <p className="text-3xl font-black">{stats.avgLeadTime} Days</p>
            <p className="text-xs text-slate-400 mt-2">{stats.sameDayRate}% book same-day. {stats.plannerRate}% book 2+ weeks out.</p>
          </div>
        </div>
      </div>

    </div>
  );
}