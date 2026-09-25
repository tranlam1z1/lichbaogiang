import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, prisma, startServer, validUser } from './helpers.js';

const { extractTopUpCodes } = await import('../src/lib/topupCode.js');

const KEY = process.env.SEPAY_WEBHOOK_API_KEY;
let srv;
let admin;
let nextTxId = 1000;

async function newUser(n) {
  const call = client(srv.base);
  const r = await call('POST', '/auth/register', validUser(n));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { call, id: r.body.user.id };
}

/** Gửi webhook giống SePay. */
async function hook(body, { key = KEY } = {}) {
  const res = await fetch(`${srv.base}/webhooks/sepay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Apikey ${key}` }) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const incoming = (amount, content, extra = {}) => ({
  id: nextTxId++,
  gateway: 'MBBank',
  transactionDate: '2026-09-26 10:00:00',
  accountNumber: '0123456789',
  subAccount: null,
  code: null,
  content,
  transferType: 'in',
  description: content,
  transferAmount: amount,
  accumulated: 0,
  referenceCode: `FT${nextTxId}`,
  ...extra,
});

const points = async (id) => (await prisma.user.findUnique({ where: { id } })).points;

before(async () => {
  srv = await startServer();
  const a = await newUser(60);
  await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
  admin = a.call;
});
after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test('tìm mã nạp trong nội dung chuyển khoản ngân hàng', () => {
  assert.deepEqual(extractTopUpCodes('MBVCB.123456.KHBD7K3QPA.CT tu 0123 NGUYEN VAN A'), ['KHBD7K3QPA']);
  assert.deepEqual(extractTopUpCodes('khbd7k3qpa chuyen tien'), ['KHBD7K3QPA']);
  assert.deepEqual(extractTopUpCodes('KHBD 7K3 QPA'), ['KHBD7K3QPA']);
  assert.deepEqual(extractTopUpCodes('chuyen tien an trua'), []);
});

test('webhook: sai / thiếu API key bị từ chối, không ghi gì', async () => {
  assert.equal((await hook(incoming(10000, 'x'), { key: 'sai-key' })).status, 401);
  assert.equal((await hook(incoming(10000, 'x'), { key: null })).status, 401);
  assert.equal(await prisma.bankTransaction.count(), 0);
});

test('webhook: đúng mã + đúng số tiền → tự cộng điểm ngay; gửi lại không cộng lần hai', async () => {
  const u = await newUser(61);
  const { topUp } = (await u.call('POST', '/topups', { amountVnd: 50000 })).body;
  const body = incoming(50000, `MBVCB.9876.${topUp.code}.CT tu NGUYEN VAN A`);

  const r = await hook(body);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true, status: 'AUTO_APPROVED', duplicate: false });
  assert.equal(await points(u.id), topUp.points);
  const t = await prisma.topUpRequest.findUnique({ where: { id: topUp.id } });
  assert.equal(t.status, 'APPROVED');
  assert.equal(t.reviewedById, null);

  const again = await hook(body);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(await points(u.id), topUp.points);

  const ledger = await prisma.pointTransaction.findMany({ where: { userId: u.id, type: 'TOPUP' } });
  assert.equal(ledger.length, 1);
  assert.match(ledger[0].note, /tự động/);

  // Người dùng thấy ngay trạng thái đã cộng; admin thấy là duyệt tự động.
  const mine = await u.call('GET', '/topups');
  assert.equal(mine.body.items[0].status, 'APPROVED');
  const list = await admin('GET', `/admin/topups?status=APPROVED&q=${topUp.code}`);
  assert.equal(list.body.items[0].autoApproved, true);
});

