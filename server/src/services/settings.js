// Cài đặt hệ thống lưu trong bảng Setting (admin sửa được ở Giai đoạn 3).
// DEFAULTS chỉ dùng để khởi tạo lần đầu — sau đó giá trị trong database là nguồn duy nhất.
import { prisma } from '../db.js';

export const SETTING_DEFS = {
  freeExportsForNewUser: { default: 5, min: 0, max: 1000, label: 'Số lượt xuất miễn phí cho tài khoản mới' },
  pointsPerExport: { default: 5, min: 0, max: 100000, label: 'Số điểm trừ mỗi lần xuất file' },
  topupUnitVnd: { default: 10000, min: 1000, max: 1000000, label: 'Mệnh giá nạp (tối thiểu và bước nhảy, đồng)' },
  pointsPerUnit: { default: 100, min: 1, max: 1000000, label: 'Số điểm nhận được cho mỗi mệnh giá nạp' },
};

export async function ensureDefaultSettings() {
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: String(def.default) } });
  }
}

/** Đọc toàn bộ cài đặt dạng số. db có thể là prisma hoặc tx trong transaction. */
export async function getSettings(db = prisma) {
  const rows = await db.setting.findMany();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    const n = Number.parseInt(byKey[key], 10);
    out[key] = Number.isFinite(n) ? n : def.default;
  }
  return out;
}

/**
 * Admin cập nhật cài đặt. Chỉ nhận khóa có trong SETTING_DEFS, giá trị số nguyên trong [min, max].
 * Trả về { errors } nếu sai, ngược lại lưu tất cả trong một transaction.
 */
export async function updateSettings(values, actorId) {
  const errors = {};
  const updates = [];
  for (const [key, raw] of Object.entries(values || {})) {
    const def = SETTING_DEFS[key];
    if (!def) continue;
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < def.min || n > def.max) {
      errors[key] = `${def.label}: phải là số nguyên từ ${def.min.toLocaleString('vi-VN')} đến ${def.max.toLocaleString('vi-VN')}.`;
      continue;
    }
    updates.push({ key, value: String(n) });
  }
  if (Object.keys(errors).length || !updates.length) return { errors };
  await prisma.$transaction(
    updates.map(({ key, value }) =>
      prisma.setting.upsert({ where: { key }, update: { value, updatedById: actorId }, create: { key, value, updatedById: actorId } }),
    ),
  );
  return { errors: {} };
}
