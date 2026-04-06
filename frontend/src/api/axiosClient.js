import axios from 'axios';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  'http://localhost:8000';

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  timeout: 60000,
});

// Request logging
axiosClient.interceptors.request.use(
  (config) => {
    config.metadata = { startTime: new Date() };
    try {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
    console.debug('[HTTP] →', config.method?.toUpperCase(), config.baseURL + config.url);
    return config;
  },
  (error) => {
    console.error('[HTTP:request:error]', error?.message || error);
    return Promise.reject(error);
  }
);

// Response logging and basic error normalization
axiosClient.interceptors.response.use(
  (response) => {
    const end = new Date();
    const start = response.config?.metadata?.startTime || end;
    const ms = end - start;
    console.debug('[HTTP] ←', response.status, response.config.method?.toUpperCase(), response.config.baseURL + response.config.url, `${ms}ms`);
    return response;
  },
  (error) => {
    const cfg = error.config || {};
    const end = new Date();
    const start = cfg.metadata?.startTime || end;
    const ms = end - start;
    const status = error.response?.status;
    const url = (cfg.baseURL || '') + (cfg.url || '');
    console.error('[HTTP] ←', status || 'ERR', cfg.method?.toUpperCase(), url, `${ms}ms`, '-', error.message);

    if (status === 401) {
      try { localStorage.removeItem('access_token'); } catch {}
      // Avoid redirect loops for auth endpoints
      const isAuthPath = (cfg.url || '').includes('/api/auth');
      if (!isAuthPath && typeof window !== 'undefined') {
        const here = window.location.pathname + window.location.search;
        const dest = '/login' + (here && here !== '/login' ? `?from=${encodeURIComponent(here)}` : '');
        window.location.replace(dest);
      }
    }
    const normalized = new Error(error.response?.data?.message || error.message || 'Network error');
    normalized.status = status;
    normalized.data = error.response?.data;
    return Promise.reject(normalized);
  }
);

export default axiosClient;
