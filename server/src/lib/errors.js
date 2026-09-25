/** Lỗi có mã HTTP và thông báo tiếng Việt hiển thị thẳng cho người dùng. */
export class HttpError extends Error {
  constructor(status, message, { code, errors, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
    /** Dữ liệu kèm theo cho frontend, VD: { points, cost } khi không đủ điểm. */
    this.details = details;
  }
}

/** Lỗi validate theo từng trường: errors = { field: 'thông báo' }. */
export function validationError(errors, message = 'Thông tin chưa hợp lệ, vui lòng kiểm tra lại.') {
  return new HttpError(400, message, { code: 'VALIDATION', errors });
}
