import { useState } from 'react';

/** Khung chung cho trang đăng nhập / đăng ký. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">📒</span>
          <div>
            <p className="auth-app">Kế hoạch giảng dạy</p>
            <h1>{title}</h1>
          </div>
        </div>
        {subtitle && <p className="card-text">{subtitle}</p>}
        {children}
        {footer && <p className="auth-footer">{footer}</p>}
      </div>
    </div>
  );
}

/** Ô nhập có nhãn, gợi ý và thông báo lỗi gắn với aria-describedby. `addon` là nút đặt ở mép phải ô. */
export function TextField({ name, label, hint, error, addon, ...props }) {
  const hintId = `${name}-hint`;
  const errId = `${name}-error`;
  const input = (
    <input
      name={name}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? errId : hint ? hintId : undefined}
      {...props}
    />
  );
  return (
    <label className="field auth-field">
      <span>{label}</span>
      {addon ? <div className="input-addon">{input}{addon}</div> : input}
      {error ? (
        <small id={errId} className="field-error">{error}</small>
      ) : (
        hint && <small id={hintId} className="field-hint">{hint}</small>
      )}
    </label>
  );
}

const EyeIcon = ({ off }) => (
  <svg className="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

/** Ô mật khẩu có nút con mắt để hiện / ẩn nội dung đang gõ. */
export function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      addon={
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          // Giữ con trỏ trong ô nhập khi bấm bằng chuột.
          onMouseDown={(e) => e.preventDefault()}
          aria-label={label}
          title={label}
        >
          <EyeIcon off={visible} />
        </button>
      }
    />
  );
}
