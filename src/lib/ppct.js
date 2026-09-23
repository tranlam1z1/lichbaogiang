// Tra cứu phân phối chương trình (PPCT). Không phụ thuộc React.
// Mỗi dòng PPCT: [môn, tuần, tiết thứ trong tuần, số tiết PPCT, tên bài].

import { normalizeSubject } from './text.js';

export const COL = { SUBJECT: 0, WEEK: 1, TIET: 2, NUM: 3, NAME: 4 };

/** Khóa tra cứu, tương đương cột "Tuần môn tiết thứ" trong Excel. */
export function ppctKey(subject, week, tiet) {
  return `${week}|${normalizeSubject(subject)}|${tiet}`;
}

/**
 * Dựng chỉ mục cho một khối.
 * @returns {{map: Map, subjects: string[], perWeek: Map<string, Map<number, number>>, rows: Array}}
 */
export function buildPpctIndex(rows = []) {
  const map = new Map();
  const perWeek = new Map();
  const subjects = [];
  rows.forEach((row, i) => {
    const subject = normalizeSubject(row[COL.SUBJECT]);
    const week = Number(row[COL.WEEK]);
    const tiet = Number(row[COL.TIET]);
    const key = ppctKey(subject, week, tiet);
    const existing = map.get(key);
    // Trùng khóa: giữ dòng có tên bài.
    if (existing && (existing.name || !row[COL.NAME])) return;
    map.set(key, { key, subject, week, tiet, num: row[COL.NUM], name: row[COL.NAME] || '', index: i });
    if (!perWeek.has(subject)) {
      perWeek.set(subject, new Map());
      subjects.push(subject);
    }
    if (!existing) {
      const w = perWeek.get(subject);
      w.set(week, (w.get(week) || 0) + 1);
    }
  });
  return { map, subjects, perWeek, rows };
}

/** Tên bài có tính phần giáo viên đã sửa trong PPCT. */
export function ppctName(entry, ppctOverrides) {
  if (!entry) return '';
  const o = ppctOverrides?.[entry.key];
  return o != null ? o : entry.name;
}

/**
 * Tra tên bài theo tuần + môn + tiết thứ.
 * Không bao giờ trả "#N/A": khi thiếu thì trả warning để hiện cảnh báo nhỏ.
 */
export function lookupLesson(index, { subject, week, tiet, grade, ppctOverrides }) {
  const subj = normalizeSubject(subject);
  const entry = index.map.get(ppctKey(subj, week, tiet));
  if (entry) {
    return { found: true, ppct: entry.num, title: ppctName(entry, ppctOverrides), key: entry.key, warning: null };
  }
  let warning;
  if (!index.perWeek.has(subj)) {
    warning = `Môn này không có trong PPCT lớp ${grade}`;
  } else {
    const count = index.perWeek.get(subj).get(week) || 0;
    warning = count === 0
      ? `PPCT tuần ${week} không có tiết môn này`
      : `PPCT tuần ${week} chỉ có ${count} tiết môn này`;
  }
  return { found: false, ppct: '', title: '', key: null, warning };
}

/** Số tiết/tuần thường gặp của một môn trong PPCT (mode) cùng khoảng min–max. */
export function weeklyLoad(index, subject) {
  const weeks = index.perWeek.get(normalizeSubject(subject));
  if (!weeks || !weeks.size) return null;
  const freq = new Map();
  let min = Infinity;
  let max = 0;
  weeks.forEach((c) => {
    freq.set(c, (freq.get(c) || 0) + 1);
    min = Math.min(min, c);
    max = Math.max(max, c);
  });
  let mode = 0;
  let best = -1;
  freq.forEach((n, c) => {
    if (n > best || (n === best && c > mode)) {
      best = n;
      mode = c;
    }
  });
  return { mode, min, max, weeks: weeks.size };
}
