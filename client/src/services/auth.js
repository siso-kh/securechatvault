import http from './http';
import * as mock from './auth.mock';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const toError = (err) =>
  new Error(err.response?.data?.error || 'Cannot reach the server. Try again.');

async function login({ email, password }) {
  try {
    const { data } = await http.post('/auth/login', { email, password });
    return data;
  } catch (err) {
    throw toError(err);
  }
}

async function adminLogin({ passcode }) {
  try {
    const { data } = await http.post('/auth/admin-login', { passcode });
    return data;
  } catch (err) {
    throw toError(err);
  }
}

async function register({ name, email, password }) {
  try {
    const { data } = await http.post('/auth/register', { name, email, password });
    return data;
  } catch (err) {
    throw toError(err);
  }
}

export const loginUser = USE_MOCK ? mock.login : login;
export const registerUser = USE_MOCK ? mock.register : register;
export const loginAdmin = USE_MOCK ? mock.adminLogin : adminLogin;