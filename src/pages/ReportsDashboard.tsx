import { useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Calendar, AlertTriangle, Clock, Shield } from 'lucide-react';

export default function ReportsDashboard({ appointments }: { appointments: any[] }) {
  const stats = useMemo(() => {
    const total = appointments.length;
    if (total === 0) return null;

    let completed = 0, fta = 0, nhs = 0, diabetic = 0, glaucoma = 0;
    const ages: number[] = [];
    const leadTimes: number[] = [];
    const daysCount: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    const hoursCount: Record<string, number> = {};

    appointments.forEach(app => {
      // 1. Core Status
      if (app.status === 'Completed') completed++;
      if (app.status === 'FTA') fta++;
      
      // 2. Clinical Demographics
      if (app.nhsEligible) nhs++;
      if (app.isDiabetic) diabetic++;
      if (app.glaucomaHistory) glaucoma++;

      // 3. Age calculation
      if (app.dob) {
        const birthDate = new Date(app.dob);
        const age = Math.floor((new Date().getTime() - birthDate.getTime()) / 31557600000);
        if (age > 0 && age < 120) ages.push(age);
      }

      // 4. Logistics (Day & Time)
      if (app.appointmentDate) {
        const dateObj = new Date(app.appointmentDate);
        if (!isNaN(dateObj.getTime())) daysCount[dateObj.getDay()]++;
      }

      if (app.appointmentTime) {
        const hour = app.appointmentTime.split(':')[0];
        hoursCount[hour] = (hoursCount[hour] || 0) + 1;
      }

      // 5. Booking Lead Time (How far in advance they booked)
      if (app.timestamp && app.appointmentDate) {
         const bookedTime = app.timestamp.seconds ? app.timestamp.seconds * 1000 : new Date(app.timestamp).getTime();
         const apptTime = new Date(app.appointmentDate).getTime();
         const diffDays = Math.floor((apptTime - bookedTime) / (1000 * 60 * 60 * 24));
         if (diffDays >= 0 && diffDays < 365) leadTimes.push(diffDays);
      }
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const busiestDayIndex = Object.keys(daysCount).reduce((a, b) => daysCount[parseInt(a)] > daysCount[parseInt(b)] ? a : b);
    
    const busiestHour = Object.keys(hoursCount).length > 0 
      ? Object.keys(hoursCount).reduce((a, b) => hoursCount[a] > hoursCount[b] ? a : b) + ":00"
      : "N/A";

    return {
      total,
      completedRate: Math.round((completed / total) * 100) || 0,
      ftaRate: Math.round((fta / total) * 100) || 0,
      nhsRate: Math.round((nhs / total) * 100) || 0,
      diabeticRate: Math.round((diabetic / total) * 100) || 0,
      glaucomaRate: Math.round((glaucoma / total) * 100) || 0,
      avgAge: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
      avgLeadTime: leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0,
      busiestDay: dayNames[parseInt(busiestDayIndex)],
      busiestHour
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
    doc.text(`Executive Analytics & Insights Report • Generated: ${today}`, 14, 32);

    // Section 1: Financials & Operations
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("1. Operational Performance", 14, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [['Metric', 'Value', 'Business Impact']],
      body: [
        ['Total Processed Bookings', stats.total.toString(), 'Overall volume in the current dataset.'],
        ['Completion Rate', `${stats.completedRate}%`, 'Patients who successfully attended their exam.'],
        ['Fail-To-Attend (FTA)', `${stats.ftaRate}%`, 'Critical metric for unrecoverable lost revenue.'],
        ['Average Lead Time', `${stats.avgLeadTime} Days`, 'Average advance notice for bookings.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [63, 145, 133] }
    });

    // Section 2: Logistics
    doc.setFontSize(14);
    doc.text("2. Clinic Flow & Staffing", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Trend', 'Peak Value', 'Staffing Recommendation']],
      body: [
        ['Busiest Day of Week', stats.busiestDay, 'Ensure maximum reception and optical floor coverage.'],
        ['Busiest Time of Day', stats.busiestHour, 'Avoid scheduling staff lunch breaks during this hour.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [63, 145, 133] }
    });

    // Section 3: Clinical Demographics
    doc.setFontSize(14);
    doc.text("3. Clinical Risk Pool", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Category', 'Percentage', 'Clinical Requirement']],
      body: [
        ['Average Patient Age', `${stats.avgAge} Years`, 'Indicates overall clinic pathology risk.'],
        ['NHS Funded Tests', `${stats.nhsRate}%`, 'Percentage of revenue claimed via GOS forms.'],
        ['Diabetic Patients', `${stats.diabeticRate}%`, 'Requires dilation / strict screening protocols.'],
        ['Glaucoma Risk', `${stats.glaucomaRate}%`, 'Requires visual fields and pressure checks.']
      ],
      theme: 'striped',
      headStyles: { fillColor: [63, 145, 133] }
    });

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("CONFIDENTIAL - Internal Practice Owner Use Only", 14, 285);

    doc.save(`Eye_Centre_Analytics_${today.replace(/\//g, '-')}.pdf`);
  };

  if (!stats) return <div className="p-8 text-center text-slate-500 font-bold">Awaiting Booking Data...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Executive Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Live metrics generated from {stats.total} patient records.</p>
        </div>
        <button onClick={generatePDF} className="bg-[#3F9185] hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
          <FileText size={18} />
          Export PDF Report
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-3"><AlertTriangle size={24} /></div>
          <p className="text-3xl font-black text-slate-800">{stats.ftaRate}%</p>
          <p className="text-sm font-bold text-slate-500 mt-1">FTA Rate</p>
        </div>
        
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-3"><Calendar size={24} /></div>
          <p className="text-3xl font-black text-slate-800">{stats.busiestDay}</p>
          <p className="text-sm font-bold text-slate-500 mt-1">Peak Day</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mb-3"><Clock size={24} /></div>
          <p className="text-3xl font-black text-slate-800">{stats.busiestHour}</p>
          <p className="text-sm font-bold text-slate-500 mt-1">Peak Hour</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center mb-3"><Shield size={24} /></div>
          <p className="text-3xl font-black text-slate-800">{stats.nhsRate}%</p>
          <p className="text-sm font-bold text-slate-500 mt-1">NHS Mix</p>
        </div>
      </div>
    </div>
  );
}