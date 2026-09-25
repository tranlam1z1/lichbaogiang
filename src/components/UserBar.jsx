import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

/** Góc phải header: tên người dùng, lượt miễn phí còn lại, điểm, nạp điểm, lịch sử, đăng xuất. */
export default function UserBar() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <div className="userbar" aria-label="Tài khoản">
      <Link to="/lich-su" className="userbar-name" title={`${user.email} · Xem lịch sử`}>
        <span aria-hidden="true">👤</span> {user.username}
      </Link>
      <span className="pill pill-ok" title="Số lượt xuất file miễn phí còn lại">
        Miễn phí: <strong>{user.freeExportsLeft}</strong> lượt
      </span>
      <Link to="/nap-diem" className="pill pill-link" title="Số điểm hiện có — bấm để nạp thêm">
        Điểm: <strong>{user.points.toLocaleString('vi-VN')}</strong> <span aria-hidden="true">＋</span>
      </Link>
      {user.role === 'ADMIN' && (
        <Link to="/admin" className="btn btn-small btn-quiet">Quản trị</Link>
      )}
      <button
        type="button"
        className="btn btn-small btn-quiet"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          logout().catch(() => {});
        }}
      >
        Đăng xuất
      </button>
    </div>
  );
}
