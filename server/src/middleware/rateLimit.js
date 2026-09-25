// Chống dò mật khẩu. Chỉ tính các lần đăng nhập THẤT BẠI (skipSuccessfulRequests).
// Lưu trong bộ nhớ tiến trình — chạy nhiều instance thì cần store dùng chung (Redis), xem README.
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config.js';
import { normalizeUsername } from '../../../shared/validation.js';

function tooMany(req, res, next, options) {
  const reset = req.rateLimit?.resetTime;
  const minutes = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 60000)) : config.login.windowMinutes;
  res.status(options.statusCode).json({
    message: `Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
    code: 'TOO_MANY_ATTEMPTS',
  });
}

const windowMs = config.login.windowMinutes * 60 * 1000;

/** Giới hạn theo tài khoản: chặn dò mật khẩu một tài khoản từ nhiều IP. */
export const loginAccountLimiter = rateLimit({
  windowMs,
  limit: config.login.maxFailsPerAccount,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `acc:${normalizeUsername(req.body?.username)}`,
  handler: tooMany,
});

/** Giới hạn theo IP: chặn một máy thử lần lượt nhiều tài khoản. */
export const loginIpLimiter = rateLimit({
  windowMs,
  limit: config.login.maxFailsPerIp,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
  handler: tooMany,
});

/** Giới hạn tạo tài khoản hàng loạt từ một IP. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.registerMaxPerHour,
  skipFailedRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `reg:${ipKeyGenerator(req.ip)}`,
  message: { message: 'Bạn đã tạo quá nhiều tài khoản. Vui lòng thử lại sau 1 giờ.', code: 'TOO_MANY_REGISTRATIONS' },
});
