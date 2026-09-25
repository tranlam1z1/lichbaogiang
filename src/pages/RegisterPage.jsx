import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { validateRegister } from '../../shared/validation.js';
import AuthLayout, { TextField } from './AuthLayout.jsx';

const EMPTY = { username: '', password: '', confirmPassword: '', email: '', phone: '' };
const ALL_TOUCHED = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, true]));

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  // Chỉ hiện lỗi của ô đã rời khỏi (hoặc sau khi bấm Đăng ký) để không báo lỗi khi người dùng đang gõ dở.
  const [touched, setTouched] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const recheck = (nextForm, nextTouched) => {
    const { errors: errs } = validateRegister(nextForm);
    setErrors(Object.fromEntries(Object.entries(errs).filter(([k]) => nextTouched[k])));
  };

  const change = (e) => {
    const next = { ...form, [e.target.name]: e.target.value };
    setForm(next);
    recheck(next, touched);
  };

  const blur = (e) => {
    const next = { ...touched, [e.target.name]: true };
    setTouched(next);
    recheck(form, next);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setTouched(ALL_TOUCHED);
    const { errors: errs } = validateRegister(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await register(form);
    } catch (err) {
      setErrors(err.errors);
      setMessage(err.message);
      setBusy(false);
    }
  };

  const field = (name) => ({ name, value: form[name], onChange: change, onBlur: blur, error: errors[name] });

  return (
    <AuthLayout
      title="Tạo tài khoản"
      subtitle="Tài khoản mới được tặng 5 lượt xuất file Word/Excel miễn phí."
      footer={<>Đã có tài khoản? <Link to="/dang-nhap">Đăng nhập</Link></>}
    >
      {message && <div className="banner banner-alert" role="alert">{message}</div>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <TextField
          {...field('username')}
          label="Tên đăng nhập"
          hint="4–20 ký tự: chữ không dấu, số hoặc dấu gạch dưới (_)."
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
          maxLength={20}
          autoFocus
        />
        <TextField
          {...field('password')}
          label="Mật khẩu"
          type="password"
          hint="Ít nhất 8 ký tự, có cả chữ và số."
          autoComplete="new-password"
        />
        <TextField {...field('confirmPassword')} label="Nhập lại mật khẩu" type="password" autoComplete="new-password" />
        <TextField {...field('email')} label="Email" type="email" autoComplete="email" inputMode="email" />
        <TextField
          {...field('phone')}
          label="Số điện thoại"
          type="tel"
          hint="10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09."
          autoComplete="tel"
          inputMode="tel"
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </button>
      </form>
    </AuthLayout>
  );
}
