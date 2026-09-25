// Luật kiểm tra dữ liệu dùng chung cho cả frontend (Vite) và backend (Express).
// Thuần JavaScript, không phụ thuộc thư viện — sửa ở đây là hai phía cùng đổi.

export const USERNAME_RE = /^[A-Za-z0-9_]{4,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Di động Việt Nam: 10 chữ số, đầu 03, 05, 07, 08, 09.
export const PHONE_RE = /^0[35789]\d{8}$/;

export const PASSWORD_MIN = 8;
// bcrypt chỉ dùng 72 byte đầu; giới hạn để mật khẩu dài không bị cắt ngầm.
export const PASSWORD_MAX = 72;

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Bỏ khoảng trắng, dấu chấm, gạch; đổi +84 / 84 thành 0. */
export function normalizePhone(value) {
  let s = String(value ?? '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = `0${s.slice(3)}`;
  else if (/^84\d{9}$/.test(s)) s = `0${s.slice(2)}`;
  return s;
}

export function validateUsername(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Vui lòng nhập tên đăng nhập.';
  if (v.length < 4 || v.length > 20) return 'Tên đăng nhập phải dài từ 4 đến 20 ký tự.';
  if (!USERNAME_RE.test(v)) return 'Tên đăng nhập chỉ gồm chữ không dấu, số và dấu gạch dưới (_).';
  return null;
}

export function validatePassword(value) {
  const v = String(value ?? '');
  if (!v) return 'Vui lòng nhập mật khẩu.';
  if (v.length < PASSWORD_MIN) return `Mật khẩu phải có ít nhất ${PASSWORD_MIN} ký tự.`;
  if (new TextEncoder().encode(v).length > PASSWORD_MAX) return `Mật khẩu quá dài (tối đa ${PASSWORD_MAX} ký tự).`;
  if (!/\p{L}/u.test(v) || !/\d/.test(v)) return 'Mật khẩu phải có cả chữ và số.';
  return null;
}

export function validateEmail(value) {
  const v = normalizeEmail(value);
  if (!v) return 'Vui lòng nhập email.';
  if (v.length > 254 || !EMAIL_RE.test(v)) return 'Email không đúng định dạng.';
  return null;
}

export function validatePhone(value) {
  const v = normalizePhone(value);
  if (!v) return 'Vui lòng nhập số điện thoại.';
  if (!PHONE_RE.test(v)) return 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 03, 05, 07, 08 hoặc 09.';
  return null;
}

/**
 * Kiểm tra form đăng ký. Trả về { errors, data } — errors rỗng nghĩa là hợp lệ,
 * data là các giá trị đã chuẩn hóa để lưu.
 */
export function validateRegister(input = {}) {
  const errors = {};
  const set = (field, msg) => {
    if (msg) errors[field] = msg;
  };
  set('username', validateUsername(input.username));
  set('password', validatePassword(input.password));
  if (!input.confirmPassword) {
    errors.confirmPassword = 'Vui lòng nhập lại mật khẩu.';
  } else if (input.password !== input.confirmPassword) {
    errors.confirmPassword = 'Mật khẩu nhập lại không khớp.';
  }
  set('email', validateEmail(input.email));
  set('phone', validatePhone(input.phone));
  return {
    errors,
    data: {
      username: normalizeUsername(input.username),
      password: String(input.password ?? ''),
      email: normalizeEmail(input.email),
      phone: normalizePhone(input.phone),
    },
  };
}

export function validateLogin(input = {}) {
  const errors = {};
  if (!String(input.username ?? '').trim()) errors.username = 'Vui lòng nhập tên đăng nhập.';
  if (!input.password) errors.password = 'Vui lòng nhập mật khẩu.';
  return { errors, data: { username: normalizeUsername(input.username), password: String(input.password ?? '') } };
}

// ---------- Nạp điểm ----------

/** Số tiền nạp tối đa cho một yêu cầu, chặn gõ nhầm thêm số 0. */
export const TOPUP_MAX_VND = 10_000_000;

export function formatVnd(amount) {
  return `${Number(amount || 0).toLocaleString('vi-VN')}đ`;
}

/**
 * Số tiền nạp phải là số nguyên, tối thiểu unitVnd và là bội số của unitVnd.
 * unitVnd lấy từ cài đặt hệ thống (mặc định 10.000đ).
 */
export function validateTopUpAmount(amount, unitVnd) {
  const n = Number(amount);
  if (amount === '' || amount === null || amount === undefined || !Number.isFinite(n)) return 'Vui lòng nhập số tiền cần nạp.';
  if (!Number.isInteger(n)) return 'Số tiền phải là số nguyên.';
  if (n < unitVnd) return `Số tiền nạp tối thiểu là ${formatVnd(unitVnd)}.`;
  if (n % unitVnd !== 0) return `Số tiền nạp phải là bội số của ${formatVnd(unitVnd)}.`;
  if (n > TOPUP_MAX_VND) return `Mỗi lần nạp tối đa ${formatVnd(TOPUP_MAX_VND)}.`;
  return null;
}

/** Quy đổi tiền sang điểm theo tỷ lệ: unitVnd đồng = pointsPerUnit điểm. */
export function pointsForAmount(amount, unitVnd, pointsPerUnit) {
  return Math.floor(Number(amount) / unitVnd) * pointsPerUnit;
}
