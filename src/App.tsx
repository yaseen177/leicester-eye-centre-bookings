import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ManageBooking from './pages/ManageBooking';
import AddEmailPage from './pages/AddEmailPage';
import { trackPageView } from './lib/analytics';

// Fires a GA4 page_view every time the in-app route changes — see
// src/lib/analytics.ts for why this is needed for a single-page app.
function AnalyticsListener() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return null;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check which subdomain the user is currently on
  const hostname = window.location.hostname;
  const isAdminDomain = hostname.startsWith('admin');

  return (
    <Router>
      <AnalyticsListener />
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <Routes>
          
          {/* SMART ROUTING: 
            If they type admin.theeyecentre.com -> Redirect to /admin-login
            If they type book.theeyecentre.com -> Show the Booking Page
          */}
          <Route 
            path="/" 
            element={isAdminDomain ? <Navigate to="/admin-login" /> : <BookingPage />} 
          />

          <Route path="/admin-login" element={<AdminLogin setAuth={setIsAuthenticated} />} />
          
          <Route 
            path="/admin-panel-secret" 
            element={isAuthenticated ? <AdminDashboard /> : <Navigate to="/admin-login" />} 
          />
          
          <Route path="/manage/:id" element={<ManageBooking />} />
          <Route path="/receipt/:id" element={<AddEmailPage />} />
        </Routes>
      </div>
    </Router>
  );
}