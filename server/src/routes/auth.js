import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../lib/errors.js';
import { clearSessionCookie, setSessionCookie } from '../lib/session.js';
import { lockedMessage, publicUser } from '../lib/users.js';
import { loginAccountLimiter, loginIpLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { createUserWithBonus } from '../services/points.js';
import { validateLogin, validateRegister } from '../../../shared/validation.js';

export const BCRYPT_ROUNDS = 12;
// Hash giả để so sánh khi tên đăng nhập không tồn tại — thời gian phản hồi như nhau, không lộ tài khoản nào có thật.
const DUMMY_HASH = bcrypt.hashSync('khong-phai-mat-khau-that-1', BCRYPT_ROUNDS);

const DUPLICATE_MESSAGES = {
  username: 'Tên đăng nhập đã có người sử dụng.',
  email: 'Email này đã được đăng ký.',
  phone: 'Số điện thoại này đã được đăng ký.',
};

async function findDuplicates({ username, email, phone }) {
  const existing = await prisma.user.findMany({
    where: { OR: [{ username }, { email }, { phone }] },
    select: { username: true, email: true, phone: true },
  });
  const errors = {};
  for (const u of existing) {
    if (u.username === username) errors.username = DUPLICATE_MESSAGES.username;
    if (u.email === email) errors.email = DUPLICATE_MESSAGES.email;
    if (u.phone === phone) errors.phone = DUPLICATE_MESSAGES.phone;
  }
  return errors;
}

export const authRouter = Router();

authRouter.post('/register', registerLimiter, async (req, res) => {
  const { errors, data } = validateRegister(req.body);
  if (Object.keys(errors).length) throw validationError(errors);

  const duplicates = await findDuplicates(data);
  if (Object.keys(duplicates).length) throw validationError(duplicates);

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await createUserWithBonus({
      username: data.username,
      email: data.email,
      phone: data.phone,
      passwordHash,
      lastLoginAt: new Date(),
    });
  } catch (e) {
    // Hai người đăng ký cùng lúc với cùng thông tin: ràng buộc unique của DB chặn lại.
    if (e.code === 'P2002') {
      const field = [].concat(e.meta?.target || []).find((f) => DUPLICATE_MESSAGES[f]);
      throw validationError(field ? { [field]: DUPLICATE_MESSAGES[field] } : {}, 'Thông tin đăng ký đã được sử dụng.');
    }
    throw e;
  }
  setSessionCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const { errors, data } = validateLogin(req.body);
  if (Object.keys(errors).length) throw validationError(errors);

  const user = await prisma.user.findUnique({ where: { username: data.username } });
  const ok = await bcrypt.compare(data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.', { code: 'INVALID_CREDENTIALS' });
  }
  // Chỉ báo "bị khóa" khi mật khẩu đúng, tránh lộ trạng thái tài khoản cho người đoán mò.
  if (user.isLocked) throw new HttpError(403, lockedMessage(user), { code: 'ACCOUNT_LOCKED' });

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  setSessionCookie(res, updated);
  res.json({ user: publicUser(updated) });
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Trạng thái đăng nhập hiện tại. Chưa đăng nhập vẫn trả 200 với user = null (kèm notice nếu phiên bị hủy). */
authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null, notice: req.authNotice || undefined });
});

