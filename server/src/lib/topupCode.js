// Mã nạp điểm = nội dung chuyển khoản, VD: KHBD7K3QPA.
import { randomInt } from 'node:crypto';

export const CODE_PREFIX = 'KHBD';
// Bỏ các ký tự dễ nhầm khi gõ tay nội dung chuyển khoản: 0/O, 1/I/L.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`${CODE_PREFIX}[${CODE_CHARS}]{${CODE_LENGTH}}`, 'g');

export function newTopUpCode() {
  let s = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

/**
 * Tìm các mã nạp có thể có trong nội dung chuyển khoản do ngân hàng trả về.
 * Ngân hàng hay chèn thêm chữ (VD: "MBVCB.123.KHBD7K3QPA.CT tu ...") hoặc tách mã bằng dấu cách/chấm,
 * nên dò cả trên chuỗi gốc lẫn chuỗi đã bỏ hết ký tự không phải chữ/số.
 */
export function extractTopUpCodes(...texts) {
  const found = new Set();
  for (const text of texts) {
    const upper = String(text || '').toUpperCase();
    for (const s of [upper, upper.replace(/[^A-Z0-9]/g, '')]) {
      for (const m of s.matchAll(CODE_RE)) found.add(m[0]);
    }
  }
  return [...found];
}
