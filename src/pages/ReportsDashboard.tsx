import { useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Calendar, AlertTriangle, Clock, MousePointerClick, Smartphone, BarChart3, Users } from 'lucide-react';

export default function ReportsDashboard({ appointments }: { appointments: any[] }) {
  const stats = useMemo(() => {
    const total = appointments.length;
    if (total === 0) return null;

    let completed = 0, fta = 0, onlineBookings = 0, adminBookings = 0;
    const leadTimes: number[] = [];
    
    const apptDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const apptHoursCount: Record<string, number> = {};

    const creationDaysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    
    // NEW: Split out creation times by source
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
      if (app.status === 'Completed') completed++;
      if (app.status === 'FTA') fta++;
      
      const isOnline = app.source?.toLowerCase() === 'online';
      if (isOnline) onlineBookings++;
      else adminBookings++;

      if (app.appointmentDate) {
        const dateObj = parseDateSafely(app.appointmentDate);
        if (dateObj && !isNaN(dateObj.getTime())) apptDaysCount[dateObj.getDay()]++;
      }

      if (app.appointmentTime) {
        const hour = app.appointmentTime.split(':')[0];
        apptHoursCount[hour] = (apptHoursCount[hour] || 0) + 1;
      }

      if (app.timestamp && app.appointmentDate) {
         let bDate: Date;
         if (typeof app.timestamp.toDate === 'function') bDate = app.timestamp.toDate();
         else if (app.timestamp.seconds) bDate = new Date(app.timestamp.seconds * 1000);
         else bDate = new Date(app.timestamp);
         
         if (!isNaN(bDate.getTime())) {
            creationDaysCount[bDate.getDay()]++;
            
            // NEW: Track the specific hour based on the source of the booking
            const hour = bDate.getHours();
            if (isOnline) {
                onlineCreationHoursCount[hour] = (onlineCreationHoursCount[hour] || 0) + 1;
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

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Helper function to turn "14" into "2:00 PM"
    const formatHour = (hourIndex: string) => {
        if (hourIndex === "N/A") return "N/A";
        const h = parseInt(hourIndex);
        if (h === 0) return "12:00 AM";
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return "12:00 PM";
        return `${h - 12}:00 PM`;
    };

    const busiestApptDay = Object.keys(apptDaysCount).reduce((a, b) => apptDaysCount[parseInt(a)] > apptDaysCount[parseInt(b)] ? a : b);
    const busiestApptHour = Object.keys(apptHoursCount).length > 0 ? Object.keys(apptHoursCount).reduce((a, b) => apptHoursCount[a] > apptHoursCount[b] ? a : b) + ":00" : "N/A";
    const peakBrowsingDay = Object.keys(creationDaysCount).reduce((a, b) => creationDaysCount[parseInt(a)] > creationDaysCount[parseInt(b)] ? a : b);
    
    // Calculate the two split peaks
    const peakOnlineHourIndex = Object.keys(onlineCreationHoursCount).length > 0 ? Object.keys(onlineCreationHoursCount).reduce((a, b) => onlineCreationHoursCount[parseInt(a)] > onlineCreationHoursCount[parseInt(b)] ? a : b) : "N/A";
    const peakAdminHourIndex = Object.keys(adminCreationHoursCount).length > 0 ? Object.keys(adminCreationHoursCount).reduce((a, b) => adminCreationHoursCount[parseInt(a)] > adminCreationHoursCount[parseInt(b)] ? a : b) : "N/A";

    return {
      total,
      completedRate: Math.round((completed / total) * 100) || 0,
      ftaRate: Math.round((fta / total) * 100) || 0,
      onlineRate: Math.round((onlineBookings / total) * 100) || 0,
      
      busiestApptDay: dayNames[parseInt(busiestApptDay)],
      busiestApptHour,
      peakBrowsingDay: dayNames[parseInt(peakBrowsingDay)],
      
      // The new split metrics
      peakOnlineHour: formatHour(peakOnlineHourIndex),
      peakAdminHour: formatHour(peakAdminHourIndex),
      
      avgLeadTime: leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0,
      sameDayRate: leadTimes.length ? Math.round((sameDay / leadTimes.length) * 100) : 0,
      plannerRate: leadTimes.length ? Math.round((overTwoWeeks / leadTimes.length) * 100) : 0,
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
    doc.text(`Commercial Intelligence & Operations Report • Generated: ${today}`, 14, 32);

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

    doc.setFontSize(14);
    doc.text("2. Booking Source & Marketing Insights", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Behaviour Trend', 'Time', 'Operational Insight']],
      body: [
        ['Peak Online Booking Time', stats.peakOnlineHour, 'When patients book from home. Best time for digital marketing.'],
        ['Peak Reception Booking Time', stats.peakAdminHour, 'When your phones are busiest. Ensure maximum reception cover.'],
        ['Peak Action Day (All)', stats.peakBrowsingDay, 'The busiest overall day for new appointments entering the diary.'],
        ['Average Booking Window', `${stats.avgLeadTime} Days`, 'How far in advance the average patient plans their visit.'],
        ['Spontaneous Bookers', `${stats.sameDayRate}%`, 'Percentage of patients booking a same-day or next-day appointment.'],
        ['Long-Term Planners', `${stats.plannerRate}%`, 'Patients booking 14+ days out (Statistically higher risk of FTA).']
      ],
      theme: 'striped',
      headStyles: { fillColor: [44, 62, 80] } 
    });

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

      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><MousePointerClick size={18}/> Booking Source Comparison</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-sm flex flex-col items-center text-center text-white relative overflow-hidden">
            <div className="absolute top-4 right-4 text-slate-600"><Smartphone size={32} /></div>
            <p className="text-sm font-bold text-teal-400 mb-1 uppercase tracking-wider">Peak Online Bookings</p>
            <p className="text-4xl font-black mb-2">{stats.peakOnlineHour}</p>
            <p className="text-sm text-slate-300">When patients browse independently.</p>
          </div>

          <div className="bg-slate-800 p-6 rounded-2xl shadow-sm flex flex-col items-center text-center text-white relative overflow-hidden">
             <div className="absolute top-4 right-4 text-slate-600"><Users size={32} /></div>
            <p className="text-sm font-bold text-blue-400 mb-1 uppercase tracking-wider">Peak Reception Phone Volume</p>
            <p className="text-4xl font-black mb-2">{stats.peakAdminHour}</p>
            <p className="text-sm text-slate-300">When your admin staff are busiest taking bookings.</p>
          </div>
        </div>
      </div>

    </div>
  );
}