import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes — large Excel imports (11k+ rows) need this
});

api.interceptors.request.use(cfg => cfg);

api.interceptors.response.use(
  res => res,
  err => {
    const msg = err.response?.data?.error || err.message || 'Network error';
    console.error(`[API ✗] ${err.response?.status||0} ${err.config?.url}:`, msg);
    return Promise.reject(new Error(msg));
  }
);

export default api;
