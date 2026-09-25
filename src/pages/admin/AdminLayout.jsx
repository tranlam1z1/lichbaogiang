import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import AccountLayout from '../account/AccountLayout.jsx';

const PendingContext = createContext(() => {});
/** Gọi sau khi duyệt / từ chối để cập nhật số trên tab "Duyệt nạp điểm". */
export const useRefreshPending = () => useContext(PendingContext);

/** Khung trang quản trị: tab điều hướng + số yêu cầu nạp đang chờ. */
export default function AdminLayout({ title, children }) {
  const [pending, setPending] = useState(0);
  const refreshPending = useCallback(() => {
    api
      .get('/admin/topups/pending-count')
      .then((d) => setPending(d.count))
      .catch(() => {});
  }, []);
  useEffect(refreshPending, [refreshPending]);

  const links = [
    { to: '/admin', label: 'Tổng quan', icon: '▦', end: true },
    { to: '/admin/nguoi-dung', label: 'Người dùng', icon: '👤' },
    { to: '/admin/nap-diem', label: 'Duyệt nạp điểm', icon: '＋', badge: pending },
    { to: '/admin/giao-dich', label: 'Giao dịch', icon: '⇄' },
    { to: '/admin/xuat-file', label: 'Xuất file', icon: '⎙' },
    { to: '/admin/cai-dat', label: 'Cài đặt', icon: '⚙' },
    { to: '/', label: 'Về trang kế hoạch', icon: '✎', end: true },
  ];
  return (
    <PendingContext.Provider value={refreshPending}>
      <AccountLayout title={title} subtitle="Kế hoạch giảng dạy · Quản trị" links={links}>
        {children}
      </AccountLayout>
    </PendingContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Danh sách có bộ lọc: bộ lọc nằm trên URL (?q=&from=&page=) để chia sẻ link / quay lại không mất.
// ---------------------------------------------------------------------------

export function useFilters(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const filters = { ...defaults, ...Object.fromEntries(params) };
  const setFilters = useCallback(
    (patch, { resetPage = true } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === '' || v === undefined || v === null || v === defaults[k]) next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );
  return [filters, setFilters];
}

/** Tải danh sách từ API theo bộ lọc; reload() để tải lại sau khi thao tác. */
export function useApiList(path, filters) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '' && v != null)).toString();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api
      .get(`${path}?${query}`)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [path, query, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** Ô tìm kiếm: chỉ áp dụng khi dừng gõ 400ms hoặc bấm Enter. */
export function SearchBox({ value, onChange, placeholder }) {
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);
  useEffect(() => {
    if (text === (value || '')) return undefined;
    const t = setTimeout(() => onChange(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <label className="field field-grow">
      <span>Tìm kiếm</span>
      <input
        type="search"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onChange(text.trim())}
      />
    </label>
  );
}

export function DateRange({ from, to, onChange }) {
  return (
    <>
      <label className="field">
        <span>Từ ngày</span>
        <input type="date" value={from || ''} max={to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
      </label>
      <label className="field">
        <span>Đến ngày</span>
        <input type="date" value={to || ''} min={from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
      </label>
    </>
  );
}

export function Select({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </label>
  );
}

/** Hiển thị trạng thái danh sách: lỗi / đang tải / trống. Trả về null khi có dữ liệu. */
export function ListState({ state, empty }) {
  if (state.error) return <div className="banner banner-alert" role="alert">{state.error}</div>;
  if (!state.data) return <p className="card-text">Đang tải…</p>;
  if (!state.data.items.length) return <p className="card-text">{empty}</p>;
  return null;
}

export const TX_TYPES = {
  SIGNUP_BONUS: 'Tặng khi đăng ký',
  EXPORT: 'Xuất file',
  EXPORT_REFUND: 'Hoàn lại (xuất lỗi)',
  TOPUP: 'Nạp điểm',
  ADMIN_ADJUST: 'Admin cộng/trừ điểm',
  FREE_RESET: 'Đặt lại lượt miễn phí',
};

export function signed(n) {
  if (!n) return '0';
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('vi-VN')}`;
}
