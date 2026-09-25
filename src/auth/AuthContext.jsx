import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Thông báo hiện ở trang đăng nhập (VD: tài khoản bị khóa, phiên hết hạn).
  const [notice, setNotice] = useState(null);
  // Cài đặt công khai: điểm mỗi lần xuất, tỷ lệ nạp… (lấy từ server, không hard-code).
  const [settings, setSettings] = useState(null);

  const refresh = useCallback(async () => {
    const data = await api.get('/auth/me');
    setUser(data.user);
    if (data.notice) setNotice(data.notice);
    return data.user;
  }, []);

  const refreshSettings = useCallback(async () => {
    const data = await api.get('/settings/public');
    setSettings(data);
    return data;
  }, []);

  useEffect(() => {
    Promise.all([refresh(), refreshSettings()])
      .catch((e) => setNotice(e.message))
      .finally(() => setLoading(false));
  }, [refresh, refreshSettings]);

  // Quay lại tab (VD: sau khi chuyển khoản xong) → cập nhật số điểm mới nhất nếu admin vừa duyệt.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && user) {
        refresh().catch(() => {});
        refreshSettings().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, refresh, refreshSettings]);

  /** Cập nhật số dư từ dữ liệu server trả về (một phần hoặc cả user). */
  const updateBalances = useCallback((partial) => {
    setUser((u) => (u ? { ...u, ...partial } : u));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((err) => {
      setUser(null);
      setNotice(err.message);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    setNotice(null);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (form) => {
    const data = await api.post('/auth/register', form);
    setNotice(null);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setNotice(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      notice,
      settings,
      setNotice,
      setUser,
      updateBalances,
      refresh,
      refreshSettings,
      login,
      register,
      logout,
    }),
    [user, loading, notice, settings, updateBalances, refresh, refreshSettings, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng bên trong <AuthProvider>');
  return ctx;
}
