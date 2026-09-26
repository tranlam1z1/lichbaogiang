import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, prisma, startServer, validUser } from './helpers.js';

const { extractTopUpCodes } = await import('../src/services/bankTransfers.js');

let srv;
let admin;
let txSeq = 1000;

async function newUser(n) {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', validUser(n));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { call, id: r.body.user.id };
}

async function newTopUp(user, amountVnd = 50000) {
  const r = await user.call('POST', '/topups', { amountVnd });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.topUp;
}

/** Gửi webhook giống SePay; overrides ghi đè từng trường. */
async function sepay(overrides = {}, { key = 'test-sepay-key' } = {}) {
  const body = {
    id: ++txSeq,
    gateway: 'MBBank',
    transactionDate: '2026-09-26 10:15:00',
    accountNumber: '0123456789',
    code: null,
    content: '',
    transferType: 'in',
    transferAmount: 50000,
    accumulated: 1000000,
    subAccount: null,
    referenceCode: `FT${txSeq}`,
    description: '',
    ...overrides,
  };
  const res = await fetch(`${srv.base}/webhooks/sepay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Apikey ${key}` }) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), sent: body };
}

const points = async (id) => (await prisma.user.findUnique({ where: { id } })).points;
const bankTx = (providerTxId) =>
  prisma.bankTransaction.findUnique({ where: { provider_providerTxId: { provider: 'SEPAY', providerTxId: String(providerTxId) } } });

before(async () => {
  srv = await startServer();
  const a = await newUser(50);
  await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
  admin = a.call;
});
after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test('tách mã nạp khỏi nội dung ngân hàng', () => {
  assert.deepEqual(extractTopUpCodes('MBVCB.123.khbdab23cd.CT tu 0123'), ['KHBDAB23CD']);
  assert.deepEqual(extractTopUpCodes('KHBDAB23CDXYZ chuyen tien', null, 'KHBDAB23CD'), ['KHBDAB23CD']);
  assert.deepEqual(extractTopUpCodes('chuyen tien'), []);
});

test('sai hoặc thiếu API Key → 401, không lưu gì', async () => {
  assert.equal((await sepay({}, { key: 'sai' })).status, 401);
  assert.equal((await sepay({}, { key: null })).status, 401);
  assert.equal(await prisma.bankTransaction.count(), 0);
});

test('đúng mã + đúng số tiền → tự cộng điểm, SePay gửi lại cũng không cộng trùng', async () => {
  const u = await newUser(51);
  const t = await newTopUp(u, 50000);
  const r = await sepay({ content: `${t.code.toLowerCase()} FT26269` });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true });
  assert.equal(await points(u.id), t.points);

  const topUp = await prisma.topUpRequest.findUnique({ where: { id: t.id } });
  assert.equal(topUp.status, 'APPROVED');
  assert.equal(topUp.reviewedById, null);
  const row = await bankTx(r.sent.id);
  assert.equal(row.status, 'MATCHED');
  assert.equal(row.topUpId, t.id);
  const ledger = await prisma.pointTransaction.findFirst({ where: { topUpId: t.id } });
  assert.match(ledger.note, /tự động qua SePay/);

  // Gửi lại cùng id (tuần tự và song song).
  assert.equal((await sepay({ id: r.sent.id, content: t.code })).status, 200);
  await Promise.all(Array.from({ length: 5 }, () => sepay({ id: r.sent.id, content: t.code })));
  assert.equal(await points(u.id), t.points);
  assert.equal(await prisma.bankTransaction.count({ where: { providerTxId: String(r.sent.id) } }), 1);

  // Người dùng thấy đã cộng điểm; admin thấy "tự động".
  const list = await admin('GET', '/admin/topups?status=APPROVED');
  assert.equal(list.body.items.find((x) => x.id === t.id).autoApproved, true);
});

test('người dùng lỡ hủy sau khi đã chuyển → vẫn tự cộng điểm', async () => {
  const u = await newUser(52);
  const t = await newTopUp(u, 20000);
  assert.equal((await u.call('POST', `/topups/${t.id}/cancel`, {})).status, 200);
  await sepay({ content: `CT ${t.code}`, transferAmount: 20000 });
  assert.equal(await points(u.id), t.points);
});

