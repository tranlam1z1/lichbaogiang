import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { client, prisma, startServer, validUser } from './helpers.js';

let srv;
let admin; // client đã đăng nhập bằng tài khoản ADMIN
let adminId;

async function newUser(n) {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', validUser(n));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { call, id: r.body.user.id, username: r.body.user.username };
}

before(async () => {
  srv = await startServer();
  const a = await newUser(30);
  await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
  admin = a.call;
  adminId = a.id;
});
after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test('người thường và khách bị chặn ở mọi API /admin', async () => {
  const u = await newUser(31);
  for (const [method, path] of [
    ['GET', '/admin/stats'],
    ['GET', '/admin/users'],
    ['POST', `/admin/users/${u.id}/points`],
    ['PUT', '/admin/settings'],
  ]) {
    assert.equal((await u.call(method, path, method === 'GET' ? undefined : {})).status, 403, path);
    assert.equal((await client(srv.base)(method, path, method === 'GET' ? undefined : {})).status, 401, path);
  }
});

test('tổng quan: đếm người dùng, lượt xuất, tiền nạp, yêu cầu chờ', async () => {
  const u = await newUser(32);
  await u.call('POST', '/exports/authorize', { fileType: 'DOCX' });
  await u.call('POST', '/topups', { amountVnd: 30000 });
  const r = await admin('GET', '/admin/stats');
  assert.equal(r.status, 200);
  assert.ok(r.body.users.total >= 2);
  assert.ok(r.body.users.newToday >= 2);
  assert.ok(r.body.users.newThisWeek >= r.body.users.newToday);
  assert.ok(r.body.exports.total >= 1);
  assert.ok(r.body.topUps.pending >= 1);
});

test('danh sách người dùng: tìm theo tên / email / SĐT, lọc, phân trang', async () => {
  const u = await newUser(33);
  const byName = await admin('GET', '/admin/users?q=GIAOVIEN33');
  assert.deepEqual(byName.body.items.map((x) => x.id), [u.id]);
  const byEmail = await admin('GET', '/admin/users?q=gv33@truong');
  assert.deepEqual(byEmail.body.items.map((x) => x.id), [u.id]);
  const phone = validUser(33).phone;
  const byPhone = await admin('GET', `/admin/users?q=${phone.slice(0, 4)} ${phone.slice(4)}`);
  assert.ok(byPhone.body.items.some((x) => x.id === u.id));
  const admins = await admin('GET', '/admin/users?role=ADMIN');
  assert.ok(admins.body.items.every((x) => x.role === 'ADMIN'));
  const page = await admin('GET', '/admin/users?pageSize=1&page=2');
  assert.equal(page.body.items.length, 1);
  assert.equal(page.body.page, 2);
  const detail = await admin('GET', `/admin/users/${u.id}`);
  assert.equal(detail.body.user.username, 'giaovien33');
  assert.equal(detail.body.transactions[0].type, 'SIGNUP_BONUS');
});

test('khóa tài khoản: bắt buộc lý do, đăng xuất ngay, không đăng nhập được; mở khóa thì đăng nhập lại được', async () => {
  const u = await newUser(34);
  assert.equal((await admin('POST', `/admin/users/${u.id}/lock`, { locked: true })).status, 400);
  const r = await admin('POST', `/admin/users/${u.id}/lock`, { locked: true, reason: 'Spam' });
  assert.equal(r.body.user.isLocked, true);
  assert.equal((await u.call('GET', '/auth/me')).body.user, null);
  const login = await u.call('POST', '/auth/login', { username: u.username, password: 'matkhau123' });
  assert.equal(login.status, 403);
  assert.match(login.body.message, /Spam/);

  await admin('POST', `/admin/users/${u.id}/lock`, { locked: false });
  assert.equal((await u.call('POST', '/auth/login', { username: u.username, password: 'matkhau123' })).status, 200);
  assert.equal((await admin('POST', `/admin/users/${adminId}/lock`, { locked: true, reason: 'x' })).status, 400);
});

