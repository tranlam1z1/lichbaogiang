import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  validateEmail,
  validatePassword,
  validatePhone,
  validateRegister,
  validateUsername,
} from '../shared/validation.js';

test('tên đăng nhập: 4–20 ký tự, chữ không dấu, số, gạch dưới', () => {
  for (const ok of ['abcd', 'giao_vien_01', 'A'.repeat(20)]) assert.equal(validateUsername(ok), null, ok);
  for (const bad of ['', 'abc', 'a'.repeat(21), 'giáo_viên', 'co khoang', 'dau-gach', 'a@b.c']) {
    assert.ok(validateUsername(bad), bad);
  }
});

test('mật khẩu: ≥ 8 ký tự, có chữ và số', () => {
  assert.equal(validatePassword('matkhau1'), null);
  assert.equal(validatePassword('Mậtkhẩu9'), null);
  for (const bad of ['', 'abc123', 'chiconchu', '12345678', 'a1'.repeat(40)]) assert.ok(validatePassword(bad), bad);
});

test('email', () => {
  assert.equal(validateEmail(' GV@Truong.Edu.VN '), null);
  for (const bad of ['', 'gv', 'gv@', 'gv@truong', 'g v@truong.vn']) assert.ok(validateEmail(bad), bad);
});

test('số điện thoại Việt Nam: 10 số, đầu 03/05/07/08/09, chấp nhận +84 và dấu cách', () => {
  for (const ok of ['0912345678', '0312345678', '0512345678', '0712345678', '0812345678', '+84 912 345 678', '84912345678', '091.234.5678']) {
    assert.equal(validatePhone(ok), null, ok);
  }
  assert.equal(normalizePhone('+84 912 345 678'), '0912345678');
  for (const bad of ['', '0212345678', '0412345678', '0612345678', '091234567', '09123456789', '1912345678']) {
    assert.ok(validatePhone(bad), bad);
  }
});

test('form đăng ký: chuẩn hóa dữ liệu và kiểm tra nhập lại mật khẩu', () => {
  const ok = validateRegister({
    username: 'GiaoVien',
    password: 'matkhau1',
    confirmPassword: 'matkhau1',
    email: 'GV@X.VN',
    phone: '+84912345678',
  });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.data, { username: 'giaovien', password: 'matkhau1', email: 'gv@x.vn', phone: '0912345678' });

  const mismatch = validateRegister({ ...ok.data, password: 'matkhau1', confirmPassword: 'matkhau2' });
  assert.equal(mismatch.errors.confirmPassword, 'Mật khẩu nhập lại không khớp.');
});

test('số tiền nạp: tối thiểu và bội số của mệnh giá, quy đổi điểm', async () => {
  const { validateTopUpAmount, pointsForAmount } = await import('../shared/validation.js');
  for (const ok of [10000, '20000', 1_000_000]) assert.equal(validateTopUpAmount(ok, 10000), null, String(ok));
  for (const bad of ['', null, 'abc', 0, 9999, 15000, 10000.5, -10000, 20_000_000]) {
    assert.ok(validateTopUpAmount(bad, 10000), String(bad));
  }
  assert.equal(pointsForAmount(50000, 10000, 100), 500);
});
