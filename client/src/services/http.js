import axios from 'axios';

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

http.interceptors.request.use((config) => {
  try {
    const session = JSON.parse(localStorage.getItem('vault_session'));
    if (session?.token) config.headers.Authorization = `Bearer ${session.token}`;
  } catch { /* no session */ }
  return config;
});

const loginPath = () =>
  window.location.pathname.startsWith('/admin') ? '/admin/login' : '/auth';

// Expired token or banned account: clear the session and go to login
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const { status, data } = err.response ?? {};
    const onAuthCall = err.config?.url?.startsWith('/auth/');
    const banned = status === 403 && data?.error === 'Account banned';
    if ((status === 401 && !onAuthCall) || banned) {
      localStorage.removeItem('vault_session');
      window.location.assign(loginPath());
    }
    return Promise.reject(err);
  }
);

export default http;