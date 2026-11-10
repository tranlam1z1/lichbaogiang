import { NavLink } from 'react-router-dom';
import UserBar from '../../components/UserBar.jsx';

export const ACCOUNT_LINKS = [
  { to: '/', label: 'Kế hoạch giảng dạy', icon: '✎', end: true },
  { to: '/nap-diem', label: 'Nạp điểm', icon: '＋' },
  { to: '/lich-su', label: 'Lịch sử', icon: '◷' },
];

/**
 * Khung cho các trang tài khoản (nạp điểm, lịch sử) và trang quản trị: cùng header với trang kế hoạch.
 * links: [{ to, label, icon, end?, badge? }]
 * sidebar: menu dọc bên trái (trang quản trị) thay cho thanh tab dưới header; màn hẹp vẫn là dải tab ngang.
 */
export default function AccountLayout({ title, subtitle = 'Kế hoạch giảng dạy · Tài khoản', links = ACCOUNT_LINKS, sidebar = false, children }) {
  const nav = (
    <nav className={sidebar ? 'side-nav' : 'tabs'} aria-label="Điều hướng">
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}>
          <span className="tab-icon" aria-hidden="true">{l.icon}</span>
          <span>{l.label}</span>
          {l.badge ? <span className="tab-badge" aria-label={`${l.badge} mục cần xử lý`}>{l.badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
  const main = <main className="page stack">{children}</main>;
  return (
    <div className="app">
      <header className={`masthead${sidebar ? ' masthead-flat' : ''}`}>
        <div className="masthead-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">📒</span>
            <div>
              <h1>{title}</h1>
              <p className="brand-sub">{subtitle}</p>
            </div>
            <UserBar />
          </div>
          {!sidebar && nav}
        </div>
      </header>
      {sidebar ? (
        <div className="side-shell">
          {nav}
          {main}
        </div>
      ) : (
        main
      )}
    </div>
  );
}

/** Phân trang đơn giản: Trước / Trang x/y / Sau. */
export function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label="Phân trang">
      <button type="button" className="btn btn-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Trước
      </button>
      <span className="pager-gap">Trang {page}/{totalPages}</span>
      <button type="button" className="btn btn-small" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Sau ›
      </button>
    </nav>
  );
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export const TOPUP_STATUS = {
  PENDING: { label: 'Chờ duyệt', className: 'pill-edit' },
  APPROVED: { label: 'Đã cộng điểm', className: 'pill-ok' },
  REJECTED: { label: 'Bị từ chối', className: 'pill-warn' },
  CANCELLED: { label: 'Đã hủy', className: '' },
};

export const EXPORT_STATUS = {
  AUTHORIZED: { label: 'Đang tạo / chưa xác nhận', className: 'pill-edit' },
  COMPLETED: { label: 'Thành công', className: 'pill-ok' },
  REFUNDED: { label: 'Lỗi – đã hoàn lại', className: 'pill-warn' },
};
