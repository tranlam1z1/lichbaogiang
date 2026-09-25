import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, prisma, startServer, validUser } from './helpers.js';

let srv;
before(async () => {
  srv = await startServer();
});
after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test('đăng ký hợp lệ: tạo tài khoản, đăng nhập luôn, có 5 lượt miễn phí', async () => {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', { ...validUser(1), username: 'GiaoVien1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.username, 'giaovien1');
  assert.equal(r.body.user.freeExportsLeft, 5);
  assert.equal(r.body.user.points, 0);
  assert.equal(r.body.user.passwordHash, undefined);
  assert.match(r.setCookie, /HttpOnly/i);
  const me = await call('GET', '/auth/me');
  assert.equal(me.body.user.username, 'giaovien1');
});

test('đăng ký sai định dạng: trả lỗi theo từng trường', async () => {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', {
    username: 'ab',
    password: 'chiconchu',
    confirmPassword: 'khac',
    email: 'khong-phai-email',
    phone: '0123456789',
  });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.errors).sort(), ['confirmPassword', 'email', 'password', 'phone', 'username']);
});

test('đăng ký trùng tên / email / SĐT bị từ chối', async () => {
  const call = client(srv.base);
  await call('POST', '/auth/register', validUser(2));
  const r = await call('POST', '/auth/register', { ...validUser(2), username: 'GIAOVIEN2', phone: '+84 912 345 680' });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.username);
  assert.ok(r.body.errors.email);
  assert.ok(r.body.errors.phone);
});

test('đăng nhập / đăng xuất', async () => {
  const call = client(srv.base);
  await call('POST', '/auth/register', validUser(3));
  await call('POST', '/auth/logout', {});
  assert.equal((await call('GET', '/auth/me')).body.user, null);

  const bad = await call('POST', '/auth/login', { username: 'giaovien3', password: 'saimatkhau1' });
  assert.equal(bad.status, 401);
  const ok = await call('POST', '/auth/login', { username: 'GiaoVien3', password: 'matkhau123' });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/auth/me')).body.user.username, 'giaovien3');
});

test('sai mật khẩu quá số lần cho phép thì bị chặn tạm thời, kể cả khi nhập đúng', async () => {
  const call = client(srv.base);
  await call('POST', '/auth/register', validUser(4));
  for (let i = 0; i < 3; i++) {
    assert.equal((await call('POST', '/auth/login', { username: 'giaovien4', password: 'sai' + i })).status, 401);
  }
  const blocked = await call('POST', '/auth/login', { username: 'giaovien4', password: 'matkhau123' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /quá nhiều lần/);
});

test('tài khoản bị khóa: không đăng nhập được, phiên đang mở bị hủy', async () => {
  const call = client(srv.base);
  await call('POST', '/auth/register', validUser(5));
  await prisma.user.update({ where: { username: 'giaovien5' }, data: { isLocked: true, lockReason: 'Vi phạm điều khoản' } });

  const me = await call('GET', '/auth/me');
  assert.equal(me.body.user, null);
  assert.match(me.body.notice, /Vi phạm điều khoản/);

  const r = await call('POST', '/auth/login', { username: 'giaovien5', password: 'matkhau123' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'ACCOUNT_LOCKED');
  assert.match(r.body.message, /Vi phạm điều khoản/);
});

test('request ghi dữ liệu không phải JSON bị từ chối (chống CSRF)', async () => {
  const res = await fetch(`${srv.base}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'a=1',
  });
  assert.equal(res.status, 415);
});
