import { useEffect, useRef } from 'react';

/**
 * Hộp thoại có nhiều lựa chọn (dữ liệu cũ, xung đột, đăng xuất khi chưa lưu).
 * actions: [{ label, onClick, tone?: 'primary' | 'danger' | 'quiet' }] — nút cuối được focus sẵn.
 * onCancel: bỏ trống nếu người dùng bắt buộc phải chọn (không đóng bằng Esc).
 */
export default function ChoiceDialog({ open, title, children, actions, onCancel, busy, error }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    ref.current?.querySelector('.modal-actions .btn:last-child')?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div ref={ref} className="modal choice-dialog" role="alertdialog" aria-modal="true" aria-labelledby="choice-title">
        <h3 id="choice-title">{title}</h3>
        <div className="choice-body">{children}</div>
        {error && <div className="banner banner-alert" role="alert">{error}</div>}
        <div className="modal-actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`btn${a.tone ? ` btn-${a.tone}` : ''}`}
              disabled={busy}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
