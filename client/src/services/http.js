import axios from 'axios';

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

http.interceptors.request.use((config) => {
  try {
    const session = JSON.parse(localStorage.getItem('vault_session'));
    if (session?.token) config.headers.Authorization = `Bearer ${session.token}`;
  } catch { /* no session */ }
  return config;
});

// Expired or invalid token: clear the session and go to login
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const onAuthCall = err.config?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && !onAuthCall) {
      localStorage.removeItem('vault_session');
      window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);

export default http;