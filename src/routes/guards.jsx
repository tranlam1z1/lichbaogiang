import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

function Loading() {
  return <div className="empty" role="status">Đang tải…</div>;
}

/** Chỉ cho vào khi đã đăng nhập; chưa thì chuyển tới trang đăng nhập rồi quay lại sau. */
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/dang-nhap" replace state={{ from: location }} />;
  return children;
}

/** Chỉ ADMIN. Người thường thấy thông báo không có quyền (API /admin cũng chặn ở server). */
export function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/dang-nhap" replace state={{ from: location }} />;
  if (user.role !== 'ADMIN') {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1>Không có quyền truy cập</h1>
          <p className="card-text">Trang quản trị chỉ dành cho quản trị viên.</p>
          <Link className="btn btn-primary" to="/">Về trang kế hoạch</Link>
        </div>
      </div>
    );
  }
  return children;
}

/** Trang đăng nhập / đăng ký: đã đăng nhập thì về trang chính. */
export function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  return children;
}
