import { useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  Edit3, 
  LogOut, 
  Users, 
  TrendingUp, 
  Activity 
} from 'lucide-react';

interface Appointment {
  id: number;
  name: string;
  type: string;
  time: string;
  date: string;
}

const MOCK_DATA: Appointment[] = [
  { id: 1, name: 'John Doe', type: 'Eye Check Private', time: '09:00', date: '2026-01-26' },
  { id: 2, name: 'Jane Smith', type: 'Eye Check Over 60', time: '11:30', date: '2026-01-26' },
  { id: 3, name: 'Robert Brown', type: 'Eye Check Child', time: '14:00', date: '2026-01-26' },
];

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>(MOCK_DATA);

  const deleteAppointment = (id: number) => {
    setAppointments(appointments.filter(app => app.id !== id));
  };

  return (
    <div className="min-h-screen p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Top Navigation Bar */}
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Practice Portal</h1>
            <p className="text-slate-500 font-medium">Manage your clinical diary for Leicester Eye Centre</p>
          </div>
          <button 
            onClick={() => window.location.href = '/admin-login'}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={18} /> Exit
          </button>
        </div>

        {/* Stats Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-[2rem] space-y-2">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Users size={24} />
            </div>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">Total Patients</p>
            <p className="text-3xl font-black text-slate-900">{appointments.length}</p>
          </div>
          <div className="glass-card p-6 rounded-[2rem] space-y-2">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">Daily Revenue</p>
            <p className="text-3xl font-black text-slate-900">£120</p>
          </div>
          <div className="glass-card p-6 rounded-[2rem] space-y-2">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
              <Activity size={24} />
            </div>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">Clinic Capacity</p>
            <p className="text-3xl font-black text-slate-900">65%</p>
          </div>
        </div>

        {/* Main Diary Section */}
<div className="glass-card rounded-[2.5rem] overflow-hidden">
  <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white/50">
    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
      <CalendarIcon className="text-indigo-600" size={20} /> Today's Schedule
    </h2>
    <span className="text-xs font-black bg-slate-100 px-3 py-1 rounded-full text-slate-500 uppercase">
      Monday, 26 Jan
    </span>
  </div>

  <div className="divide-y divide-slate-50">
    {appointments.map((app) => (
      <div key={app.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
        <div className="flex items-center gap-6">
          <div className="text-center min-w-[70px] flex flex-col items-center">
            {/* Using the Clock Icon here to satisfy the compiler and look great */}
            <Clock size={16} className="text-indigo-400 mb-1" />
            <p className="text-lg font-black text-slate-900 leading-none">{app.time}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">GMT</p>
          </div>
          <div className="h-12 w-[2px] bg-slate-100 group-hover:bg-indigo-200 transition-colors" />
          <div>
            <h3 className="font-bold text-slate-900 text-lg">{app.name}</h3>
            <span className="inline-flex items-center text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md mt-1">
              {app.type}
            </span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
            <Edit3 size={20} />
          </button>
          <button 
            onClick={() => deleteAppointment(app.id)}
            className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    ))}
  </div>
</div>
      </div>
    </div>
  );
}