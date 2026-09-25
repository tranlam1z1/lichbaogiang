import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, prisma, startServer, validUser } from './helpers.js';

const { approveTopUp, rejectTopUp, REFUND_WINDOW_MS } = await import('../src/services/points.js');

let srv;
before(async () => {
  srv = await startServer();
});
after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

async function newUser(n, { points = 0, free } = {}) {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', validUser(n));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const data = { points };
  if (free !== undefined) data.freeExportsLeft = free;
  await prisma.user.update({ where: { id: r.body.user.id }, data });
  return { call, id: r.body.user.id };
}

const ledger = (userId) => prisma.pointTransaction.findMany({ where: { userId }, orderBy: { id: 'asc' } });

test('đăng ký: tặng 5 lượt miễn phí và ghi sổ cái', async () => {
  const { id } = await newUser(10);
  const rows = await ledger(id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'SIGNUP_BONUS');
  assert.equal(rows[0].freeExports, 5);
  assert.equal(rows[0].freeExportsAfter, 5);
});

test('xuất file: dùng hết 5 lượt miễn phí rồi mới trừ điểm', async () => {
  const { call, id } = await newUser(11, { points: 12 });
  for (let i = 4; i >= 0; i--) {
    const r = await call('POST', '/exports/authorize', { fileType: i % 2 ? 'DOCX' : 'XLSX', confirmCost: 0 });
    assert.equal(r.status, 201);
    assert.equal(r.body.export.chargeType, 'FREE');
    assert.equal(r.body.user.freeExportsLeft, i);
    assert.equal(r.body.user.points, 12);
  }
  // Hết lượt miễn phí mà vẫn gửi confirmCost 0 → phải xác nhận lại, không trừ gì.
  const ask = await call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 0 });
  assert.equal(ask.status, 409);
  assert.equal(ask.body.code, 'CONFIRM_REQUIRED');
  assert.deepEqual(ask.body.details, { cost: 5, points: 12, freeExportsLeft: 0 });

  const paid = await call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 5 });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.export.chargeType, 'POINTS');
  assert.equal(paid.body.user.points, 7);
  await call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 5 });

  const poor = await call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 5 });
  assert.equal(poor.status, 402);
  assert.equal(poor.body.code, 'INSUFFICIENT_POINTS');
  assert.equal(poor.body.details.points, 2);

  const user = await prisma.user.findUnique({ where: { id } });
  assert.equal(user.points, 2);
  const rows = await ledger(id);
  assert.equal(rows.filter((r) => r.type === 'EXPORT').length, 7);
  assert.equal(rows.at(-1).balanceAfter, 2);
});

test('bấm xuất 20 lần cùng lúc: trừ đúng, không bao giờ âm điểm', async () => {
  // 2 lượt miễn phí + 23 điểm (đủ 4 lần × 5 điểm) → đúng 6 lần thành công.
  const { call, id } = await newUser(12, { points: 23, free: 2 });
  const results = await Promise.all(
    Array.from({ length: 20 }, () => call('POST', '/exports/authorize', { fileType: 'XLSX', confirmCost: 5 })),
  );
  const ok = results.filter((r) => r.status === 201);
  const unexpected = results.filter((r) => ![201, 402].includes(r.status));
  assert.deepEqual(unexpected.map((r) => r.body), []);
  assert.equal(ok.length, 6);
  const user = await prisma.user.findUnique({ where: { id } });
  assert.equal(user.points, 3);
  assert.equal(user.freeExportsLeft, 0);
  assert.equal(await prisma.exportLog.count({ where: { userId: id } }), 6);
});

test('tạo file lỗi: hoàn lại đúng lượt / điểm, chỉ một lần', async () => {
  const { call, id } = await newUser(13, { points: 10, free: 1 });
  const free = await call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 0 });
  const paid = await call('POST', '/exports/authorize', { fileType: 'DOCX', confirmCost: 5 });
  assert.equal(paid.body.user.points, 5);

  const r1 = await call('POST', `/exports/${paid.body.exportId}/refund`, { reason: 'lỗi thử' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.user.points, 10);
  const again = await Promise.all([1, 2, 3].map(() => call('POST', `/exports/${paid.body.exportId}/refund`, {})));
  assert.ok(again.every((r) => r.status === 409));

  const r2 = await call('POST', `/exports/${free.body.exportId}/refund`, {});
  assert.equal(r2.body.user.freeExportsLeft, 1);

  const user = await prisma.user.findUnique({ where: { id } });
  assert.equal(user.points, 10);
  assert.equal(user.freeExportsLeft, 1);
  assert.equal((await ledger(id)).filter((r) => r.type === 'EXPORT_REFUND').length, 2);
});

