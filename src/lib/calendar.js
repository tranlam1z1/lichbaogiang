// Lịch tuần: ngày tháng, tuần hiện tại, tạo lại cả năm. Không phụ thuộc React.
// Mọi ngày được lưu dạng chuỗi ISO "YYYY-MM-DD" và tính theo UTC để tránh lệch múi giờ.

const DAY_MS = 86400000;

export function parseISO(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  return d ? toISO(new Date(d.getTime() + n * DAY_MS)) : null;
}

export function diffDays(a, b) {
  const da = parseISO(a);
  const db = parseISO(b);
  return da && db ? Math.round((db - da) / DAY_MS) : NaN;
}

/** Hôm nay theo giờ máy, dạng ISO. */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDM(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatDMY(iso) {
  const d = parseISO(iso);
  return d ? `${formatDM(iso)}/${d.getUTCFullYear()}` : '';
}

/** Thứ theo cách gọi Việt Nam: 2..7, Chủ nhật = 8. */
export function vnWeekday(iso) {
  const d = parseISO(iso);
  if (!d) return null;
  const js = d.getUTCDay(); // 0 = CN
  return js === 0 ? 8 : js + 1;
}

export function dayName(day) {
  return day === 8 ? 'Chủ nhật' : `Thứ ${day}`;
}

export function isTeachingWeek(week) {
  return Number.isInteger(week?.num) && week.num > 0;
}

export function weekTitle(week) {
  if (isTeachingWeek(week)) return `Tuần ${week.num}`;
  return week?.note?.trim() || 'Tuần không đánh số';
}

/**
 * Ngày của buổi học thứ `index` (0 = thứ 2) trong tuần, giống Excel: ngày bắt đầu + index.
 * Trả về null nếu vượt quá ngày kết thúc (tuần rút gọn).
 */
export function dayDate(week, index) {
  const iso = addDays(week.start, index);
  if (!iso) return null;
  if (week.end && iso > week.end) return null;
  return iso;
}

/** Tuần có bị rút gọn / lệch thứ so với thời khóa biểu không. */
export function isIrregularWeek(week, daysPerWeek) {
  return vnWeekday(week.start) !== 2 || diffDays(week.start, week.end) !== daysPerWeek - 1;
}

/**
 * Tuần học đang diễn ra. Thứ 7, Chủ nhật thuộc tuần vừa học.
 * Nếu hôm nay rơi vào tuần nghỉ thì lấy tuần học kế tiếp; hết năm thì lấy tuần cuối.
 */
export function findCurrentWeek(calendar, today = todayISO()) {
  const teaching = calendar.filter(isTeachingWeek);
  if (!teaching.length) return null;
  const inside = teaching.find((w) => today >= w.start && today <= addDays(w.start, 6));
  if (inside) return inside;
  const next = teaching.filter((w) => w.start > today).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  return next || teaching[teaching.length - 1];
}

let idSeq = 0;
export function newWeekId() {
  idSeq += 1;
  return `w${Date.now().toString(36)}${idSeq}`;
}

/**
 * Tạo lại lịch cả năm.
 * @param {object} p
 * @param {string} p.startDate        ngày bắt đầu tuần 1 (ISO)
 * @param {number} p.teachingWeeks    tổng số tuần học (ví dụ 35)
 * @param {number} p.semester2Week    tuần bắt đầu học kì II (ví dụ 19)
 * @param {number} p.tetAfterWeek     nghỉ Tết sau tuần nào (0 = không nghỉ)
 * @param {number} p.tetWeeks         số tuần nghỉ Tết
 * @param {number} [p.blankAfterWeek] chèn 1 tuần không đánh số sau tuần này (0 = không có)
 * @param {number} [p.daysPerWeek]    5 hoặc 6 ngày học/tuần
 */
export function generateCalendar(p) {
  const {
    startDate,
    teachingWeeks,
    semester2Week,
    tetAfterWeek = 0,
    tetWeeks = 0,
    blankAfterWeek = 0,
    daysPerWeek = 5,
  } = p;
  if (!parseISO(startDate)) throw new Error('Ngày bắt đầu không hợp lệ.');
  if (!(teachingWeeks > 0)) throw new Error('Số tuần học phải lớn hơn 0.');
  const out = [];
  let cursor = startDate;
  const push = (num, note, semester) => {
    out.push({ id: newWeekId(), num, note, semester, start: cursor, end: addDays(cursor, daysPerWeek - 1) });
    cursor = addDays(cursor, 7);
  };
  for (let n = 1; n <= teachingWeeks; n += 1) {
    const semester = semester2Week && n >= semester2Week ? 'II' : 'I';
    push(n, '', semester);
    if (blankAfterWeek && n === blankAfterWeek) push(null, '', semester);
    if (tetAfterWeek && n === tetAfterWeek) {
      const tetSemester = semester2Week && n + 1 >= semester2Week ? 'II' : 'I';
      for (let t = 0; t < tetWeeks; t += 1) push(null, 'Nghỉ tết', tetSemester);
    }
  }
  return out;
}

/** Kiểm tra lịch tuần, trả về danh sách cảnh báo {id, message}. */
export function validateCalendar(calendar) {
  const issues = [];
  const seen = new Map();
  calendar.forEach((w, i) => {
    if (!parseISO(w.start) || !parseISO(w.end)) {
      issues.push({ id: w.id, message: `Dòng ${i + 1}: ngày chưa hợp lệ.` });
      return;
    }
    if (w.end < w.start) issues.push({ id: w.id, message: `Dòng ${i + 1}: "đến ngày" trước "từ ngày".` });
    if (isTeachingWeek(w)) {
      if (seen.has(w.num)) issues.push({ id: w.id, message: `Tuần ${w.num} bị lặp lại.` });
      seen.set(w.num, w.id);
    }
    const prev = calendar[i - 1];
    if (prev && parseISO(prev.end) && w.start <= prev.end) {
      issues.push({ id: w.id, message: `Dòng ${i + 1} trùng ngày với dòng ${i}.` });
    }
  });
  return issues;
}
