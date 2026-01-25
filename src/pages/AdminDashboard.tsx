import { useState } from 'react';
import { Calendar as CalendarIcon, Clock, Trash2, Edit3, LogOut } from 'lucide-react';

// Define what an Appointment looks like
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
];

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>(MOCK_DATA);

  // Fix: Explicitly define 'id' as a number
  const deleteAppointment = (id: number) => {
    setAppointments(appointments.filter(app => app.id !== id));
  };

  const handleLogout = () => {
    // This clears the auth state by refreshing to the login page
    window.location.href = '/admin-login';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Practice Diary</h1>
            <p className="text-slate-500 mt-1">Manage your upcoming patient appointments</p>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all font-medium"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>

        <div className="grid gap-4">
          {appointments.length > 0 ? (
            appointments.map((app) => (
              <div 
                key={app.id} 
                className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-6">
                  <div className="bg-blue-50 p-4 rounded-2xl text-blue-600">
                    <CalendarIcon size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{app.name}</h3>
                    <div className="flex gap-4 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-md">
                        <Clock size={14}/> {app.time}
                      </span>
                      <span className="font-semibold text-blue-600 self-center">
                        {app.type}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button className="p-3 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                    <Edit3 size={20}/>
                  </button>
                  <button 
                    onClick={() => deleteAppointment(app.id)} 
                    className="p-3 hover:bg-red-50 rounded-xl text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={20}/>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <p className="text-slate-400">No appointments scheduled for today.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}