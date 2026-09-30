import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

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
      .catch(async error => {
        // Fallback: try localStorage token
        const token = localStorage.getItem('token');
        if (error.response?.status !== 401) {
          toast.error(error.message, { id: 'session-check' });
          return;
        }
        if (token) {
          try {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            const r = await api.get('/auth/me');
            setWorker(r.data);
          } catch (fallbackError) {
            if (fallbackError.response?.status !== 401) toast.error(fallbackError.message, { id: 'session-check' });
            localStorage.removeItem('token');
            localStorage.removeItem('worker');
            delete api.defaults.headers.common['Authorization'];
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    const { token, worker: w } = r.data;

    localStorage.setItem('token', token);
    localStorage.setItem('worker', JSON.stringify(w));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    setWorker(w);
    return w;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    localStorage.removeItem('token');
    localStorage.removeItem('worker');
    delete api.defaults.headers.common['Authorization'];
    setWorker(null);
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
