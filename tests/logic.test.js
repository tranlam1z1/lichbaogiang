import { test } from 'node:test';
import assert from 'node:assert/strict';

import ppctData from '../src/data/ppct.json';
import calendarData from '../src/data/calendar.json';
import defaults from '../src/data/defaults.json';
import excelWeek1 from './fixtures/excel-week1.json';
import { buildPpctIndex, lookupLesson, ppctKey } from '../src/lib/ppct.js';
import { buildWeekLessons, flattenWeek, checkTimetable } from '../src/lib/schedule.js';
import { findCurrentWeek, generateCalendar, isTeachingWeek } from '../src/lib/calendar.js';
import { weeksInRange } from '../src/lib/range.js';
import { reducer, createInitialState } from '../src/state/reducer.js';

const grade = defaults.info.grade;
const index = buildPpctIndex(ppctData[grade]);
const week1 = calendarData.find((w) => w.num === 1);

test('Tuần 1 khớp sheet LỊCH BÁO GIẢNG trong Excel', () => {
  const rows = flattenWeek(buildWeekLessons({ week: week1, timetable: defaults.timetable, index, grade }));
  assert.equal(rows.length, excelWeek1.length);
  const diffs = [];
  rows.forEach((r, i) => {
    const x = excelWeek1[i];
    assert.equal(r.subject, x.subject, `môn dòng Excel ${x.row}`);
    if (x.ppct === '#N/A' && !x.subject) {
      // Ô TKB trong Excel chỉ chứa dấu cách → Excel báo #N/A; ứng dụng coi là ô trống.
      assert.equal(r.title, '');
      assert.equal(r.warning, null);
      diffs.push(`dòng ${x.row} (ô TKB chỉ có dấu cách): Excel #N/A → app: để trống`);
    } else if (x.ppct === '#N/A') {
      assert.ok(r.warning, `dòng ${x.row} (${x.subject}) phải có cảnh báo thay cho #N/A`);
      diffs.push(`dòng ${x.row} ${x.subject}: Excel #N/A → app: "${r.warning}"`);
    } else if (!x.subject) {
      assert.equal(r.title, '');
    } else {
      assert.equal(String(r.ppct), String(x.ppct), `PPCT dòng ${x.row}`);
      if (x.title === '' && r.title) {
        // Ô tên bài trong Excel đã bị xóa công thức (để trống) dù PPCT có tên bài.
        diffs.push(`dòng ${x.row} ${x.subject}: Excel để trống (mất công thức) → app: "${r.title}"`);
      } else {
        assert.equal(r.title, x.title, `tên bài dòng ${x.row}`);
      }
    }
  });
  console.log('  Khác biệt có chủ đích:\n   - ' + diffs.join('\n   - '));
});

test('Trùng khóa PPCT giữ dòng có tên bài (Tin học lớp 4)', () => {
  const e = index.map.get(ppctKey('TIN HỌC', 1, 1));
  assert.match(e.name, /Phần cứng và phần mềm/);
});

test('Cảnh báo khi không tra được', () => {
  const a = lookupLesson(index, { subject: 'MĨ THUẬT', week: 3, tiet: 2, grade });
  assert.equal(a.warning, 'PPCT tuần 3 chỉ có 1 tiết môn này');
  const b = lookupLesson(index, { subject: 'TN&XH', week: 3, tiet: 1, grade });
  assert.equal(b.warning, 'Môn này không có trong PPCT lớp 4');
});

test('Sửa tên bài trong PPCT áp dụng cho mọi tuần', () => {
  const key = ppctKey('TOÁN', 1, 1);
  const rows = flattenWeek(buildWeekLessons({
    week: week1, timetable: defaults.timetable, index, grade, ppctOverrides: { [key]: 'Bài mới' },
  }));
  assert.equal(rows.find((r) => r.subject === 'TOÁN').title, 'Bài mới');
});

test('Tạo lại lịch cả năm giống file gốc', () => {
  const gen = generateCalendar({
    startDate: '2026-09-07', teachingWeeks: 35, semester2Week: 19, tetAfterWeek: 23, tetWeeks: 2, blankAfterWeek: 18,
  });
  const orig = calendarData.slice(0, gen.length);
  gen.slice(0, 35).forEach((w, i) => {
    assert.equal(w.num, orig[i].num, `dòng ${i + 1}`);
    assert.equal(w.semester, orig[i].semester, `học kì dòng ${i + 1}`);
    assert.equal(w.start, orig[i].start, `ngày dòng ${i + 1}`);
  });
  assert.equal(gen.filter(isTeachingWeek).length, 35);
});