test('đặt lại mật khẩu: mật khẩu tạm hoặc mật khẩu tự nhập; phiên cũ bị hủy', async () => {
  const u = await newUser(35);
  const r = await admin('POST', `/admin/users/${u.id}/reset-password`, {});
  assert.match(r.body.temporaryPassword, /^(?=.*[a-z])(?=.*\d)[a-z2-9]{10}$/);
  assert.equal((await u.call('GET', '/auth/me')).body.user, null);
  assert.equal((await u.call('POST', '/auth/login', { username: u.username, password: 'matkhau123' })).status, 401);
  assert.equal((await u.call('POST', '/auth/login', { username: u.username, password: r.body.temporaryPassword })).status, 200);

  assert.equal((await admin('POST', `/admin/users/${u.id}/reset-password`, { password: 'ngan' })).status, 400);
  const own = await admin('POST', `/admin/users/${u.id}/reset-password`, { password: 'matkhaumoi9' });
  assert.equal(own.body.temporaryPassword, undefined);
  assert.equal((await u.call('POST', '/auth/login', { username: u.username, password: 'matkhaumoi9' })).status, 200);
});

test('đổi role: nâng / hạ quyền, không tự hạ quyền mình', async () => {
  const u = await newUser(36);
  assert.equal((await admin('POST', `/admin/users/${u.id}/role`, { role: 'ADMIN' })).body.user.role, 'ADMIN');
  assert.equal((await u.call('GET', '/admin/stats')).status, 200);
  assert.equal((await admin('POST', `/admin/users/${u.id}/role`, { role: 'USER' })).body.user.role, 'USER');
  assert.equal((await u.call('GET', '/admin/stats')).status, 403);
  assert.equal((await admin('POST', `/admin/users/${adminId}/role`, { role: 'USER' })).status, 400);
  assert.equal((await admin('POST', `/admin/users/${u.id}/role`, { role: 'BOSS' })).status, 400);
});

test('cộng / trừ điểm thủ công: bắt buộc lý do, không trừ âm, ghi sổ cái với người thực hiện', async () => {
  const u = await newUser(37);
  assert.equal((await admin('POST', `/admin/users/${u.id}/points`, { delta: 50 })).status, 400);
  assert.equal((await admin('POST', `/admin/users/${u.id}/points`, { delta: 0, reason: 'x' })).status, 400);
  assert.equal((await admin('POST', `/admin/users/${u.id}/points`, { delta: 50, reason: 'Tặng khai trương' })).body.user.points, 50);
  const over = await admin('POST', `/admin/users/${u.id}/points`, { delta: -60, reason: 'Thu hồi' });
  assert.equal(over.status, 409);
  assert.equal((await admin('POST', `/admin/users/${u.id}/points`, { delta: -20, reason: 'Thu hồi' })).body.user.points, 30);

  const tx = await admin('GET', `/admin/transactions?userId=${u.id}&type=ADMIN_ADJUST`);
  assert.equal(tx.body.total, 2);
  assert.equal(tx.body.items[0].points, -20);
  assert.equal(tx.body.items[0].balanceAfter, 30);
  assert.equal(tx.body.items[0].actor.id, adminId);
  assert.equal(tx.body.items[0].note, 'Thu hồi');
  assert.equal(tx.body.sum.points, 30);
});

test('đặt lại lượt miễn phí: mặc định theo cài đặt, ghi sổ cái phần chênh lệch', async () => {
  const u = await newUser(38);
  await u.call('POST', '/exports/authorize', { fileType: 'DOCX' });
  await u.call('POST', '/exports/authorize', { fileType: 'DOCX' });
  const r = await admin('POST', `/admin/users/${u.id}/free-exports`, {});
  assert.equal(r.body.user.freeExportsLeft, 5);
  assert.equal((await admin('POST', `/admin/users/${u.id}/free-exports`, { value: 10, reason: 'Hỗ trợ' })).body.user.freeExportsLeft, 10);
  assert.equal((await admin('POST', `/admin/users/${u.id}/free-exports`, { value: -1 })).status, 400);
  const tx = await admin('GET', `/admin/transactions?userId=${u.id}&type=FREE_RESET`);
  assert.deepEqual(tx.body.items.map((t) => [t.freeExports, t.freeExportsAfter]), [[5, 10], [2, 5]]);
});

