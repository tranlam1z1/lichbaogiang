// Tiện ích xử lý chuỗi tiếng Việt — không phụ thuộc React.

/** Chuẩn hóa tên môn để so khớp: NFC, bỏ khoảng trắng thừa, viết hoa. */
export function normalizeSubject(value) {
  if (value == null) return '';
  return String(value)
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('vi');
}

/** Bỏ dấu để tìm kiếm không phân biệt dấu: "Tiếng Việt" -> "tieng viet". */
export function foldVietnamese(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Môn không cần tra PPCT (giống công thức Excel: bỏ qua "chào cờ"). */
export const SKIP_LOOKUP_SUBJECTS = new Set(['CHÀO CỜ']);