test('webhook gửi trùng 10 lần cùng lúc → chỉ cộng điểm một lần', async () => {
  const u = await newUser(62);
  const { topUp } = (await u.call('POST', '/topups', { amountVnd: 20000 })).body;
  const body = incoming(20000, topUp.code);
  const results = await Promise.all(Array.from({ length: 10 }, () => hook(body)));
  assert.ok(results.every((r) => r.status === 200 && r.body.success), JSON.stringify(results.map((r) => r.body)));
  assert.equal(results.filter((r) => !r.body.duplicate).length, 1);
  assert.equal(await points(u.id), topUp.points);
  assert.equal(await prisma.bankTransaction.count({ where: { providerTxId: String(body.id) } }), 1);
});

test('lệch số tiền → không tự cộng, admin gán tay được', async () => {
  const u = await newUser(63);
  const { topUp } = (await u.call('POST', '/topups', { amountVnd: 30000 })).body;
  const r = await hook(incoming(20000, topUp.code));
  assert.equal(r.body.status, 'AMOUNT_MISMATCH');
  assert.equal(await points(u.id), 0);

  const count = await admin('GET', '/admin/topups/pending-count');
  assert.ok(count.body.bankReview >= 1);
  const review = await admin('GET', '/admin/bank-transactions');
  const item = review.body.items.find((b) => b.matchedCode === topUp.code);
  assert.equal(item.topUp.user.id, u.id);
  assert.match(item.note, /30\.000/);

  const assigned = await admin('POST', `/admin/bank-transactions/${item.id}/assign`, { code: topUp.code });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  assert.equal(assigned.body.bankTx.status, 'RESOLVED');
  assert.equal(await points(u.id), topUp.points);
  // Không gán lại được lần hai.
  assert.equal((await admin('POST', `/admin/bank-transactions/${item.id}/assign`, { code: topUp.code })).status, 409);
});

test('người dùng lỡ hủy rồi tiền mới về → NOT_PENDING, admin vẫn gán được', async () => {
  const u = await newUser(64);
  const { topUp } = (await u.call('POST', '/topups', { amountVnd: 10000 })).body;
  await u.call('POST', `/topups/${topUp.id}/cancel`, {});
  const r = await hook(incoming(10000, topUp.code));
  assert.equal(r.body.status, 'NOT_PENDING');
  const bankTx = await prisma.bankTransaction.findFirst({ where: { matchedCode: topUp.code } });
  const assigned = await admin('POST', `/admin/bank-transactions/${bankTx.id}/assign`, { code: topUp.code });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.topUp.status, 'APPROVED');
  assert.equal(await points(u.id), topUp.points);
});

test('không có mã / mã không tồn tại / tiền ra / tài khoản khác', async () => {
  assert.equal((await hook(incoming(10000, 'chuyen tien an trua'))).body.status, 'NO_CODE');
  assert.equal((await hook(incoming(10000, 'KHBDZZZZZZ'))).body.status, 'NOT_FOUND');
  assert.deepEqual((await hook(incoming(10000, 'x', { transferType: 'out' }))).body, { success: true, ignored: true });
  assert.equal((await hook(incoming(10000, 'KHBDZZZZZZ', { accountNumber: '999999' }))).body.status, 'OTHER_ACCOUNT');
  assert.equal((await hook({ id: 1, transferType: 'in' })).status, 400);

  const noCode = await prisma.bankTransaction.findFirst({ where: { status: 'NO_CODE' } });
  assert.equal((await admin('POST', `/admin/bank-transactions/${noCode.id}/dismiss`, { note: '' })).status, 400);
  const d = await admin('POST', `/admin/bank-transactions/${noCode.id}/dismiss`, { note: 'Đã hoàn tiền cho người chuyển' });
  assert.equal(d.body.bankTx.status, 'DISMISSED');
  // Gán vào mã không tồn tại → 404, giao dịch vẫn chờ xử lý.
  const nf = await prisma.bankTransaction.findFirst({ where: { status: 'NOT_FOUND' } });
  assert.equal((await admin('POST', `/admin/bank-transactions/${nf.id}/assign`, { code: 'KHBDAAAAAA' })).status, 404);
  assert.equal((await prisma.bankTransaction.findUnique({ where: { id: nf.id } })).status, 'NOT_FOUND');
});