test('Tuần hiện tại', () => {
  assert.equal(findCurrentWeek(calendarData, '2026-09-23').num, 3);
  assert.equal(findCurrentWeek(calendarData, '2026-09-27').num, 3); // Chủ nhật
  assert.equal(findCurrentWeek(calendarData, '2027-02-24').num, 24); // đang nghỉ Tết
  assert.equal(findCurrentWeek(calendarData, '2026-08-01').num, 1);
});

test('Phạm vi xuất', () => {
  assert.equal(weeksInRange(calendarData, { type: 'year' }).length, 35);
  assert.equal(weeksInRange(calendarData, { type: 'sem1' }).length, 18);
  assert.equal(weeksInRange(calendarData, { type: 'sem2' }).length, 17);
  assert.equal(weeksInRange(calendarData, { type: 'custom', from: 5, to: 7 }).length, 3);
});

test('Đối chiếu TKB với PPCT', () => {
  const res = checkTimetable(defaults.timetable, index);
  const by = Object.fromEntries(res.map((r) => [r.subject, r]));
  assert.equal(by['MĨ THUẬT'].status, 'over');
  assert.equal(by['TIẾNG ANH'].status, 'over');
  assert.equal(by['TOÁN'].status, 'ok');
  const bad = res.filter((r) => !['ok', 'skip'].includes(r.status));
  console.log('  TKB không khớp PPCT:\n   - ' + bad.map((r) => `${r.subject}: TKB ${r.inTkb}, PPCT ${r.load?.mode ?? '-'} (${r.status})`).join('\n   - '));
});

test('Đối chiếu: thêm / sửa / ẩn / xóa định mức tiết/tuần', () => {
  let s = createInitialState();
  const rulesOf = () => s.checkRules[grade] || {};
  const by = () => Object.fromEntries(checkTimetable(s.timetable, index, rulesOf()).map((r) => [r.subject, r]));
  const toan = by()['TOÁN'];
  // Sửa: đặt định mức khác PPCT.
  s = reducer(s, { type: 'SET_CHECK_RULE', grade, subject: 'Toán', patch: { perWeek: toan.inTkb + 1 } });
  assert.equal(by()['TOÁN'].status, 'under');
  assert.ok(by()['TOÁN'].custom);
  // Trả về theo PPCT.
  s = reducer(s, { type: 'SET_CHECK_RULE', grade, subject: 'TOÁN', patch: { perWeek: null } });
  assert.equal(rulesOf()['TOÁN'], undefined);
  assert.equal(by()['TOÁN'].status, 'ok');
  // Thêm môn không có trong PPCT.
  s = reducer(s, { type: 'SET_CHECK_RULE', grade, subject: 'kỹ năng sống', patch: { perWeek: 1 } });
  assert.equal(by()['KỸ NĂNG SỐNG'].status, 'missing');
  // Ẩn rồi hiện lại.
  s = reducer(s, { type: 'SET_CHECK_RULE', grade, subject: 'TOÁN', patch: { hidden: true } });
  assert.equal(by()['TOÁN'], undefined);
  s = reducer(s, { type: 'SET_CHECK_RULE', grade, subject: 'TOÁN', patch: { hidden: false } });
  assert.ok(by()['TOÁN']);
  // Xóa hẳn môn tự thêm.
  s = reducer(s, { type: 'REMOVE_CHECK_RULE', grade, subject: 'KỸ NĂNG SỐNG' });
  assert.equal(by()['KỸ NĂNG SỐNG'], undefined);
  assert.deepEqual(rulesOf(), {});
});

test('Reducer: sửa ô tên bài chỉ áp dụng cho tuần đó và trả về được', () => {
  let s = createInitialState();
  s = reducer(s, { type: 'SET_LESSON', weekNum: 1, slotKey: '2-morning-2', subject: 'TOÁN', field: 'title', value: 'Sửa tay', base: 'x' });
  assert.equal(s.lessonOverrides[1]['2-morning-2'].title, 'Sửa tay');
  const w1 = flattenWeek(buildWeekLessons({ week: week1, timetable: s.timetable, index, grade, lessonOverrides: s.lessonOverrides[1] }));
  assert.equal(w1[1].title, 'Sửa tay');
  assert.ok(w1[1].editedTitle);
  const w2 = calendarData.find((w) => w.num === 2);
  const r2 = flattenWeek(buildWeekLessons({ week: w2, timetable: s.timetable, index, grade, lessonOverrides: s.lessonOverrides[2] }));
  assert.ok(!r2[1].editedTitle);
  s = reducer(s, { type: 'RESET_LESSON', weekNum: 1, slotKey: '2-morning-2', subject: 'TOÁN', field: 'title', base: 'x' });
  assert.equal(s.lessonOverrides[1], undefined);
});
