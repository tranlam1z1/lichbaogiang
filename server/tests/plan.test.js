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

const sample = (className = '4A', teacher = 'Cô Lan') => ({
  version: 1,
  info: { className, grade: 4, teacher, school: 'TH Kim Đồng' },
  timetable: { days: {} },
  tab: 'ppct',
  selectedWeekId: 'w1',
});

async function create(call, data = sample(), name) {
  const r = await call('POST', '/plans', { data, ...(name !== undefined && { name }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test('chưa đăng nhập → 401', async () => {
  const call = client(srv.base);
  assert.equal((await call('GET', '/plans')).status, 401);
  assert.equal((await call('GET', '/plans/1')).status, 401);
  const post = await call('POST', '/plans', { data: sample() });
  assert.equal(post.status, 401);
  assert.equal(post.body.code, 'UNAUTHENTICATED');
});

test('tài khoản mới chưa có hồ sơ nào', async () => {
  const { call } = await newUser(30);
  const r = await call('GET', '/plans');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { plans: [] });
});

test('tạo hồ sơ rồi cập nhật đúng version; bỏ các trường chỉ dùng cho giao diện', async () => {
  const { call } = await newUser(31);
  const created = await create(call);
  assert.equal(created.version, 1);
  assert.equal(created.name, '');
  assert.equal(created.label, 'Cô Lan · Lớp 4A · TH Kim Đồng');
  assert.ok(created.updatedAt);

  const got = await call('GET', `/plans/${created.id}`);
  assert.equal(got.body.version, 1);
  assert.equal(got.body.data.info.className, '4A');
  assert.equal(got.body.data.tab, undefined);
  assert.equal(got.body.data.selectedWeekId, undefined);

  const updated = await call('PUT', `/plans/${created.id}`, { data: sample('4B'), baseVersion: 1 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.version, 2);
  const again = await call('GET', `/plans/${created.id}`);
  assert.equal(again.body.data.info.className, '4B');
  // Nhãn trong danh sách đi theo thông tin lớp mới nhất.
  assert.equal(again.body.label, 'Cô Lan · Lớp 4B · TH Kim Đồng');
});

test('nhiều hồ sơ trên một tài khoản: mỗi hồ sơ giữ dữ liệu riêng, mới sửa nhất đứng đầu', async () => {
  const { call } = await newUser(37);
  const lan = await create(call, sample('3A', 'Cô Lan'), '  Cô Lan   3A ');
  const hung = await create(call, sample('5B', 'Thầy Hùng'));
  assert.equal(lan.name, 'Cô Lan 3A');

  // Sửa hồ sơ của cô Lan sau khi đã làm cho thầy Hùng → không đụng tới hồ sơ thầy Hùng.
  await call('PUT', `/plans/${lan.id}`, { data: sample('3C', 'Cô Lan'), baseVersion: 1 });
  const list = (await call('GET', '/plans')).body.plans;
  assert.deepEqual(list.map((p) => p.id), [lan.id, hung.id]);
  assert.deepEqual(list.map((p) => p.label), ['Cô Lan · Lớp 3C · TH Kim Đồng', 'Thầy Hùng · Lớp 5B · TH Kim Đồng']);
  assert.equal(list[0].data, undefined);
  assert.equal((await call('GET', `/plans/${hung.id}`)).body.data.info.className, '5B');
  assert.equal((await call('GET', `/plans/${hung.id}`)).body.version, 1);
});

test('đổi tên không đổi version; xóa hồ sơ', async () => {
  const { call } = await newUser(38);
  const a = await create(call);
  const b = await create(call, sample('5B'));

  const renamed = await call('PATCH', `/plans/${a.id}`, { name: 'Lớp chủ nhiệm' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, 'Lớp chủ nhiệm');
  assert.equal(renamed.body.version, 1);
  assert.equal((await call('PUT', `/plans/${a.id}`, { data: sample('4C'), baseVersion: 1 })).status, 200);
  assert.equal((await call('GET', `/plans/${a.id}`)).body.name, 'Lớp chủ nhiệm');
  assert.equal((await call('PATCH', `/plans/${a.id}`, { name: 'x'.repeat(81) })).status, 400);
  assert.equal((await call('PATCH', `/plans/${a.id}`, {})).status, 400);

  assert.equal((await call('DELETE', `/plans/${b.id}`, {})).status, 200);
  assert.deepEqual((await call('GET', '/plans')).body.plans.map((p) => p.id), [a.id]);
  // Hồ sơ đã xóa: đọc / lưu / xóa lại đều 404, không phải xung đột.
  for (const r of [
    await call('GET', `/plans/${b.id}`),
    await call('PUT', `/plans/${b.id}`, { data: sample(), baseVersion: 1 }),
    await call('DELETE', `/plans/${b.id}`, {}),
    await call('GET', '/plans/abc'),
  ]) {
    assert.equal(r.status, 404);
    assert.equal(r.body.code, 'PLAN_NOT_FOUND');
  }
});

test('sai version → 409 PLAN_CONFLICT kèm version trên server, không ghi đè', async () => {
  const { call } = await newUser(32);
  const { id } = await create(call, sample('A'));
  await call('PUT', `/plans/${id}`, { data: sample('B'), baseVersion: 1 });

  const stale = await call('PUT', `/plans/${id}`, { data: sample('C'), baseVersion: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'PLAN_CONFLICT');
  assert.equal(stale.body.details.version, 2);
  assert.ok(stale.body.details.updatedAt);

  assert.equal((await call('GET', `/plans/${id}`)).body.data.info.className, 'B');
});

test('hai máy lưu cùng lúc trên cùng version → chỉ một máy thắng', async () => {
  const { call } = await newUser(33);
  const { id } = await create(call);
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => call('PUT', `/plans/${id}`, { data: sample(`X${i}`), baseVersion: 1 })),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);
  assert.equal((await call('GET', `/plans/${id}`)).body.version, 2);
});

test('dữ liệu không hợp lệ → 400; quá 512 KB → 413', async () => {
  const { call } = await newUser(34);
  assert.equal((await call('POST', '/plans', { data: [1, 2] })).status, 400);
  assert.equal((await call('POST', '/plans', { data: sample(), name: 5 })).status, 400);
  const { id } = await create(call);
  assert.equal((await call('PUT', `/plans/${id}`, { data: sample(), baseVersion: 0 })).status, 400);
  assert.equal((await call('PUT', `/plans/${id}`, { data: sample() })).status, 400);

  const big = { ...sample(), note: 'x'.repeat(600 * 1024) };
  for (const r of [await call('POST', '/plans', { data: big }), await call('PUT', `/plans/${id}`, { data: big, baseVersion: 1 })]) {
    assert.equal(r.status, 413);
    assert.equal(r.body.code, 'PLAN_TOO_LARGE');
    assert.match(r.body.message, /512 KB/);
  }
  assert.equal((await call('GET', '/plans')).body.plans.length, 1);
  assert.equal((await call('GET', `/plans/${id}`)).body.version, 1);
});

test('hồ sơ lưu từ trước khi có nhãn → điền nhãn khi liệt kê, giữ nguyên thời điểm sửa', async () => {
  const { call, id: userId } = await newUser(39);
  const updatedAt = new Date('2026-09-01T08:00:00.000Z');
  const old = await prisma.plan.create({ data: { userId, data: JSON.stringify(sample('2A', 'Cô Mai')), updatedAt } });
  const list = (await call('GET', '/plans')).body.plans;
  assert.equal(list[0].label, 'Cô Mai · Lớp 2A · TH Kim Đồng');
  const row = await prisma.plan.findUnique({ where: { id: old.id } });
  assert.equal(row.label, 'Cô Mai · Lớp 2A · TH Kim Đồng');
  assert.equal(row.updatedAt.toISOString(), updatedAt.toISOString());
});

test('người dùng A không đọc / ghi / xóa được hồ sơ của B', async () => {
  const a = await newUser(35);
  const b = await newUser(36);
  const { id } = await create(b.call, sample('CUA-B'));

  assert.deepEqual((await a.call('GET', '/plans')).body.plans, []);
  assert.equal((await a.call('GET', `/plans/${id}`)).status, 404);
  assert.equal((await a.call('PUT', `/plans/${id}`, { data: sample('CUA-A'), baseVersion: 1 })).status, 404);
  assert.equal((await a.call('PATCH', `/plans/${id}`, { name: 'của A' })).status, 404);
  assert.equal((await a.call('DELETE', `/plans/${id}`, {})).status, 404);

  const got = await b.call('GET', `/plans/${id}`);
  assert.equal(got.body.data.info.className, 'CUA-B');
  assert.equal(got.body.name, '');
  assert.equal(got.body.version, 1);
});
