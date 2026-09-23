// Dựng kế hoạch giảng dạy một tuần từ thời khóa biểu + PPCT. Không phụ thuộc React.

import { normalizeSubject, SKIP_LOOKUP_SUBJECTS } from './text.js';
import { lookupLesson, weeklyLoad } from './ppct.js';
import { dayDate, dayName, isIrregularWeek, vnWeekday } from './calendar.js';

export const SESSIONS = [
  { id: 'morning', label: 'Sáng', countKey: 'morningCount' },
  { id: 'afternoon', label: 'Chiều', countKey: 'afternoonCount' },
];
export const MAX_PERIODS = 5;

export function schoolDays(timetable) {
  return timetable.saturday ? [2, 3, 4, 5, 6, 7] : [2, 3, 4, 5, 6];
}

export function slotKey(day, session, period) {
  return `${day}-${session}-${period}`;
}

/** Duyệt thời khóa biểu theo thứ tự thứ 2 → thứ 6/7, sáng rồi chiều. */
export function iterateTimetable(timetable) {
  const out = [];
  for (const day of schoolDays(timetable)) {
    for (const s of SESSIONS) {
      const count = Math.min(timetable[s.countKey] || 0, MAX_PERIODS);
      const list = timetable.days?.[day]?.[s.id] || [];
      for (let p = 1; p <= count; p += 1) {
        out.push({ day, session: s.id, period: p, subject: normalizeSubject(list[p - 1]), key: slotKey(day, s.id, p) });
      }
    }
  }
  return out;
}

/**
 * Dựng kế hoạch giảng dạy cho một tuần.
 * @param {object} args
 * @param {object} args.week            dòng lịch tuần {num, start, end, ...}
 * @param {object} args.timetable       thời khóa biểu
 * @param {object} args.index           chỉ mục PPCT của khối (buildPpctIndex)
 * @param {number} args.grade           khối lớp (để ghi cảnh báo)
 * @param {object} [args.ppctOverrides] {key: tên bài đã sửa} của khối
 * @param {object} [args.lessonOverrides] {slotKey: {subject, title?, equipment?}} của tuần này
 */
export function buildWeekLessons({ week, timetable, index, grade, ppctOverrides = {}, lessonOverrides = {} }) {
  const counts = new Map();
  const days = schoolDays(timetable);
  const byDay = new Map(days.map((d, i) => {
    const date = dayDate(week, i);
    return [d, { day: d, label: dayName(d), date, actualDay: date ? vnWeekday(date) : null, sessions: [] }];
  }));

  let current = null;
  for (const slot of iterateTimetable(timetable)) {
    const dayObj = byDay.get(slot.day);
    if (!current || current.day !== slot.day || current.session !== slot.session) {
      current = { day: slot.day, session: slot.session, label: SESSIONS.find((s) => s.id === slot.session).label, rows: [] };
      dayObj.sessions.push(current);
    }
    const row = {
      key: slot.key,
      period: slot.period,
      subject: slot.subject,
      tiet: null,
      ppct: '',
      baseTitle: '',
      title: '',
      equipment: '',
      warning: null,
      editedTitle: false,
      editedEquipment: false,
    };
    if (slot.subject) {
      const n = (counts.get(slot.subject) || 0) + 1;
      counts.set(slot.subject, n);
      row.tiet = n;
      if (!SKIP_LOOKUP_SUBJECTS.has(slot.subject)) {
        const r = lookupLesson(index, { subject: slot.subject, week: week.num, tiet: n, grade, ppctOverrides });
        row.ppct = r.ppct ?? '';
        row.baseTitle = r.title;
        row.warning = r.warning;
      }
    }
    row.title = row.baseTitle;
    const o = lessonOverrides[slot.key];
    // Phần sửa chỉ áp dụng khi môn ở ô đó không đổi.
    if (o && normalizeSubject(o.subject) === slot.subject) {
      if (o.title != null) {
        row.title = o.title;
        row.editedTitle = true;
      }
      if (o.equipment != null && o.equipment !== '') {
        row.equipment = o.equipment;
        row.editedEquipment = true;
      }
    }
    current.rows.push(row);
  }
  return {
    week,
    irregular: isIrregularWeek(week, days.length),
    days: [...byDay.values()],
  };
}

/** Làm phẳng lịch một tuần thành các dòng, kèm thông tin gộp ô (dùng cho bảng và xuất file). */
export function flattenWeek(built) {
  const rows = [];
  for (const d of built.days) {
    const dayRows = d.sessions.reduce((n, s) => n + s.rows.length, 0);
    let firstOfDay = true;
    for (const s of d.sessions) {
      s.rows.forEach((r, i) => {
        rows.push({
          ...r,
          day: d.day,
          dayLabel: d.label,
          date: d.date,
          sessionLabel: s.label,
          dayRowSpan: firstOfDay ? dayRows : 0,
          sessionRowSpan: i === 0 ? s.rows.length : 0,
        });
        firstOfDay = false;
      });
    }
  }
  return rows;
}

/**
 * Đối chiếu thời khóa biểu với PPCT: số tiết mỗi môn so với số tiết/tuần trong PPCT.
 * rules: {MÔN: {perWeek?: number, hidden?: true}} — định mức giáo viên tự thêm/sửa, hoặc ẩn môn.
 * status: 'ok' | 'over' | 'under' | 'missing' (có trong PPCT nhưng chưa xếp) | 'unknown' (không có trong PPCT) | 'skip'
 */
export function checkTimetable(timetable, index, rules = {}) {
  const counts = new Map();
  for (const s of iterateTimetable(timetable)) {
    if (s.subject) counts.set(s.subject, (counts.get(s.subject) || 0) + 1);
  }
  const result = [];
  const seen = new Set();
  const push = (subject) => {
    if (seen.has(subject)) return;
    seen.add(subject);
    const rule = rules[subject] || {};
    if (rule.hidden) return;
    const inTkb = counts.get(subject) || 0;
    const load = weeklyLoad(index, subject);
    const custom = Number.isFinite(rule.perWeek);
    const expected = custom ? rule.perWeek : load?.mode ?? null;
    let status;
    let diff = 0;
    if (!custom && SKIP_LOOKUP_SUBJECTS.has(subject)) status = 'skip';
    else if (expected == null) status = 'unknown';
    else if (inTkb === 0 && expected > 0) {
      status = 'missing';
      diff = -expected;
    } else {
      diff = inTkb - expected;
      status = diff === 0 ? 'ok' : diff > 0 ? 'over' : 'under';
    }
    result.push({ subject, inTkb, load, expected, custom, status, diff });
  };
  counts.forEach((_, subject) => push(subject));
  index.subjects.forEach(push);
  Object.keys(rules).forEach(push);
  return result;
}

export function describeCheck(item) {
  switch (item.status) {
    case 'ok': return 'Khớp';
    case 'over': return `Thừa ${item.diff} tiết`;
    case 'under': return `Thiếu ${-item.diff} tiết`;
    case 'missing': return 'Chưa xếp vào TKB';
    case 'unknown': return 'Không có trong PPCT';
    default: return 'Không tra PPCT';
  }
}
