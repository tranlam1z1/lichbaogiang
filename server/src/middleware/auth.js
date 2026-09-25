import { prisma } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { clearSessionCookie, readSession } from '../lib/session.js';
import { lockedMessage } from '../lib/users.js';

/**
 * Đọc phiên đăng nhập và gắn req.user (nếu hợp lệ). Không chặn request.
 * Mỗi request đều đọc lại người dùng từ DB nên khóa tài khoản / đổi mật khẩu có hiệu lực ngay.
 */
export async function loadUser(req, res, next) {
  req.user = null;
  req.authNotice = null;
  const session = readSession(req);
  if (!session) return next();
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.tokenVersion !== session.tokenVersion) {
    clearSessionCookie(res);
    req.authNotice = user ? 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại.' : null;
    return next();
  }
  if (user.isLocked) {
    clearSessionCookie(res);
    req.authNotice = lockedMessage(user);
    return next();
  }
  req.user = user;
  return next();
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.authNotice) throw new HttpError(401, req.authNotice, { code: 'SESSION_INVALID' });
  throw new HttpError(401, 'Bạn cần đăng nhập để sử dụng chức năng này.', { code: 'UNAUTHENTICATED' });
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {});
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Bạn không có quyền truy cập trang quản trị.', { code: 'FORBIDDEN' });
  next();
}