test('các trường hợp không chắc chắn → UNMATCHED, không cộng điểm', async () => {
  const u = await newUser(53);
  const t = await newTopUp(u, 50000);

  const wrongAmount = await sepay({ content: t.code, transferAmount: 40000 });
  assert.equal(wrongAmount.status, 200);
  const noCode = await sepay({ content: 'chuyen tien nap diem' });
  const unknown = await sepay({ content: 'KHBDZZZZZZ' });
  assert.equal(await points(u.id), 0);

  let row = await bankTx(wrongAmount.sent.id);
  assert.equal(row.status, 'UNMATCHED');
  assert.equal(row.topUpId, t.id);
  assert.match(row.note, /khác số tiền yêu cầu/);
  assert.equal((await bankTx(noCode.sent.id)).status, 'UNMATCHED');
  assert.match((await bankTx(unknown.sent.id)).note, /Không có yêu cầu nạp/);

  // Chuyển trùng lần hai cho yêu cầu đã duyệt.
  await sepay({ content: t.code });
  assert.equal(await points(u.id), t.points);
  const again = await sepay({ content: t.code });
  row = await bankTx(again.sent.id);
  assert.equal(row.status, 'UNMATCHED');
  assert.match(row.note, /đã được duyệt/);
  assert.equal(await points(u.id), t.points);

  const count = await admin('GET', '/admin/topups/pending-count');
  assert.ok(count.body.unmatchedBank >= 4);
});

test('tiền ra / khác tài khoản → IGNORED', async () => {
  const u = await newUser(54);
  const t = await newTopUp(u);
  const out = await sepay({ content: t.code, transferType: 'out' });
  const other = await sepay({ content: t.code, accountNumber: '999999999' });
  assert.equal((await bankTx(out.sent.id)).status, 'IGNORED');
  assert.equal((await bankTx(other.sent.id)).status, 'IGNORED');
  assert.equal(await points(u.id), 0);
});

test('dữ liệu sai định dạng → 400', async () => {
  assert.equal((await sepay({ transferAmount: 'abc' })).status, 400);
  assert.equal((await sepay({ id: null })).status, 400);
});

test('admin gán giao dịch chưa khớp vào yêu cầu nạp, hoặc đánh dấu đã xử lý', async () => {
  const u = await newUser(55);
  const t = await newTopUp(u, 30000);
  const typo = await sepay({ content: 'nap diem KHBD sai ma', transferAmount: 30000 });
  const row = await bankTx(typo.sent.id);
  assert.equal(row.status, 'UNMATCHED');

  const list = await admin('GET', '/admin/bank-transactions?status=UNMATCHED');
  assert.ok(list.body.items.some((b) => b.id === row.id));

  assert.equal((await u.call('POST', `/admin/bank-transactions/${row.id}/assign`, { code: t.code })).status, 403);
  assert.equal((await admin('POST', `/admin/bank-transactions/${row.id}/assign`, { code: 'KHBDZZZZZZ' })).status, 404);
  const ok = await admin('POST', `/admin/bank-transactions/${row.id}/assign`, { code: t.code.toLowerCase() });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.user.points, t.points);
  assert.equal((await bankTx(typo.sent.id)).status, 'MATCHED');
  // Gán lần hai → 409, không cộng thêm.
  assert.equal((await admin('POST', `/admin/bank-transactions/${row.id}/assign`, { code: t.code })).status, 409);
  assert.equal(await points(u.id), t.points);

  const stray = await sepay({ content: 'ung ho', transferAmount: 15000 });
  const strayRow = await bankTx(stray.sent.id);
  assert.equal((await admin('POST', `/admin/bank-transactions/${strayRow.id}/resolve`, { note: '' })).status, 400);
  assert.equal((await admin('POST', `/admin/bank-transactions/${strayRow.id}/resolve`, { note: 'Đã hoàn tiền' })).status, 200);
  const resolved = await bankTx(stray.sent.id);
  assert.equal(resolved.status, 'RESOLVED');
  assert.match(resolved.note, /Admin: Đã hoàn tiền/);
});