test('duyệt / từ chối nạp điểm qua API admin', async () => {
  const u = await newUser(39);
  const a = (await u.call('POST', '/topups', { amountVnd: 20000 })).body.topUp;
  const b = (await u.call('POST', '/topups', { amountVnd: 10000 })).body.topUp;

  const pending = await admin('GET', `/admin/topups?status=PENDING&q=${a.code}`);
  assert.deepEqual(pending.body.items.map((t) => t.id), [a.id]);
  assert.equal(pending.body.items[0].user.username, u.username);

  const ok = await admin('POST', `/admin/topups/${a.id}/approve`, {});
  assert.equal(ok.body.user.points, 200);
  assert.equal((await admin('POST', `/admin/topups/${a.id}/approve`, {})).status, 409);
  assert.equal((await admin('POST', `/admin/topups/${b.id}/reject`, {})).status, 400);
  const no = await admin('POST', `/admin/topups/${b.id}/reject`, { reason: 'Không thấy tiền về' });
  assert.equal(no.body.topUp.status, 'REJECTED');

  const done = await admin('GET', `/admin/topups?userId=${u.id}`);
  assert.deepEqual(done.body.items.map((t) => t.status).sort(), ['APPROVED', 'REJECTED']);
  assert.equal(done.body.items.find((t) => t.status === 'APPROVED').reviewedBy.id, adminId);
});

test('lịch sử xuất file và giao dịch: lọc theo người dùng và khoảng ngày', async () => {
  const u = await newUser(40);
  await u.call('POST', '/exports/authorize', { fileType: 'XLSX' });
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const r = await admin('GET', `/admin/exports?q=giaovien40&from=${today}&to=${today}`);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.items[0].fileType, 'XLSX');
  assert.equal(r.body.items[0].user.username, 'giaovien40');
  assert.equal((await admin('GET', `/admin/exports?q=giaovien40&from=2000-01-01&to=2000-01-02`)).body.total, 0);
  assert.equal((await admin('GET', `/admin/transactions?q=giaovien40&from=${today}`)).body.total, 2);
});

test('cài đặt: validate, lưu vào database và có hiệu lực ngay', async () => {
  const bad = await admin('PUT', '/admin/settings', { values: { pointsPerExport: -1, topupUnitVnd: 'abc' } });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.errors).sort(), ['pointsPerExport', 'topupUnitVnd']);

  const ok = await admin('PUT', '/admin/settings', { values: { pointsPerExport: 8, freeExportsForNewUser: 2 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.values.pointsPerExport, 8);
  assert.equal((await prisma.setting.findUnique({ where: { key: 'pointsPerExport' } })).updatedById, adminId);

  const u = await newUser(41);
  assert.equal((await u.call('GET', '/auth/me')).body.user.freeExportsLeft, 2);
  await prisma.user.update({ where: { id: u.id }, data: { freeExportsLeft: 0, points: 100 } });
  const old = await u.call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 5 });
  assert.equal(old.status, 409);
  assert.equal(old.body.details.cost, 8);
  assert.equal((await u.call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 8 })).body.user.points, 92);

  await admin('PUT', '/admin/settings', { values: { pointsPerExport: 5, freeExportsForNewUser: 5 } });
});

test('seed: tạo admin từ biến môi trường, chạy lại không tạo trùng, nâng quyền tài khoản có sẵn', () => {
  const seed = fileURLToPath(new URL('../prisma/seed.js', import.meta.url));
  const run = (extra) =>
    execFileSync(process.execPath, [seed], { env: { ...process.env, ...extra }, encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) });
  const env = { ADMIN_USERNAME: 'quantri', ADMIN_PASSWORD: 'Quantri2026', ADMIN_EMAIL: 'admin@truong.vn', ADMIN_PHONE: '0909000111' };
  assert.match(run(env), /Đã tạo tài khoản quản trị "quantri"/);
  assert.match(run(env), /đã có sẵn/);
  assert.match(run({ ADMIN_USERNAME: 'giaovien31' }), /đã có sẵn → đặt quyền ADMIN \(giữ nguyên mật khẩu\)/);
  return prisma.user.findMany({ where: { username: { in: ['quantri', 'giaovien31'] } } }).then((rows) => {
    assert.deepEqual(rows.map((r) => r.role), ['ADMIN', 'ADMIN']);
  });
});
