// Đọc và kiểm tra cấu hình từ biến môi trường (.env). Thiếu cấu hình bắt buộc thì dừng ngay khi khởi động.

const env = process.env;

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const isProd = env.NODE_ENV === 'production';

if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  throw new Error('Thiếu JWT_SECRET trong .env (cần tối thiểu 32 ký tự). Xem server/.env.example.');
}
if (!env.DATABASE_URL) {
  throw new Error('Thiếu DATABASE_URL trong .env. Xem server/.env.example.');
}

const sameSite = (env.COOKIE_SAMESITE || 'lax').toLowerCase();
if (!['lax', 'strict', 'none'].includes(sameSite)) {
  throw new Error('COOKIE_SAMESITE chỉ nhận lax, strict hoặc none.');
}
const cookieSecure = bool(env.COOKIE_SECURE, isProd);
if (sameSite === 'none' && !cookieSecure) {
  throw new Error('COOKIE_SAMESITE=none bắt buộc COOKIE_SECURE=true (HTTPS).');
}

function trustProxy(value) {
  if (value === undefined || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return bool(value, false);
}

export const config = {
  isProd,
  port: int(env.PORT, 4000),
  jwtSecret: env.JWT_SECRET,
  sessionDays: int(env.SESSION_DAYS, 7),
  cookie: {
    name: 'khbd_session',
    sameSite,
    secure: cookieSecure,
  },
  clientOrigins: (env.CLIENT_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: trustProxy(env.TRUST_PROXY),
  serveClient: bool(env.SERVE_CLIENT, false),
  login: {
    maxFailsPerAccount: int(env.LOGIN_MAX_FAILS_PER_ACCOUNT, 5),
    maxFailsPerIp: int(env.LOGIN_MAX_FAILS_PER_IP, 20),
    windowMinutes: int(env.LOGIN_WINDOW_MINUTES, 15),
  },
  registerMaxPerHour: int(env.REGISTER_MAX_PER_HOUR, 10),
  // Để trống = tắt webhook tự duyệt nạp điểm (vẫn duyệt tay bình thường).
  sepayWebhookKey: (env.SEPAY_WEBHOOK_API_KEY || '').trim(),
};

if (config.sepayWebhookKey && config.sepayWebhookKey.length < 24) {
  throw new Error('SEPAY_WEBHOOK_API_KEY quá ngắn (cần tối thiểu 24 ký tự ngẫu nhiên).');
}
