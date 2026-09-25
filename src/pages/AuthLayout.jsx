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

/** Ô nhập có nhãn, gợi ý và thông báo lỗi gắn với aria-describedby. */
export function TextField({ name, label, hint, error, ...props }) {
  const hintId = `${name}-hint`;
  const errId = `${name}-error`;
  return (
    <label className="field auth-field">
      <span>{label}</span>
      <input
        name={name}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errId : hint ? hintId : undefined}
        {...props}
      />
      {error ? (
        <small id={errId} className="field-error">{error}</small>
      ) : (
        hint && <small id={hintId} className="field-hint">{hint}</small>
      )}
    </label>
  );
}
