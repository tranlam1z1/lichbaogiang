import { useEffect, useRef } from 'react';

/**
 * Hộp thoại có form (nhập lý do, số điểm…). Enter để gửi, Esc để đóng.
 * error: thông báo lỗi chung hiện phía trên nút.
 */
export default function FormDialog({ open, title, children, submitLabel = 'Lưu', danger, busy, error, onSubmit, onCancel }) {
  const formRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    formRef.current?.querySelector('input, select, textarea')?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <form
        ref={formRef}
        className="modal modal-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit();
        }}
        noValidate
      >
        <h3 id="form-dialog-title">{title}</h3>
        <div className="modal-body">{children}</div>
        {error && <div className="banner banner-alert" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? 'Đang xử lý…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
