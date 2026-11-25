import { createContext, useCallback, useMemo, useState } from 'react';
import { loginUser, loginAdmin, registerUser } from '../services/auth';

export const AuthContext = createContext(null);

const KEY = 'vault_session';
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(load);

  const save = (s) => {
    localStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
  };

  const login = useCallback(async (data) => save(await loginUser(data)), []);
  const adminLogin = useCallback(async (data) => save(await loginAdmin(data)), []);
  const register = useCallback(async (data) => save(await registerUser(data)), []);
  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      login,
      adminLogin,
      register,
      logout,
    }),
    [session, login, adminLogin, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