test('không hoàn lại được khi đã hoàn tất, quá hạn, hoặc là lần xuất của người khác', async () => {
  const a = await newUser(14, { free: 3 });
  const b = await newUser(15);
  const done = await a.call('POST', '/exports/authorize', { fileType: 'DOCX' });
  assert.equal((await a.call('POST', `/exports/${done.body.exportId}/complete`, {})).status, 200);
  assert.equal((await a.call('POST', `/exports/${done.body.exportId}/refund`, {})).status, 409);

  const old = await a.call('POST', '/exports/authorize', { fileType: 'DOCX' });
  await prisma.exportLog.update({
    where: { id: old.body.exportId },
    data: { createdAt: new Date(Date.now() - REFUND_WINDOW_MS - 1000) },
  });
  assert.equal((await a.call('POST', `/exports/${old.body.exportId}/refund`, {})).body.code, 'REFUND_EXPIRED');

  const other = await a.call('POST', '/exports/authorize', { fileType: 'DOCX' });
  assert.equal((await b.call('POST', `/exports/${other.body.exportId}/refund`, {})).status, 404);
});

test('xuất file khi chưa đăng nhập bị chặn; loại file sai bị từ chối', async () => {
  const anon = client(srv.base);
  assert.equal((await anon('POST', '/exports/authorize', { fileType: 'DOCX' })).status, 401);
  const { call } = await newUser(16);
  assert.equal((await call('POST', '/exports/authorize', { fileType: 'PDF' })).status, 400);
});

test('nạp điểm: validate số tiền, sinh mã KHBD, QR VietQR, duyệt thì cộng điểm đúng một lần', async () => {
  const { call, id } = await newUser(17);
  for (const bad of [0, 5000, 15000, 10000.5, 'abc', 20_000_000]) {
    const r = await call('POST', '/topups', { amountVnd: bad });
    assert.equal(r.status, 400, `số tiền ${bad}`);
  }
  const r = await call('POST', '/topups', { amountVnd: 50000 });
  assert.equal(r.status, 201);
  const t = r.body.topUp;
  assert.match(t.code, /^KHBD[A-Z2-9]{6}$/);
  assert.equal(t.points, 500);
  assert.equal(t.status, 'PENDING');
  assert.equal(t.transfer.content, t.code);
  assert.match(t.transfer.qrUrl, /^https:\/\/img\.vietqr\.io\/image\/970436-0123456789-compact2\.png\?amount=50000&addInfo=KHBD/);

  await Promise.all([approveTopUp(t.id, null), approveTopUp(t.id, null)].map((p) => p.catch((e) => e)));
  const user = await prisma.user.findUnique({ where: { id } });
  assert.equal(user.points, 500);
  const topupRows = (await ledger(id)).filter((x) => x.type === 'TOPUP');
  assert.equal(topupRows.length, 1);
  assert.equal(topupRows[0].balanceAfter, 500);

  const list = await call('GET', '/topups');
  assert.equal(list.body.items[0].status, 'APPROVED');
  assert.equal(list.body.items[0].transfer, undefined);
});

test('nạp điểm: từ chối cần lý do, hủy yêu cầu, tối đa 3 yêu cầu chờ duyệt', async () => {
  const { call } = await newUser(18);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await call('POST', '/topups', { amountVnd: 10000 })).body.topUp.id);
  assert.equal((await call('POST', '/topups', { amountVnd: 10000 })).body.code, 'TOO_MANY_PENDING');

  await assert.rejects(rejectTopUp(ids[0], null, '  '), /lý do/);
  const rejected = await rejectTopUp(ids[0], null, 'Chưa nhận được tiền');
  assert.equal(rejected.status, 'REJECTED');
  assert.equal((await call('POST', `/topups/${ids[1]}/cancel`, {})).status, 200);
  assert.equal((await call('POST', `/topups/${ids[1]}/cancel`, {})).status, 409);
  assert.equal((await call('POST', '/topups', { amountVnd: 20000 })).status, 201);
});

test('cài đặt công khai', async () => {
  const r = await client(srv.base)('GET', '/settings/public');
  assert.deepEqual(r.body, {
    freeExportsForNewUser: 5,
    pointsPerExport: 5,
    topupUnitVnd: 10000,
    pointsPerUnit: 100,
    topupEnabled: true,
    topupAuto: true,
    bankName: 'Vietcombank',
  });
});
