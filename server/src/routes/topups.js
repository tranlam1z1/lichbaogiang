import { Router } from 'express';
import { prisma } from '../db.js';
import { bankConfigured, transferInfo } from '../lib/bank.js';
import { HttpError, validationError } from '../lib/errors.js';
import { newTopUpCode } from '../lib/topupCode.js';
import { pageResult, paging } from '../lib/paging.js';
import { requireAuth } from '../middleware/auth.js';
import { getSettings } from '../services/settings.js';
import { pointsForAmount, validateTopUpAmount } from '../../../shared/validation.js';

/** Số yêu cầu "Chờ duyệt" tối đa mỗi người, tránh tạo tràn lan. */
export const MAX_PENDING_TOPUPS = 3;
export const TOPUP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export function publicTopUp(t, { withTransfer = false } = {}) {
  return {
    id: t.id,
    code: t.code,
    amountVnd: t.amountVnd,
    points: t.points,
    status: t.status,
    rejectReason: t.rejectReason,
    createdAt: t.createdAt,
    reviewedAt: t.reviewedAt,
    // Chỉ gửi thông tin chuyển khoản khi yêu cầu còn chờ duyệt.
    transfer: withTransfer && t.status === 'PENDING' ? transferInfo(t) : undefined,
  };
}

export const topupsRouter = Router();
topupsRouter.use(requireAuth);

topupsRouter.post('/', async (req, res) => {
  if (!bankConfigured) {
    throw new HttpError(503, 'Chức năng nạp điểm chưa sẵn sàng (chưa cấu hình tài khoản nhận tiền). Vui lòng liên hệ quản trị viên.', {
      code: 'BANK_NOT_CONFIGURED',
    });
  }
  const { topupUnitVnd, pointsPerUnit } = await getSettings();
  const amountVnd = req.body?.amountVnd;
  const err = validateTopUpAmount(amountVnd, topupUnitVnd);
  if (err) throw validationError({ amountVnd: err }, err);

  const pending = await prisma.topUpRequest.count({ where: { userId: req.user.id, status: 'PENDING' } });
  if (pending >= MAX_PENDING_TOPUPS) {
    throw new HttpError(
      409,
      `Bạn đang có ${pending} yêu cầu nạp chờ duyệt. Vui lòng chờ duyệt hoặc hủy bớt trước khi tạo yêu cầu mới.`,
      { code: 'TOO_MANY_PENDING' },
    );
  }

  const data = {
    userId: req.user.id,
    amountVnd: Number(amountVnd),
    points: pointsForAmount(amountVnd, topupUnitVnd, pointsPerUnit),
  };
  // Mã trùng (rất hiếm) thì sinh mã khác.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const topUp = await prisma.topUpRequest.create({ data: { ...data, code: newTopUpCode() } });
      return res.status(201).json({ topUp: publicTopUp(topUp, { withTransfer: true }) });
    } catch (e) {
      if (e.code !== 'P2002') throw e;
    }
  }
  throw new HttpError(500, 'Không tạo được mã nạp, vui lòng thử lại.');
});

/** Lịch sử nạp điểm của chính người dùng. */
topupsRouter.get('/', async (req, res) => {
  const p = paging(req.query);
  const where = { userId: req.user.id };
  if (TOPUP_STATUSES.includes(req.query.status)) where.status = req.query.status;
  const [items, total] = await Promise.all([
    prisma.topUpRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
    prisma.topUpRequest.count({ where }),
  ]);
  res.json(pageResult(items.map((t) => publicTopUp(t, { withTransfer: true })), total, p));
});

topupsRouter.post('/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  const done = await prisma.topUpRequest.updateMany({
    where: { id: Number.isInteger(id) ? id : -1, userId: req.user.id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (done.count !== 1) throw new HttpError(409, 'Chỉ hủy được yêu cầu đang chờ duyệt.', { code: 'NOT_CANCELLABLE' });
  res.json({ ok: true });
});
