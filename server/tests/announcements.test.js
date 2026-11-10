import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, prisma, startServer, validUser } from './helpers.js';

let srv;
let admin;
let user;

async function newUser(n) {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', validUser(n));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { call, id: r.body.user.id, user: r.body.user };
}

const base = { title: 'Bảo trì', body: '**Tối nay** bảo trì', placement: 'MODAL' };
const hour = 60 * 60 * 1000;

before(async () => {
  srv = await startServer();
  const a = await newUser(70);
  await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
  admin = a.call;
  user = await newUser(71);
});
after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test('người thường bị chặn ở API quản lý, khách bị chặn ở API đọc', async () => {
  assert.equal((await user.call('GET', '/admin/announcements')).status, 403);
  assert.equal((await user.call('POST', '/admin/announcements', base)).status, 403);
  assert.equal((await client(srv.base)('GET', '/announcements')).status, 401);
});

test('đăng ký trả về lastLoginAt để frontend biết lần đăng nhập', () => {
  assert.ok(user.user.lastLoginAt);
});

test('validate: thiếu trường, sai vị trí, ngày kết thúc trước ngày bắt đầu', async () => {
  const r = await admin('POST', '/admin/announcements', {
    title: ' ',
    body: '',
    placement: 'TOP',
    tone: 'RED',
    sortOrder: 1.5,
    startsAt: '2026-11-10T10:00:00Z',
    endsAt: '2026-11-10T09:00:00Z',
  });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.errors).sort(), ['body', 'endsAt', 'placement', 'sortOrder', 'title', 'tone']);
  const badDate = await admin('POST', '/admin/announcements', { ...base, startsAt: 'hôm qua' });
  assert.equal(badDate.body.errors.startsAt, 'Ngày bắt đầu không hợp lệ.');
});

test('người dùng chỉ thấy thông báo đang bật và trong thời gian hiển thị, theo thứ tự', async () => {
  await prisma.announcement.deleteMany();
  const now = Date.now();
  const mk = async (extra) => (await admin('POST', '/admin/announcements', { ...base, ...extra })).body.item;
  const live = await mk({ title: 'Đang hiện', sortOrder: 2 });
  const first = await mk({ title: 'Lên đầu', placement: 'LEFT', tone: 'WARNING', sortOrder: 1, endsAt: new Date(now + hour).toISOString() });
  await mk({ title: 'Đã tắt', isActive: false });
  await mk({ title: 'Hẹn giờ', startsAt: new Date(now + hour).toISOString() });
  await mk({ title: 'Hết hạn', endsAt: new Date(now - hour).toISOString() });

  const r = await user.call('GET', '/announcements');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((a) => a.id), [first.id, live.id]);
  assert.deepEqual(Object.keys(r.body.items[0]).sort(), ['body', 'id', 'placement', 'title', 'tone']);

  const all = await admin('GET', '/admin/announcements');
  assert.equal(all.body.items.length, 5);
});

test('sửa và xóa thông báo', async () => {
  const { item } = (await admin('POST', '/admin/announcements', base)).body;
  const upd = await admin('PUT', `/admin/announcements/${item.id}`, { ...base, title: 'Đã sửa', placement: 'RIGHT', isActive: false });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.item.title, 'Đã sửa');
  assert.equal(upd.body.item.isActive, false);
  assert.equal((await admin('DELETE', `/admin/announcements/${item.id}`, {})).status, 200);
  assert.equal((await admin('PUT', `/admin/announcements/${item.id}`, base)).status, 404);
  assert.equal((await admin('DELETE', `/admin/announcements/${item.id}`, {})).status, 404);
  assert.equal((await admin('DELETE', '/admin/announcements/abc', {})).status, 404);
});
