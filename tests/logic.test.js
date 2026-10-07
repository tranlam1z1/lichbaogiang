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
      if (x.subject === 'HĐTN' || x.subject === 'MĨ THUẬT') {
        // PPCT HĐTN lớp 4 và Mĩ thuật (Kết nối tri thức) đã được cập nhật theo danh mục mới, khác tên bài trong file Excel cũ.
        const entry = ppctData[grade].find((e) => e[0] === x.subject && String(e[3]) === String(x.ppct));
        assert.equal(r.title, entry[4], `tên bài dòng ${x.row}`);
        diffs.push(`dòng ${x.row} ${x.subject}: PPCT mới → "${r.title}"`);
      } else if (x.title === '' && r.title) {
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

test('Đồ dùng dạy học mặc định: TOÁN → Vở thực hành, môn khác → Tranh, ảnh, PP', () => {
  const rows = flattenWeek(buildWeekLessons({ week: week1, timetable: defaults.timetable, index, grade }));
  for (const r of rows) {
    const expected = !r.subject || r.subject === 'CHÀO CỜ' ? '' : r.subject === 'TOÁN' ? 'Vở thực hành' : 'Tranh, ảnh, PP';
    assert.equal(r.equipment, expected, `${r.subject} tiết ${r.period}`);
  }
  const slot = rows.find((r) => r.subject === 'TOÁN').key;
  const edited = flattenWeek(buildWeekLessons({
    week: week1, timetable: defaults.timetable, index, grade,
    lessonOverrides: { [slot]: { subject: 'TOÁN', equipment: '' } },
  })).find((r) => r.key === slot);
  assert.equal(edited.equipment, '');
  assert.ok(edited.editedEquipment);
});

test('Đồ dùng dạy học: đặt theo môn (để trống được), đặt riêng theo bài, sửa tay theo tuần', () => {
  let s = createInitialState();
  const build = () => flattenWeek(buildWeekLessons({
    week: week1, timetable: s.timetable, index, grade,
    equipmentDefaults: s.equipmentDefaults[grade], ppctEquipment: s.ppctEquipment[grade], lessonOverrides: s.lessonOverrides[1],
  }));
  const toan = () => build().filter((r) => r.subject === 'TOÁN');
  const other = () => build().find((r) => r.subject && r.subject !== 'TOÁN' && r.subject !== 'CHÀO CỜ');

  // Theo môn: sửa, để trống, trả về mặc định có sẵn.
  s = reducer(s, { type: 'SET_SUBJECT_EQUIPMENT', grade, subject: 'toán', value: 'Bộ đồ dùng Toán ' });
  assert.ok(toan().every((r) => r.equipment === 'Bộ đồ dùng Toán' && !r.editedEquipment));
  s = reducer(s, { type: 'SET_SUBJECT_EQUIPMENT', grade, subject: 'TOÁN', value: '' });
  assert.ok(toan().every((r) => r.equipment === ''));
  assert.equal(other().equipment, 'Tranh, ảnh, PP');
  s = reducer(s, { type: 'SET_SUBJECT_EQUIPMENT', grade, subject: 'TOÁN', value: null });
  assert.deepEqual(s.equipmentDefaults[grade], {});
  assert.ok(toan().every((r) => r.equipment === 'Vở thực hành'));
  // Gõ đúng mặc định có sẵn thì không lưu.
  s = reducer(s, { type: 'SET_SUBJECT_EQUIPMENT', grade, subject: 'TOÁN', value: 'Vở thực hành' });
  assert.deepEqual(s.equipmentDefaults[grade], {});

  // Theo bài trong PPCT: chỉ tiết dạy bài đó đổi; để trống thì dùng lại theo môn.
  const first = toan()[0];
  const key = ppctKey('TOÁN', week1.num, first.tiet);
  s = reducer(s, { type: 'SET_PPCT_EQUIPMENT', grade, key, value: 'Que tính' });
  assert.equal(toan()[0].equipment, 'Que tính');
  assert.ok(toan().slice(1).every((r) => r.equipment === 'Vở thực hành'));

  // Sửa tay trong tuần vẫn ưu tiên hơn; để trống được.
  s = reducer(s, { type: 'SET_LESSON', weekNum: 1, slotKey: first.key, subject: 'TOÁN', field: 'equipment', value: '', base: 'Que tính' });
  assert.equal(toan()[0].equipment, '');
  assert.ok(toan()[0].editedEquipment);
  s = reducer(s, { type: 'RESET_WEEK_LESSONS', weekNum: 1 });
  s = reducer(s, { type: 'SET_PPCT_EQUIPMENT', grade, key, value: '  ' });
  assert.deepEqual(s.ppctEquipment[grade], {});
  assert.equal(toan()[0].equipment, 'Vở thực hành');

  // Sao lưu cũ không có hai trường này.
  const old = reducer(createInitialState(), { type: 'RESTORE', data: { info: { grade } } });
  assert.deepEqual(old.equipmentDefaults, {});
  assert.deepEqual(old.ppctEquipment, {});
});

test('Môn không dạy: giữ tiết và tên môn, để trống tên bài; bật lại thì phần đã sửa hiện lại', () => {
  let s = createInitialState();
  const first = flattenWeek(buildWeekLessons({ week: week1, timetable: s.timetable, index, grade })).find((r) => r.subject === 'TIẾNG ANH');
  s = reducer(s, { type: 'SET_LESSON', weekNum: 1, slotKey: first.key, subject: 'TIẾNG ANH', field: 'title', value: 'Bài tự sửa', base: first.baseTitle });
  s = reducer(s, { type: 'SET_TAUGHT', subjects: ['Tiếng Anh'], taught: false });
  assert.deepEqual(s.notTaught, ['TIẾNG ANH']);

  const build = () => flattenWeek(buildWeekLessons({ week: week1, timetable: s.timetable, index, grade, lessonOverrides: s.lessonOverrides[1], notTaught: s.notTaught }));
  const off = build();
  const eng = off.filter((r) => r.subject === 'TIẾNG ANH');
  assert.ok(eng.length > 0);
  for (const r of eng) {
    assert.equal(r.notTaught, true);
    assert.equal(r.title, '');
    assert.equal(r.ppct, '');
    assert.equal(r.equipment, '');
    assert.equal(r.warning, null);
  }
  assert.equal(off.length, flattenWeek(buildWeekLessons({ week: week1, timetable: s.timetable, index, grade })).length);
  assert.ok(off.some((r) => r.subject === 'TOÁN' && r.title && !r.notTaught));

  s = reducer(s, { type: 'SET_TAUGHT', subjects: ['TIẾNG ANH'], taught: true });
  assert.deepEqual(s.notTaught, []);
  assert.equal(build().find((r) => r.key === first.key).title, 'Bài tự sửa');
});

test('Môn không dạy: sao lưu cũ không có notTaught thì dạy tất cả', () => {
  const s = reducer(createInitialState(), { type: 'RESTORE', data: { info: { grade: 4 } } });
  assert.deepEqual(s.notTaught, []);
  const t = reducer(createInitialState(), { type: 'RESTORE', data: { notTaught: ['tiếng anh', 'TIẾNG ANH', ''] } });
  assert.deepEqual(t.notTaught, ['TIẾNG ANH']);
});
