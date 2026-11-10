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
  return { call, id: r.body.user.id };
}

const rows = [
  ['TOÁN', 1, 1, 1, 'Ôn tập'],
  ['  Tiếng   Việt ', 1, 1, 1, null],
];

before(async () => {
  srv = await startServer();
  const a = await newUser(80);
  await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
  admin = a.call;
  user = (await newUser(81)).call;
});
after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test('người thường không quản lý được PPCT, khách không đọc được', async () => {
  assert.equal((await user('PUT', '/admin/ppct/3', { rows })).status, 403);
  assert.equal((await client(srv.base)('GET', '/ppct')).status, 401);
});

test('validate: dòng sai báo số dòng, khối sai trả 404', async () => {
  const bad = await admin('PUT', '/admin/ppct/3', { rows: [rows[0], ['TOÁN', 0, 1, 1, 'x']] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /^Dòng 2: tuần/);
  assert.equal((await admin('PUT', '/admin/ppct/3', { rows: [] })).status, 400);
  assert.equal((await admin('PUT', '/admin/ppct/9', { rows })).status, 404);
});

test('tải lên → người dùng nhận bản mới; khôi phục → về bản gốc', async () => {
  assert.deepEqual((await user('GET', '/ppct')).body, { grades: {} });

  const put = await admin('PUT', '/admin/ppct/3', { rows });
  assert.equal(put.status, 200);
  assert.equal(put.body.rowCount, 2);

  const got = await user('GET', '/ppct');
  assert.deepEqual(got.body.grades['3'], [['TOÁN', 1, 1, 1, 'Ôn tập'], ['Tiếng Việt', 1, 1, 1, '']]);

  const list = await admin('GET', '/admin/ppct');
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].updatedBy.username, 'giaovien80');

  assert.equal((await admin('DELETE', '/admin/ppct/3', {})).status, 200);
  assert.deepEqual((await user('GET', '/ppct')).body, { grades: {} });
});
