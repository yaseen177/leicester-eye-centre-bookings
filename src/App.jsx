import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <Router>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/admin-login" element={<AdminLogin setAuth={setIsAuthenticated} />} />
          <Route 
            path="/admin-panel-secret" 
            element={isAuthenticated ? <AdminDashboard /> : <Navigate to="/admin-login" />} 
          />
        </Routes>
      </div>
    </Router>
  );
}