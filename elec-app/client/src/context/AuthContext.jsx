import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [worker, setWorker]   = useState(null);   // logged-in worker object
  const [loading, setLoading] = useState(true);   // checking stored token on boot

  // On app start — restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('token');
    const saved = localStorage.getItem('worker');
    if (token && saved) {
      try {
        const w = JSON.parse(saved);
        setWorker(w);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log('[Auth] Session restored for:', w.name, 'role:', w.role);
      } catch {
        console.log('[Auth] Stored session invalid — clearing');
        localStorage.removeItem('token');
        localStorage.removeItem('worker');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    console.log('[Auth] Logging in:', email);
    const r = await api.post('/auth/login', { email, password });
    const { token, worker: w } = r.data;

    localStorage.setItem('token', token);
    localStorage.setItem('worker', JSON.stringify(w));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    setWorker(w);
    console.log('[Auth] ✅ Logged in as:', w.name, 'role:', w.role, 'permissions:', w.permissions);
    return w;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('worker');
    delete api.defaults.headers.common['Authorization'];
    setWorker(null);
    console.log('[Auth] Logged out');
  };

  // Check if worker can access a feature
  const can = (permission) => worker?.permissions?.includes(permission) ?? false;
  const isRole = (...roles) => roles.includes(worker?.role);

  return (
    <AuthContext.Provider value={{ worker, loading, login, logout, can, isRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
