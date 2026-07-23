import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes — large Excel imports (11k+ rows) need this
});

// Once a session-expired redirect has fired, don't let other in-flight
// requests each pop their own duplicate toast/redirect.
let sessionExpiredHandled = false;

api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status || 0;
    const serverMsg = err.response?.data?.error;
    const msg = serverMsg || (status === 0 ? 'Network error — check your connection' : err.message);

    const url = err.config?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/me');

    // A 401 from /auth/me just means "no session yet" — expected on every
    // fresh page load for a logged-out visitor, not a real failure. Skip the
    // console noise for that one case.
    const isExpectedAnonCheck = status === 401 && url.includes('/auth/me');
    if (!isExpectedAnonCheck) console.error(`[API ✗] ${status} ${url}:`, msg);

    // Axios's own err.message is a generic "Request failed with status code
    // 401" — overwrite it with the server's actual reason so every existing
    // `catch(e) { toast.error(e.message) }` call site shows something useful
    // ("Invalid email or password", "Session expired — please log in again", etc).
    err.message = msg;
    if (status === 401 && !isAuthEndpoint && !sessionExpiredHandled) {
      sessionExpiredHandled = true;
      localStorage.removeItem('token');
      localStorage.removeItem('worker');
      delete api.defaults.headers.common['Authorization'];
      toast.error(msg || 'Session expired — please log in again', { id: 'session-expired', duration: 5000 });
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(err);
  }
);

export default api;
