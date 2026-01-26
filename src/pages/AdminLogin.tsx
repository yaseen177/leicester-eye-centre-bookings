import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

interface AdminLoginProps {
  setAuth: (auth: boolean) => void;
}

export default function AdminLogin({ setAuth }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Authenticate against Firebase users
      await signInWithEmailAndPassword(auth, email, password);
      setAuth(true);
      navigate('/admin-panel-secret');
    } catch (error: any) {
      console.error("Login error:", error.code);
      alert("Access Denied: Invalid staff credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="max-w-md w-full glass-card rounded-[2.5rem] p-10 border-none ring-1 ring-slate-200 shadow-2xl">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <Lock className="text-white" size={28} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Staff Portal</h2>
          <p className="text-slate-500 mt-2 font-medium">Secure access for Leicester Eye Centre</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
            <input 
              type="email" 
              placeholder="Staff Email"
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none transition-all font-medium"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
            <input 
              type="password" 
              placeholder="Secret Password"
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none transition-all font-medium"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-lg hover:bg-indigo-600 shadow-xl shadow-slate-200 transition-all active:scale-[0.98] flex justify-center items-center gap-2 disabled:opacity-70"
          >
            {loading ? <><Loader2 className="animate-spin" /> Authenticating...</> : 'Enter Dashboard'}
          </button>
        </form>
        
        <p className="text-center mt-8 text-xs font-bold text-slate-400 uppercase tracking-widest leading-loose">
          Authorized Personnel Only
        </p>
      </div>
    </div>
  );
}