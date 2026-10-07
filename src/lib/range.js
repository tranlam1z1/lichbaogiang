// Chọn phạm vi tuần để xuất file và gom dữ liệu xuất. Không phụ thuộc React.

import { isTeachingWeek } from './calendar.js';
import { buildWeekLessons, flattenWeek } from './schedule.js';

export const RANGE_OPTIONS = [
  { id: 'current', label: 'Tuần đang xem' },
  { id: 'sem1', label: 'Học kì I' },
  { id: 'sem2', label: 'Học kì II' },
  { id: 'year', label: 'Cả năm' },
  { id: 'custom', label: 'Từ tuần … đến tuần …' },
];

/** Danh sách tuần học (có số tuần) thuộc phạm vi. */
export function weeksInRange(calendar, range, currentWeekId) {
  const teaching = calendar.filter(isTeachingWeek);
  switch (range.type) {
    case 'current':
      return teaching.filter((w) => w.id === currentWeekId);
    case 'sem1':
      return teaching.filter((w) => w.semester === 'I');
    case 'sem2':
      return teaching.filter((w) => w.semester === 'II');
    case 'custom': {
      const from = Math.min(Number(range.from) || 1, Number(range.to) || 1);
      const to = Math.max(Number(range.from) || 1, Number(range.to) || 1);
      return teaching.filter((w) => w.num >= from && w.num <= to);
    }
    default:
      return teaching;
  }
}

export function rangeLabel(range, weeks) {
  if (!weeks.length) return '';
  if (range.type === 'sem1') return 'HK1';
  if (range.type === 'sem2') return 'HK2';
  if (range.type === 'year') return 'ca-nam';
  if (weeks.length === 1) return `tuan-${weeks[0].num}`;
  return `tuan-${weeks[0].num}-${weeks[weeks.length - 1].num}`;
}

/**
 * Tên file khi xuất (chưa có đuôi), dạng "KHBD 4A TUẦN 3".
 * Nhiều tuần: "KHBD 4A TUẦN 3-5"; học kì / cả năm: "KHBD 4A HỌC KÌ I", "KHBD 4A CẢ NĂM".
 */
export function exportFileName(className, range, weeks) {
  const cls = String(className || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
  let scope = '';
  if (range.type === 'sem1') scope = 'HỌC KÌ I';
  else if (range.type === 'sem2') scope = 'HỌC KÌ II';
  else if (range.type === 'year') scope = 'CẢ NĂM';
  else if (weeks.length === 1) scope = `TUẦN ${weeks[0].num}`;
  else if (weeks.length > 1) scope = `TUẦN ${weeks[0].num}-${weeks[weeks.length - 1].num}`;
  return ['KHBD', cls, scope].filter(Boolean).join(' ');
}

/** Dữ liệu từng tuần đã dựng sẵn cho Word/Excel. */
export function buildExportWeeks({ weeks, timetable, index, grade, ppctOverrides, equipmentDefaults, ppctEquipment, lessonOverrides, notTaught }) {
  return weeks.map((week) => {
    const built = buildWeekLessons({
      week,
      timetable,
      index,
      grade,
      ppctOverrides,
      equipmentDefaults,
      ppctEquipment,
      lessonOverrides: lessonOverrides?.[week.num] || {},
      notTaught,
    });
    return { week, rows: flattenWeek(built) };
  });
}

/** Dòng "Tuần N – Lớp X – Giáo viên: …" ở đầu mỗi trang khi xuất file. */
export function weekLine(info, week) {
  const parts = [`Tuần ${week.num}`, `Lớp ${info.className || ''}`];
  if (info.teacher) parts.push(`Giáo viên: ${info.teacher}`);
  return parts.join('   –   ');
}
