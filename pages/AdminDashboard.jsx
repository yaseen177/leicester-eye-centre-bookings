import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Trash2,
  Edit3,
  LogOut,
} from 'lucide-react';

const MOCK_DATA = [
  {
    id: 1,
    name: 'John Doe',
    type: 'Eye Check Private',
    time: '09:00',
    date: '2026-01-26',
  },
  {
    id: 2,
    name: 'Jane Smith',
    type: 'Eye Check Over 60',
    time: '11:30',
    date: '2026-01-26',
  },
];

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState(MOCK_DATA);

  const deleteAppointment = (id) => {
    setAppointments(appointments.filter((app) => app.id !== id));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Practice Diary</h1>
          <p className="text-slate-500">Manage your upcoming appointments</p>
        </div>
        <button
          onClick={() => (window.location.href = '/')}
          className="flex items-center gap-2 text-slate-500 hover:text-red-600"
        >
          <LogOut size={18} /> Logout
        </button>
      </div>

      <div className="grid gap-4">
        {appointments.map((app) => (
          <div
            key={app.id}
            className="bg-white p-6 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-6">
              <div className="bg-blue-50 p-4 rounded-xl text-blue-600">
                <CalendarIcon size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg">{app.name}</h3>
                <div className="flex gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock size={14} /> {app.time}
                  </span>
                  <span className="font-medium text-blue-600">{app.type}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                <Edit3 size={18} />
              </button>
              <button
                onClick={() => deleteAppointment(app.id)}
                className="p-2 hover:bg-red-50 rounded-lg text-red-500"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
