import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { planWriteLimiter } from '../middleware/rateLimit.js';

/** Kích thước tối đa của kế hoạch (JSON). Body parser của route này đặt rộng hơn một chút, xem app.js. */
export const MAX_PLAN_BYTES = 512 * 1024;

// Trường chỉ dùng cho giao diện (mục đang mở, tuần đang chọn) — không lưu lên server.
const UI_ONLY_KEYS = ['tab', 'selectedWeekId'];

function conflict(plan) {
  return new HttpError(409, 'Kế hoạch đã được sửa ở máy hoặc trình duyệt khác.', {
    code: 'PLAN_CONFLICT',
    details: { version: plan?.version ?? 0, updatedAt: plan?.updatedAt ?? null },
  });
}

export const planRouter = Router();
planRouter.use(requireAuth);

/** Kế hoạch của chính người dùng; chưa có thì data = null, version = 0. */
planRouter.get('/', async (req, res) => {
  const plan = await prisma.plan.findUnique({ where: { userId: req.user.id } });
  if (!plan) return res.json({ data: null, version: 0, updatedAt: null });
  res.json({ data: JSON.parse(plan.data), version: plan.version, updatedAt: plan.updatedAt });
});

/**
 * Lưu kế hoạch. body: { data, baseVersion } — baseVersion là version client đang sửa (0 = tạo mới).
 * Ghi có điều kiện trong một câu lệnh nên hai máy lưu cùng lúc thì chỉ một máy thắng, máy kia nhận 409.
 */
planRouter.put('/', planWriteLimiter, async (req, res) => {
  const { data, baseVersion } = req.body || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw validationError({ data: 'Dữ liệu kế hoạch không hợp lệ.' });
  }
  if (!Number.isInteger(baseVersion) || baseVersion < 0) {
    throw validationError({ baseVersion: 'Thiếu phiên bản của kế hoạch.' });
  }
  const clean = { ...data };
  UI_ONLY_KEYS.forEach((k) => delete clean[k]);
  const text = JSON.stringify(clean);
  if (Buffer.byteLength(text, 'utf8') > MAX_PLAN_BYTES) {
    throw new HttpError(413, 'Kế hoạch quá lớn (tối đa 512 KB), chưa lưu được lên tài khoản. Hãy tải file sao lưu .json để giữ dữ liệu.', {
      code: 'PLAN_TOO_LARGE',
    });
  }

  const userId = req.user.id;
  const now = new Date();
  if (baseVersion === 0) {
    try {
      const plan = await prisma.plan.create({ data: { userId, data: text, version: 1, updatedAt: now } });
      return res.json({ version: plan.version, updatedAt: plan.updatedAt });
    } catch (e) {
      // Đã có kế hoạch (máy khác vừa tạo) → trùng userId.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict(await prisma.plan.findUnique({ where: { userId } }));
      }
      throw e;
    }
  }

  const { count } = await prisma.plan.updateMany({
    where: { userId, version: baseVersion },
    data: { data: text, version: { increment: 1 }, updatedAt: now },
  });
  if (count === 0) throw conflict(await prisma.plan.findUnique({ where: { userId } }));
  res.json({ version: baseVersion + 1, updatedAt: now });
});
