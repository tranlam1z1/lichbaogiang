import { HttpError } from '../lib/errors.js';

export function notFound(req, res) {
  res.status(404).json({ message: 'Không tìm thấy địa chỉ API này.', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, code: err.code, errors: err.errors, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Dữ liệu gửi lên không đúng định dạng JSON.', code: 'BAD_JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Dữ liệu gửi lên quá lớn.', code: 'TOO_LARGE' });
  }
  console.error(err);
  return res.status(500).json({ message: 'Máy chủ gặp lỗi, vui lòng thử lại sau.', code: 'SERVER_ERROR' });
}

/**
 * Chống CSRF: request thay đổi dữ liệu phải gửi JSON. Form HTML của trang lạ không gửi được
 * Content-Type application/json mà không qua preflight CORS (bị chặn vì không nằm trong CLIENT_ORIGIN).
 */
export function requireJsonForWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.is('application/json')) {
    throw new HttpError(415, 'Yêu cầu phải gửi dữ liệu dạng JSON.', { code: 'JSON_REQUIRED' });
  }
  next();
}
