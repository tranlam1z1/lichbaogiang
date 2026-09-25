// Phiên đăng nhập: JWT ký bằng JWT_SECRET, lưu trong cookie httpOnly.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    path: '/',
  };
}

export function setSessionCookie(res, user) {
  // tv = tokenVersion: đổi mật khẩu / khóa tài khoản sẽ tăng số này, token cũ hết hiệu lực.
  const token = jwt.sign({ sub: String(user.id), tv: user.tokenVersion }, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`,
    algorithm: 'HS256',
  });
  res.cookie(config.cookie.name, token, { ...cookieOptions(), maxAge: config.sessionDays * DAY_MS });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookie.name, cookieOptions());
}

/** Trả về { userId, tokenVersion } hoặc null nếu token thiếu / sai / hết hạn. */
export function readSession(req) {
  const token = req.cookies?.[config.cookie.name];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) return null;
    return { userId, tokenVersion: payload.tv };
  } catch {
    return null;
  }
}
