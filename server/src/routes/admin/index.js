// Mọi route /api/admin/* chỉ dành cho role ADMIN (kiểm tra ở server, không tin frontend).
import { Router } from 'express';
import { prisma } from '../../db.js';
import { dateRangeWhere, startOfTodayVN, startOfWeekVN } from '../../lib/dates.js';
import { validationError } from '../../lib/errors.js';
import { pageResult, paging } from '../../lib/paging.js';
import { requireAdmin } from '../../middleware/auth.js';
import { BANK_TX_STATUSES, NEEDS_REVIEW, assignBankTx, dismissBankTx } from '../../services/bankTransactions.js';
import { approveTopUp, rejectTopUp } from '../../services/points.js';
import { SETTING_DEFS, getSettings, updateSettings } from '../../services/settings.js';
import { publicExport } from '../exports.js';
import { TOPUP_STATUSES, publicTopUp } from '../topups.js';
import { TRANSACTION_TYPES, publicTransaction, userBrief, userFilter } from './shared.js';
import { usersRouter } from './users.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// ---------- Tổng quan ----------
adminRouter.get('/stats', async (req, res) => {
  const today = startOfTodayVN();
  const week = startOfWeekVN();
  const notRefunded = { status: { not: 'REFUNDED' } };
  const [
    totalUsers,
    newToday,
    newThisWeek,
    lockedUsers,
    totalExports,
    exportsToday,
    exportsByType,
    topUpSum,
    pendingTopUps,
    pointsOutstanding,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.user.count({ where: { isLocked: true } }),
    prisma.exportLog.count({ where: notRefunded }),
    prisma.exportLog.count({ where: { ...notRefunded, createdAt: { gte: today } } }),
    prisma.exportLog.groupBy({ by: ['fileType', 'chargeType'], where: notRefunded, _count: { _all: true } }),
    prisma.topUpRequest.aggregate({ where: { status: 'APPROVED' }, _sum: { amountVnd: true, points: true }, _count: { _all: true } }),
    prisma.topUpRequest.count({ where: { status: 'PENDING' } }),
    prisma.user.aggregate({ _sum: { points: true } }),
  ]);
  const count = (pred) => exportsByType.filter(pred).reduce((s, r) => s + r._count._all, 0);
  res.json({
    users: { total: totalUsers, newToday, newThisWeek, locked: lockedUsers },
    exports: {
      total: totalExports,
      today: exportsToday,
      docx: count((r) => r.fileType === 'DOCX'),
      xlsx: count((r) => r.fileType === 'XLSX'),
      free: count((r) => r.chargeType === 'FREE'),
      paid: count((r) => r.chargeType === 'POINTS'),
    },
    topUps: {
      totalVnd: topUpSum._sum.amountVnd || 0,
      totalPoints: topUpSum._sum.points || 0,
      approvedCount: topUpSum._count._all,
      pending: pendingTopUps,
    },
    pointsOutstanding: pointsOutstanding._sum.points || 0,
  });
});

// ---------- Người dùng ----------
adminRouter.use('/users', usersRouter);

// ---------- Duyệt nạp điểm ----------
/** Số yêu cầu chờ duyệt + số giao dịch ngân hàng cần kiểm tra — hiện trên tab điều hướng của mọi trang quản trị. */
adminRouter.get('/topups/pending-count', async (req, res) => {
  const [count, bankReview] = await Promise.all([
    prisma.topUpRequest.count({ where: { status: 'PENDING' } }),
    prisma.bankTransaction.count({ where: { status: { in: NEEDS_REVIEW } } }),
  ]);
  res.json({ count, bankReview });
});

adminRouter.get('/topups', async (req, res) => {
  const p = paging(req.query);
  const where = {};
  if (TOPUP_STATUSES.includes(req.query.status)) where.status = req.query.status;
  const byUser = userFilter(req.query);
  const code = String(req.query.q || '').trim().toUpperCase();
  if (/^KHBD/.test(code)) where.code = { contains: code };
  else if (byUser) Object.assign(where, byUser);
  const createdAt = dateRangeWhere(req.query.from, req.query.to);
  if (createdAt) where.createdAt = createdAt;
  const [items, total] = await Promise.all([
    prisma.topUpRequest.findMany({
      where,
      // Chờ duyệt: cũ nhất lên trước (xử lý theo thứ tự); các trạng thái khác: mới nhất lên trước.
      orderBy: { createdAt: where.status === 'PENDING' ? 'asc' : 'desc' },
      skip: p.skip,
      take: p.take,
      include: {
        user: userBrief,
        reviewedBy: { select: { id: true, username: true } },
        bankTxs: { where: { status: 'AUTO_APPROVED' }, select: { id: true } },
      },
    }),
    prisma.topUpRequest.count({ where }),
  ]);
  res.json(
    pageResult(
      items.map((t) => ({
        ...publicTopUp(t),
        user: t.user,
        reviewedBy: t.reviewedBy,
        autoApproved: t.bankTxs.length > 0,
      })),
      total,
      p,
    ),
  );
});

adminRouter.post('/topups/:id/approve', async (req, res) => {
  const { topUp, user } = await approveTopUp(Number(req.params.id) || -1, req.user.id);
  res.json({ topUp: publicTopUp(topUp), user: { id: user.id, username: user.username, points: user.points } });
});

