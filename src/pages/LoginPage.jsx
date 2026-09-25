import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { validateLogin } from '../../shared/validation.js';
import AuthLayout, { TextField } from './AuthLayout.jsx';

export default function LoginPage() {
  const { login, notice } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const change = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: undefined });
  };

  const submit = async (e) => {
    e.preventDefault();
    const { errors: errs } = validateLogin(form);
    setErrors(errs);
    setMessage(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      // Thành công thì GuestOnly tự chuyển về trang trước đó.
      await login(form.username, form.password);
    } catch (err) {
      setErrors(err.errors);
      setMessage(err.message);
      setBusy(false);
    }
  };

  const banner = message || notice;
  return (
    <AuthLayout title="Đăng nhập" footer={<>Chưa có tài khoản? <Link to="/dang-ky">Đăng ký miễn phí</Link></>}>
      {banner && <div className="banner banner-alert" role="alert">{banner}</div>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <TextField
          name="username"
          label="Tên đăng nhập"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
          value={form.username}
          onChange={change}
          error={errors.username}
          autoFocus
        />
        <TextField
          name="password"
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={change}
          error={errors.password}
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </AuthLayout>
  );
}
