import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from '../utils/api';

const AuthContext = createContext(null);

const STORAGE_KEY = 'lr_auth';

const ROLE_LABELS = {
  TENANT: '租客',
  HOUSEKEEPER: '管家',
  FINANCE: '财务',
  LEGAL: '法务',
  SIGN_ADMIN: '签署管理员'
};

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (username, password) => {
    const resp = await axios.post('/auth/login', { username, password });
    const token = resp.data.token;
    const user = resp.data.user;
    const nextAuth = { token, user };
    setAuth(nextAuth);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    return nextAuth;
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post('/auth/logout');
    } catch (_) {}
    setAuth(null);
    localStorage.removeItem(STORAGE_KEY);
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const resp = await axios.get('/auth/me');
      if (auth) {
        const next = { ...auth, user: resp.data };
        setAuth(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch (e) {
      if (e.response?.status === 401) {
        setAuth(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [auth]);

  useEffect(() => {
    if (auth?.token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${auth.token}`;
    }
  }, [auth]);

  return (
    <AuthContext.Provider value={{
      auth,
      login,
      logout,
      refreshMe,
      isAuthenticated: !!auth,
      user: auth?.user,
      token: auth?.token,
      roleLabel: auth?.user?.role ? ROLE_LABELS[auth.user.role] : null,
      ROLE_LABELS
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ROLE_LABELS };
