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

async function newUser(n) {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', validUser(n));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { call, id: r.body.user.id };
}

const sample = (className = '4A') => ({ version: 1, info: { className, grade: 4 }, timetable: { days: {} }, tab: 'ppct', selectedWeekId: 'w1' });

test('chưa đăng nhập → 401', async () => {
  const call = client(srv.base);
  assert.equal((await call('GET', '/plan')).status, 401);
  const put = await call('PUT', '/plan', { data: sample(), baseVersion: 0 });
  assert.equal(put.status, 401);
  assert.equal(put.body.code, 'UNAUTHENTICATED');
});

test('chưa có kế hoạch → data null, version 0', async () => {
  const { call } = await newUser(30);
  const r = await call('GET', '/plan');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { data: null, version: 0, updatedAt: null });
});

test('tạo mới rồi cập nhật đúng version; bỏ các trường chỉ dùng cho giao diện', async () => {
  const { call } = await newUser(31);
  const created = await call('PUT', '/plan', { data: sample(), baseVersion: 0 });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.version, 1);
  assert.ok(created.body.updatedAt);

  const got = await call('GET', '/plan');
  assert.equal(got.body.version, 1);
  assert.equal(got.body.data.info.className, '4A');
  assert.equal(got.body.data.tab, undefined);
  assert.equal(got.body.data.selectedWeekId, undefined);

  const updated = await call('PUT', '/plan', { data: sample('4B'), baseVersion: 1 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.version, 2);
  assert.equal((await call('GET', '/plan')).body.data.info.className, '4B');
});

test('sai version → 409 PLAN_CONFLICT kèm version trên server, không ghi đè', async () => {
  const { call } = await newUser(32);
  await call('PUT', '/plan', { data: sample('A'), baseVersion: 0 });
  await call('PUT', '/plan', { data: sample('B'), baseVersion: 1 });

  const stale = await call('PUT', '/plan', { data: sample('C'), baseVersion: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'PLAN_CONFLICT');
  assert.equal(stale.body.details.version, 2);
  assert.ok(stale.body.details.updatedAt);

  // Tạo mới (baseVersion 0) khi đã có kế hoạch cũng là xung đột.
  const again = await call('PUT', '/plan', { data: sample('D'), baseVersion: 0 });
  assert.equal(again.status, 409);
  assert.equal(again.body.details.version, 2);

  assert.equal((await call('GET', '/plan')).body.data.info.className, 'B');
});

test('hai máy lưu cùng lúc trên cùng version → chỉ một máy thắng', async () => {
  const { call } = await newUser(33);
  await call('PUT', '/plan', { data: sample(), baseVersion: 0 });
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => call('PUT', '/plan', { data: sample(`X${i}`), baseVersion: 1 })),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);
  assert.equal((await call('GET', '/plan')).body.version, 2);
});

test('dữ liệu không hợp lệ → 400; quá 512 KB → 413', async () => {
  const { call } = await newUser(34);
  assert.equal((await call('PUT', '/plan', { data: [1, 2], baseVersion: 0 })).status, 400);
  assert.equal((await call('PUT', '/plan', { data: sample(), baseVersion: -1 })).status, 400);
  assert.equal((await call('PUT', '/plan', { data: sample() })).status, 400);

  const big = { ...sample(), note: 'x'.repeat(600 * 1024) };
  const r = await call('PUT', '/plan', { data: big, baseVersion: 0 });
  assert.equal(r.status, 413);
  assert.equal(r.body.code, 'PLAN_TOO_LARGE');
  assert.match(r.body.message, /512 KB/);
  assert.equal((await call('GET', '/plan')).body.version, 0);
});

test('người dùng A không đọc / ghi được kế hoạch của B', async () => {
  const a = await newUser(35);
  const b = await newUser(36);
  await b.call('PUT', '/plan', { data: sample('CUA-B'), baseVersion: 0 });

  const aGet = await a.call('GET', '/plan');
  assert.deepEqual(aGet.body, { data: null, version: 0, updatedAt: null });
  // A ghi (version 0 là của A) → tạo kế hoạch riêng cho A, không đụng tới B.
  const aPut = await a.call('PUT', '/plan', { data: sample('CUA-A'), baseVersion: 0 });
  assert.equal(aPut.status, 200);

  assert.equal((await b.call('GET', '/plan')).body.data.info.className, 'CUA-B');
  assert.equal((await a.call('GET', '/plan')).body.data.info.className, 'CUA-A');
  const rows = await prisma.plan.findMany({ where: { userId: { in: [a.id, b.id] } } });
  assert.equal(rows.length, 2);
});
