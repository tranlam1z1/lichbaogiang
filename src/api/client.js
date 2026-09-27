// Mọi lời gọi API đi qua đây: tự gửi cookie phiên, parse JSON, đổi lỗi thành ApiError có thông báo tiếng Việt.

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Máy chủ trả lỗi (${status}).`);
    this.status = status;
    this.code = body?.code;
    /** Lỗi theo từng trường của form: { username: '...', ... } */
    this.errors = body?.errors || {};
    /** Dữ liệu kèm theo, VD: { cost, points } khi không đủ điểm. */
    this.details = body?.details || {};
  }
}

let onUnauthorized = null;
/** AuthContext đăng ký hàm này để tự đăng xuất khi phiên hết hạn / tài khoản bị khóa. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// Trình duyệt chỉ cho request keepalive gửi tối đa 64 KB; lớn hơn thì gửi như thường.
const KEEPALIVE_MAX_BYTES = 60 * 1024;

/** opts.keepalive: request vẫn được gửi xong khi người dùng đóng tab (dùng lúc trang bị ẩn). */
async function request(method, path, body, { keepalive = false } = {}) {
  let res;
  const payload = method !== 'GET' ? JSON.stringify(body ?? {}) : undefined;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(method !== 'GET' && { 'Content-Type': 'application/json' }) },
      body: payload,
      keepalive: keepalive && new TextEncoder().encode(payload ?? '').length < KEEPALIVE_MAX_BYTES,
    });
  } catch {
    throw new ApiError(0, { message: 'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.', code: 'NETWORK' });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    // Chỉ phản ứng khi phiên hết hiệu lực — sai mật khẩu lúc đăng nhập cũng là 401 nhưng do form tự xử lý.
    if (res.status === 401 && ['UNAUTHENTICATED', 'SESSION_INVALID'].includes(err.code) && onUnauthorized) onUnauthorized(err);
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body, opts) => request('PUT', path, body, opts),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path, body) => request('DELETE', path, body),
};
