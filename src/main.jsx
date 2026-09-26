import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from './state/AppContext.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { GuestOnly, RequireAdmin, RequireAuth } from './routes/guards.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import TopUpPage from './pages/account/TopUpPage.jsx';
import HistoryPage from './pages/account/HistoryPage.jsx';
import './styles.css';

// Trang quản trị tải riêng khi cần — người dùng thường không phải tải phần code này.
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail.jsx'));
const AdminTopUps = lazy(() => import('./pages/admin/AdminTopUps.jsx'));
const AdminBankTransactions = lazy(() => import('./pages/admin/AdminBankTransactions.jsx'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions.jsx'));
const AdminExports = lazy(() => import('./pages/admin/AdminExports.jsx'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'));

const admin = (Page) => (
  <RequireAdmin>
    <Suspense fallback={<div className="empty" role="status">Đang tải…</div>}>
      <Page />
    </Suspense>
  </RequireAdmin>
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/dang-nhap" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/dang-ky" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppProvider>
                  <App />
                </AppProvider>
              </RequireAuth>
            }
          />
          <Route path="/nap-diem" element={<RequireAuth><TopUpPage /></RequireAuth>} />
          <Route path="/lich-su" element={<RequireAuth><HistoryPage /></RequireAuth>} />
          <Route path="/admin" element={admin(AdminDashboard)} />
          <Route path="/admin/nguoi-dung" element={admin(AdminUsers)} />
          <Route path="/admin/nguoi-dung/:id" element={admin(AdminUserDetail)} />
          <Route path="/admin/nap-diem" element={admin(AdminTopUps)} />
          <Route path="/admin/doi-soat" element={admin(AdminBankTransactions)} />
          <Route path="/admin/giao-dich" element={admin(AdminTransactions)} />
          <Route path="/admin/xuat-file" element={admin(AdminExports)} />
          <Route path="/admin/cai-dat" element={admin(AdminSettings)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
