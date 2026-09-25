import { Router } from 'express';
import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { prisma } from '../../db.js';
import { HttpError, validationError } from '../../lib/errors.js';
import { pageResult, paging } from '../../lib/paging.js';
import { setSessionCookie } from '../../lib/session.js';
import { publicUser } from '../../lib/users.js';
import { adjustPoints, resetFreeExports } from '../../services/points.js';
import { getSettings } from '../../services/settings.js';
import { validatePassword } from '../../../../shared/validation.js';
import { BCRYPT_ROUNDS } from '../auth.js';
import { publicExport } from '../exports.js';
import { publicTopUp } from '../topups.js';
import { publicTransaction, userSearchWhere } from './shared.js';

export const ROLES = ['USER', 'ADMIN'];

/** Thông tin người dùng cho admin: như publicUser + trạng thái khóa, lần đăng nhập cuối. */
export function adminUser(u) {
  return {
    ...publicUser(u),
    isLocked: u.isLocked,
    lockReason: u.lockReason,
    lastLoginAt: u.lastLoginAt,
    updatedAt: u.updatedAt,
    exportCount: u._count?.exports,
  };
}

const SORTS = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  points: { points: 'desc' },
  username: { username: 'asc' },
};

async function loadUser(id) {
  const n = Number(id);
  const user = Number.isInteger(n) ? await prisma.user.findUnique({ where: { id: n } }) : null;
  if (!user) throw new HttpError(404, 'Không tìm thấy người dùng.', { code: 'NOT_FOUND' });
  return user;
}

/** Mật khẩu tạm dễ đọc: 10 ký tự, luôn có chữ và số, bỏ ký tự dễ nhầm. */
function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  let s = letters[randomInt(letters.length)] + digits[randomInt(digits.length)];
  while (s.length < 10) s += all[randomInt(all.length)];
  return s;
}

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  const p = paging(req.query);
  const where = { AND: [] };
  const search = userSearchWhere(req.query.q);
  if (search) where.AND.push(search);
  if (ROLES.includes(req.query.role)) where.AND.push({ role: req.query.role });
  if (req.query.status === 'locked') where.AND.push({ isLocked: true });
  if (req.query.status === 'active') where.AND.push({ isLocked: false });
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: SORTS[req.query.sort] || SORTS.newest,
      skip: p.skip,
      take: p.take,
      include: { _count: { select: { exports: { where: { status: { not: 'REFUNDED' } } } } } },
    }),
    prisma.user.count({ where }),
  ]);
  res.json(pageResult(items.map(adminUser), total, p));
});

usersRouter.get('/:id', async (req, res) => {
  const user = await loadUser(req.params.id);
  const [transactions, exports, topUps, exportCount, topUpSum] = await Promise.all([
    prisma.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { id: 'desc' },
      take: 10,
      include: { actor: { select: { id: true, username: true } } },
    }),
    prisma.exportLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.topUpRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.exportLog.count({ where: { userId: user.id, status: { not: 'REFUNDED' } } }),
    prisma.topUpRequest.aggregate({ where: { userId: user.id, status: 'APPROVED' }, _sum: { amountVnd: true } }),
  ]);
  res.json({
    user: { ...adminUser(user), exportCount, totalTopUpVnd: topUpSum._sum.amountVnd || 0 },
    transactions: transactions.map(publicTransaction),
    exports: exports.map(publicExport),
    topUps: topUps.map((t) => publicTopUp(t)),
  });
});

/** Khóa / mở khóa. Khóa bắt buộc lý do và đăng xuất người đó khỏi mọi thiết bị. */
usersRouter.post('/:id/lock', async (req, res) => {
  const user = await loadUser(req.params.id);
  const locked = Boolean(req.body?.locked);
  const reason = String(req.body?.reason || '').trim();
  if (locked && user.id === req.user.id) throw new HttpError(400, 'Bạn không thể tự khóa tài khoản của mình.');
  if (locked && !reason) throw validationError({ reason: 'Vui lòng nhập lý do khóa.' }, 'Vui lòng nhập lý do khóa.');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: locked
      ? { isLocked: true, lockReason: reason.slice(0, 300), tokenVersion: { increment: 1 } }
      : { isLocked: false, lockReason: null },
  });
  res.json({ user: adminUser(updated) });
});

/**
 * Đặt lại mật khẩu. Không gửi password → hệ thống tạo mật khẩu tạm và trả về MỘT LẦN để admin báo cho người dùng.
 * Mọi phiên đăng nhập cũ của người đó bị hủy.
 */
usersRouter.post('/:id/reset-password', async (req, res) => {
  const user = await loadUser(req.params.id);
  const given = req.body?.password;
  const password = given ? String(given) : tempPassword();
  if (given) {
    const err = validatePassword(password);
    if (err) throw validationError({ password: err }, err);
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  // Admin tự đặt lại mật khẩu của mình: cấp phiên mới để không bị đăng xuất.
  if (updated.id === req.user.id) setSessionCookie(res, updated);
  res.json({ user: adminUser(updated), temporaryPassword: given ? undefined : password });
});

usersRouter.post('/:id/role', async (req, res) => {
  const user = await loadUser(req.params.id);
  const role = String(req.body?.role || '');
  if (!ROLES.includes(role)) throw validationError({ role: 'Quyền không hợp lệ.' }, 'Quyền không hợp lệ.');
  if (user.id === req.user.id && role !== 'ADMIN') {
    throw new HttpError(400, 'Bạn không thể tự bỏ quyền quản trị của mình.');
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: user.id }, data: { role } });
    if ((await tx.user.count({ where: { role: 'ADMIN' } })) === 0) {
      throw new HttpError(400, 'Hệ thống phải còn ít nhất một quản trị viên.');
    }
    return u;
  });
  res.json({ user: adminUser(updated) });
});

usersRouter.post('/:id/points', async (req, res) => {
  const user = await loadUser(req.params.id);
  const { user: updated } = await adjustPoints(user.id, req.body?.delta, req.user.id, req.body?.reason);
  res.json({ user: adminUser(updated) });
});

usersRouter.post('/:id/free-exports', async (req, res) => {
  const user = await loadUser(req.params.id);
  const value = req.body?.value ?? (await getSettings()).freeExportsForNewUser;
  const { user: updated } = await resetFreeExports(user.id, value, req.user.id, req.body?.reason);
  res.json({ user: adminUser(updated) });
});