adminRouter.post('/topups/:id/reject', async (req, res) => {
  const topUp = await rejectTopUp(Number(req.params.id) || -1, req.user.id, req.body?.reason);
  res.json({ topUp: publicTopUp(topUp) });
});

// ---------- Giao dịch ngân hàng (webhook SePay) ----------
function publicBankTx(b) {
  return {
    id: b.id,
    gateway: b.gateway,
    accountNumber: b.accountNumber,
    amountVnd: b.amountVnd,
    content: b.content,
    referenceCode: b.referenceCode,
    transactionDate: b.transactionDate,
    matchedCode: b.matchedCode,
    status: b.status,
    note: b.note,
    createdAt: b.createdAt,
    resolvedAt: b.resolvedAt,
    resolvedBy: b.resolvedBy ?? null,
    topUp: b.topUp ? { id: b.topUp.id, code: b.topUp.code, status: b.topUp.status, amountVnd: b.topUp.amountVnd, points: b.topUp.points, user: b.topUp.user } : null,
  };
}

/** ?status=REVIEW (mặc định: các giao dịch cần admin xử lý) | một trạng thái cụ thể | ALL */
adminRouter.get('/bank-transactions', async (req, res) => {
  const p = paging(req.query);
  const status = req.query.status || 'REVIEW';
  const where = {};
  if (status === 'REVIEW') where.status = { in: NEEDS_REVIEW };
  else if (BANK_TX_STATUSES.includes(status)) where.status = status;
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ content: { contains: q } }, { matchedCode: { contains: q.toUpperCase() } }, { referenceCode: { contains: q } }];
  const createdAt = dateRangeWhere(req.query.from, req.query.to);
  if (createdAt) where.createdAt = createdAt;
  const [items, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: { createdAt: status === 'REVIEW' ? 'asc' : 'desc' },
      skip: p.skip,
      take: p.take,
      include: { topUp: { include: { user: userBrief } }, resolvedBy: { select: { id: true, username: true } } },
    }),
    prisma.bankTransaction.count({ where }),
  ]);
  res.json(pageResult(items.map(publicBankTx), total, p));
});

adminRouter.post('/bank-transactions/:id/assign', async (req, res) => {
  const { topUp, user, bankTx } = await assignBankTx(Number(req.params.id) || -1, req.user.id, req.body?.code);
  res.json({ bankTx: publicBankTx(bankTx), topUp: publicTopUp(topUp), user: { id: user.id, username: user.username, points: user.points } });
});

adminRouter.post('/bank-transactions/:id/dismiss', async (req, res) => {
  const bankTx = await dismissBankTx(Number(req.params.id) || -1, req.user.id, req.body?.note);
  res.json({ bankTx: publicBankTx(bankTx) });
});

// ---------- Lịch sử giao dịch ----------
adminRouter.get('/transactions', async (req, res) => {
  const p = paging(req.query, { defaultSize: 30 });
  const where = { ...userFilter(req.query) };
  if (TRANSACTION_TYPES.includes(req.query.type)) where.type = req.query.type;
  const createdAt = dateRangeWhere(req.query.from, req.query.to);
  if (createdAt) where.createdAt = createdAt;
  const [items, total, sums] = await Promise.all([
    prisma.pointTransaction.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: p.skip,
      take: p.take,
      include: { user: userBrief, actor: { select: { id: true, username: true } } },
    }),
    prisma.pointTransaction.count({ where }),
    prisma.pointTransaction.aggregate({ where, _sum: { points: true, freeExports: true } }),
  ]);
  res.json({
    ...pageResult(items.map(publicTransaction), total, p),
    sum: { points: sums._sum.points || 0, freeExports: sums._sum.freeExports || 0 },
  });
});

// ---------- Lịch sử xuất file ----------
adminRouter.get('/exports', async (req, res) => {
  const p = paging(req.query, { defaultSize: 30 });
  const where = { ...userFilter(req.query) };
  if (['DOCX', 'XLSX'].includes(req.query.fileType)) where.fileType = req.query.fileType;
  if (['AUTHORIZED', 'COMPLETED', 'REFUNDED'].includes(req.query.status)) where.status = req.query.status;
  if (['FREE', 'POINTS'].includes(req.query.chargeType)) where.chargeType = req.query.chargeType;
  const createdAt = dateRangeWhere(req.query.from, req.query.to);
  if (createdAt) where.createdAt = createdAt;
  const [items, total] = await Promise.all([
    prisma.exportLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { user: userBrief } }),
    prisma.exportLog.count({ where }),
  ]);
  res.json(pageResult(items.map((e) => ({ ...publicExport(e), user: e.user, refundReason: e.refundReason })), total, p));
});

// ---------- Cài đặt ----------
async function settingsResponse() {
  const values = await getSettings();
  const rows = await prisma.setting.findMany({ where: { updatedById: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 1 });
  return {
    values,
    defs: Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => [k, { label: d.label, min: d.min, max: d.max, default: d.default }])),
    lastUpdatedAt: rows[0]?.updatedAt ?? null,
  };
}

adminRouter.get('/settings', async (req, res) => {
  res.json(await settingsResponse());
});

adminRouter.put('/settings', async (req, res) => {
  const { errors } = await updateSettings(req.body?.values, req.user.id);
  if (Object.keys(errors).length) throw validationError(errors);
  res.json(await settingsResponse());
});
