// Mốc thời gian theo giờ Việt Nam (UTC+7, không có giờ mùa hè) — không phụ thuộc múi giờ của máy chủ.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00 hôm nay theo giờ Việt Nam. */
export function startOfTodayVN(now = new Date()) {
  const vn = now.getTime() + VN_OFFSET_MS;
  return new Date(vn - (vn % DAY_MS) - VN_OFFSET_MS);
}

/** 00:00 thứ Hai của tuần hiện tại theo giờ Việt Nam. */
export function startOfWeekVN(now = new Date()) {
  const today = startOfTodayVN(now);
  const weekday = new Date(today.getTime() + VN_OFFSET_MS).getUTCDay(); // 0 = CN
  const back = (weekday + 6) % 7;
  return new Date(today.getTime() - back * DAY_MS);
}

/** 'YYYY-MM-DD' (ngày VN) → Date lúc 00:00 ngày đó; sai định dạng → null. */
export function parseDateVN(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const d = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Điều kiện lọc createdAt từ ?from=&to= (bao gồm cả ngày "đến"). */
export function dateRangeWhere(from, to) {
  const gte = parseDateVN(from);
  const toDay = parseDateVN(to);
  if (!gte && !toDay) return undefined;
  return {
    ...(gte && { gte }),
    ...(toDay && { lt: new Date(toDay.getTime() + DAY_MS) }),
  };
}
