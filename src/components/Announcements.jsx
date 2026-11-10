import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { DISMISS_STORAGE_KEY, dismissedIds, loginKey, pendingModals, withDismissed } from '../lib/announcements.js';
import Markdown from './Markdown.jsx';

function readStore() {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStore(value) {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, value);
  } catch {
    // Trình duyệt chặn lưu trữ: modal sẽ hiện lại khi tải lại trang, không ảnh hưởng gì khác.
  }
}

/** Tải thông báo đang hiệu lực; trả về modal chưa đóng + thẻ cột trái/phải. */
export function useAnnouncements() {
  const { user } = useAuth();
  const login = loginKey(user);
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => dismissedIds(readStore(), login));

  useEffect(() => {
    // Thông báo không bắt buộc: lỗi mạng thì bỏ qua, không chặn người dùng làm việc.
    api.get('/announcements').then((d) => setItems(d.items)).catch(() => {});
  }, []);

  const modals = pendingModals(items, dismissed);
  const dismissModals = useCallback(() => {
    const ids = modals.map((a) => a.id);
    writeStore(withDismissed(readStore(), login, ids));
    setDismissed((prev) => [...prev, ...ids]);
  }, [modals, login]);

  return {
    modals,
    dismissModals,
    left: items.filter((a) => a.placement === 'LEFT'),
    right: items.filter((a) => a.placement === 'RIGHT'),
  };
}

const toneClass = (a) => `tone-${a.tone.toLowerCase()}`;

/** Modal giữa màn hình; nhiều thông báo thì lật từng cái. Đóng = đã xem trong lần đăng nhập này. */
export function AnnouncementModal({ items, onClose }) {
  const [index, setIndex] = useState(0);
  const primaryRef = useRef(null);
  useEffect(() => primaryRef.current?.focus(), [index]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!items.length) return null;
  const a = items[Math.min(index, items.length - 1)];
  const last = index >= items.length - 1;
  return (
    <div className="modal-backdrop">
      <div className={`modal ann-modal ${toneClass(a)}`} role="dialog" aria-modal="true" aria-labelledby="ann-title">
        {items.length > 1 && <p className="ann-count">Thông báo {index + 1}/{items.length}</p>}
        <h2 id="ann-title">{a.title}</h2>
        <div className="ann-body"><Markdown source={a.body} /></div>
        <div className="modal-actions">
          {index > 0 && <button type="button" className="btn" onClick={() => setIndex(index - 1)}>Quay lại</button>}
          <button ref={primaryRef} type="button" className="btn btn-primary" onClick={last ? onClose : () => setIndex(index + 1)}>
            {last ? 'Đã hiểu' : 'Xem tiếp'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnouncementCard({ a }) {
  return (
    <article className={`ann-card ${toneClass(a)}`}>
      <h3>{a.title}</h3>
      <div className="ann-body"><Markdown source={a.body} /></div>
    </article>
  );
}

/** Cột thông báo hai bên — chỉ hiện trên màn hình rộng (xem CSS .ann-side). */
export function AnnouncementSide({ items, side }) {
  if (!items.length) return null;
  return (
    <aside className={`ann-side ann-side-${side}`} aria-label={`Thông báo bên ${side === 'left' ? 'trái' : 'phải'}`}>
      {items.map((a) => <AnnouncementCard key={a.id} a={a} />)}
    </aside>
  );
}

/** Màn hình hẹp: thông báo hai bên gom thành dải thu gọn được phía trên nội dung. */
export function AnnouncementStrip({ items }) {
  if (!items.length) return null;
  return (
    <details className="ann-strip" open>
      <summary>Thông báo ({items.length})</summary>
      <div className="ann-strip-list">
        {items.map((a) => <AnnouncementCard key={a.id} a={a} />)}
      </div>
    </details>
  );
}
