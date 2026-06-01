import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [worker, setWorker]   = useState(null);   // logged-in worker object
  const [loading, setLoading] = useState(true);   // checking stored token on boot

  // On app start — restore session from HttpOnly cookie (preferred) or localStorage fallback
  useEffect(() => {
    // Try cookie-based auth first (set on login by server, sent automatically)
    api.get('/auth/me')
      .then(r => {
        const w = r.data;
        setWorker(w);
      })
      .catch(() => {
        // Fallback: try localStorage token
        const token = localStorage.getItem('token');
        const saved = localStorage.getItem('worker');
        if (token && saved) {
          try {
            const w = JSON.parse(saved);
            setWorker(w);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            console.log('[Auth] Session restored from localStorage for:', w.name);
          } catch {
            console.log('[Auth] Stored session invalid — clearing');
            localStorage.removeItem('token');
            localStorage.removeItem('worker');
          }
        }
      })
      .finally(() => setLoading(false));
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

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
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
