import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [worker, setWorker]   = useState(null);   // logged-in worker object
  const [loading, setLoading] = useState(true);   // checking stored token on boot

  // Keep the session token in the server's HttpOnly cookie.
  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('worker');
    delete api.defaults.headers.common['Authorization'];
    api.get('/auth/me').then(r => setWorker(r.data)).catch(error => {
      if (error.response?.status !== 401) toast.error(error.message, { id: 'session-check' });
    }).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    const { worker: w } = r.data;

    localStorage.removeItem('token');
    localStorage.removeItem('worker');

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
