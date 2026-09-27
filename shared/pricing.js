// Giá xuất file theo số tuần — dùng chung cho frontend (hiện giá) và backend (trừ điểm).
// Thuần JavaScript, không phụ thuộc thư viện — sửa ở đây là hai phía cùng đổi.
//
// Giá = điểm tuần đầu (pointsPerExport) + điểm mỗi tuần thêm (pointsPerExtraWeek) × (số tuần − 1).
// Lượt miễn phí chỉ dùng cho lần tải đúng 1 tuần.

/** Số tuần tối đa trong một lần xuất (một năm học có khoảng 35 tuần học). */
export const MAX_EXPORT_WEEKS = 60;

/** Số điểm cho một lần xuất `weeks` tuần. */
export function exportCost(weeks, { pointsPerExport = 0, pointsPerExtraWeek = 0 } = {}) {
  const n = Number(weeks);
  if (!Number.isInteger(n) || n < 1) return 0;
  return pointsPerExport + pointsPerExtraWeek * (n - 1);
}

/** Lần xuất này có dùng lượt miễn phí được không. */
export function canUseFreeExport(weeks, freeExportsLeft) {
  return Number(weeks) === 1 && freeExportsLeft > 0;
}

/**
 * Báo giá cho giao diện.
 * @returns {{ weeks, free: boolean, cost: number, enough: boolean, pointsAfter: number, freeAfter: number }}
 *   cost = số điểm sẽ trừ (0 nếu dùng lượt miễn phí).
 */
export function quoteExport(weeks, { points = 0, freeExportsLeft = 0 } = {}, settings = {}) {
  const free = canUseFreeExport(weeks, freeExportsLeft);
  const cost = free ? 0 : exportCost(weeks, settings);
  return {
    weeks,
    free,
    cost,
    enough: points >= cost,
    pointsAfter: points - cost,
    freeAfter: free ? freeExportsLeft - 1 : freeExportsLeft,
  };
}

/** Mô tả bảng giá ngắn gọn, VD "1 tuần: 5 điểm, mỗi tuần thêm: 2 điểm". */
export function priceText({ pointsPerExport = 0, pointsPerExtraWeek = 0 } = {}) {
  return pointsPerExtraWeek > 0
    ? `1 tuần: ${pointsPerExport} điểm, mỗi tuần thêm: ${pointsPerExtraWeek} điểm`
    : `${pointsPerExport} điểm mỗi lần tải`;
}
