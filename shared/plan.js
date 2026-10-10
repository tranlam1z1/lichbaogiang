// Hồ sơ kế hoạch — dùng chung cho frontend (hiện tên hồ sơ) và backend (lưu nhãn để liệt kê).
// Thuần JavaScript, không phụ thuộc thư viện — sửa ở đây là hai phía cùng đổi.

/** Độ dài tối đa của tên hồ sơ do người dùng đặt. */
export const PLAN_NAME_MAX = 80;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Nhãn tự sinh từ thông tin lớp, VD: "Nguyễn Thị Gấm · Lớp 4A · Trường Tiểu học…". */
export function planLabel(info) {
  const i = info && typeof info === 'object' ? info : {};
  const className = text(i.className);
  return [text(i.teacher), className && `Lớp ${className}`, text(i.school)].filter(Boolean).join(' · ').slice(0, 200);
}
