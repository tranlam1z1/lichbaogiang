import { test } from 'node:test';
import assert from 'node:assert/strict';

import defaults from '../src/data/defaults.json';
import {
  applyTimetable,
  buildSubjectMatcher,
  parseDay,
  parseTimetable,
  parseTsv,
  readSubjectCell,
} from '../src/utils/parseTimetable.js';

const subjects = defaults.subjectCatalog;
const matcher = buildSubjectMatcher(subjects);
const tsv = (rows) => rows.map((r) => r.join('\t')).join('\r\n');
const at = (res, key) => res.entries.find((e) => e.key === key);

test('Đọc tên thứ: có dấu / không dấu / viết tắt / hoa thường', () => {
  for (const v of ['Thứ 2', 'THỨ HAI', 'thu hai', 'T2', 't.2', 'Hai', '  thứ   2 ']) assert.equal(parseDay(v), 2, v);
  assert.equal(parseDay('Thứ Tư'), 4);
  assert.equal(parseDay('Năm'), 5);
  assert.equal(parseDay('Thứ 7'), 7);
  assert.equal(parseDay('Tiết'), null);
  assert.equal(parseDay('Buổi'), null);
});

test('Đọc tên môn trong ô', () => {
  const ok = {
    'Toán': 'TOÁN',
    'toan': 'TOÁN',
    '  TOÁN  ': 'TOÁN',
    'T.Việt': 'TIẾNG VIỆT',
    'TV': 'TIẾNG VIỆT',
    'Tiếng Anh (P.12)': 'TIẾNG ANH',
    'T.Anh-P12': 'TIẾNG ANH',
    'TA': 'TIẾNG ANH',
    'tnxh': 'TN&XH',
    'TN - XH': 'TN&XH',
    'Lịch sử và Địa lí': 'LS&ĐL',
    'Mỹ thuật': 'MĨ THUẬT',
    'Thể dục': 'GDTC',
    'Chào cờ': 'CHÀO CỜ',
    'Toán - cô Lan': 'TOÁN',
    'Toán (cô An)': 'TOÁN',
  };
  for (const [raw, subject] of Object.entries(ok)) {
    const r = readSubjectCell(raw, matcher);
    assert.equal(r.status, 'ok', raw);
    assert.equal(r.subject, subject, raw);
  }
  assert.equal(readSubjectCell('', matcher).status, 'empty');
  assert.equal(readSubjectCell('  - ', matcher).status, 'empty');
  assert.deepEqual(readSubjectCell('Toán, TV', matcher), { status: 'multi', subject: '', candidates: ['TOÁN', 'TIẾNG VIỆT'] });
  assert.equal(readSubjectCell('Toán / Tiếng Việt', matcher).status, 'multi');
  assert.deepEqual(readSubjectCell('STEM', matcher), { status: 'new', subject: 'STEM', candidates: [] });
  assert.equal(readSubjectCell('12', matcher).status, 'invalid');
});

test('Dán từ Excel: ô có xuống dòng được bọc nháy', () => {
  const rows = parseTsv('A\t"Toán\ncô Lan"\tB\r\nC\t"a ""b"""\t');
  assert.deepEqual(rows, [['A', 'Toán\ncô Lan', 'B'], ['C', 'a "b"', '']]);
});

test('Kiểu lưới: "Sáng 1", "C2", thứ 7 bị bỏ qua và báo', () => {
  const text = tsv([
    ['THỜI KHÓA BIỂU LỚP 4A'],
    ['', 'Thứ Hai', 'Thứ 3', 'T4', 'thu nam', 'Sáu', 'Thứ 7'],
    ['Sáng 1', 'Chào cờ', 'T.Việt', 'Tiếng Anh', 'Toán', 'Toán', 'Toán'],
    ['S2', 'Toán', 'TV', '', 'Toán, TV', 'Toán', ''],
    ['Chiều 1', 'Tin học', 'Khoa học', '', '', 'STEM', ''],
    ['C2', 'GDTC', '12', '', '', '', ''],
  ]);
  const res = parseTimetable(text, { subjects });
  assert.equal(res.kind, 'grid');
  assert.equal(res.error, null);
  assert.equal(res.ignored.saturday, 1);
  assert.equal(at(res, '2-morning-1').subject, 'CHÀO CỜ');
  assert.equal(at(res, '3-morning-1').subject, 'TIẾNG VIỆT');
  assert.equal(at(res, '4-morning-1').subject, 'TIẾNG ANH');
  assert.equal(at(res, '5-morning-2').status, 'multi');
  assert.equal(at(res, '6-afternoon-1').status, 'new');
  assert.equal(at(res, '3-afternoon-2').status, 'invalid');
  assert.equal(at(res, '2-afternoon-2').subject, 'GDTC');
  assert.equal(at(res, '4-morning-2'), undefined, 'ô trống bị bỏ qua');
  assert.deepEqual(res.periods, { morning: 2, afternoon: 2 });
});

test('Kiểu lưới: cột buổi gộp ô + cột tiết (giống bảng của ứng dụng)', () => {
  const text = tsv([
    ['Buổi', 'Tiết', 'Thứ 2', 'Thứ 3'],
    ['Sáng', '1', 'HĐTN', 'Tiếng Việt'],
    ['', '2', 'Toán', 'Tiếng Việt'],
    ['Chiều', '1', 'Tin học', 'Tiếng Việt'],
    ['', '2', 'GDTC', 'Khoa học'],
  ]);
  const res = parseTimetable(text, { subjects });
  assert.equal(at(res, '2-morning-2').subject, 'TOÁN');
  assert.equal(at(res, '2-afternoon-2').subject, 'GDTC');
  assert.equal(at(res, '3-afternoon-2').subject, 'KHOA HỌC');
});

test('Kiểu lưới: chỉ có "Tiết 1" … "Tiết 9" → tiết 6 là chiều tiết 1', () => {
  const rows = [['Tiết', 'Thứ 2', 'Thứ 3']];
  for (let p = 1; p <= 9; p += 1) rows.push([`Tiết ${p}`, `Toán`, p === 6 ? 'Tin học' : '']);
  const res = parseTimetable(tsv(rows), { subjects });
  assert.equal(at(res, '2-morning-5').subject, 'TOÁN');
  assert.equal(at(res, '3-afternoon-1').subject, 'TIN HỌC');
  assert.equal(at(res, '2-afternoon-4').subject, 'TOÁN');
  assert.deepEqual(res.periods, { morning: 5, afternoon: 4 });
});

test('Kiểu lưới: dòng "Sáng" / "Chiều" riêng, các tiết đánh số lại từ 1', () => {
  const res = parseTimetable(tsv([
    ['', 'Thứ 2', 'Thứ 3'],
    ['Sáng', '', ''],
    ['Tiết 1', 'Toán', 'TV'],
    ['Chiều', '', ''],
    ['Tiết 1', 'Tin', 'Âm nhạc'],
  ]), { subjects });
  assert.equal(at(res, '2-afternoon-1').subject, 'TIN HỌC');
  assert.equal(at(res, '3-afternoon-1').subject, 'ÂM NHẠC');
});

test('Kiểu danh sách: Thứ | Buổi | Tiết | Môn, ô thứ gộp', () => {
  const res = parseTimetable(tsv([
    ['Thứ', 'Buổi', 'Tiết', 'Môn'],
    ['Thứ 2', 'Sáng', '1', 'Chào cờ'],
    ['', '', '2', 'Toán'],
    ['', 'Chiều', '1', 'T.Anh (P.12)'],
    ['thu ba', 'S', '1', 'tieng viet'],
    ['Thứ 7', 'S', '1', 'Toán'],
  ]), { subjects });
  assert.equal(res.kind, 'list');
  assert.equal(at(res, '2-morning-2').subject, 'TOÁN');
  assert.equal(at(res, '2-afternoon-1').subject, 'TIẾNG ANH');
  assert.equal(at(res, '3-morning-1').subject, 'TIẾNG VIỆT');
  assert.equal(res.ignored.saturday, 1);
});

test('Kiểu danh sách không có tiêu đề, tiết 1–9 không ghi buổi', () => {
  const res = parseTimetable(tsv([
    ['2', '', '1', 'Toán'],
    ['2', '', '7', 'Mĩ thuật'],
  ]), { subjects });
  assert.equal(res.kind, 'list');
  assert.equal(at(res, '2-afternoon-2').subject, 'MĨ THUẬT');
});

test('Không nhận ra bảng thì báo lỗi', () => {
  assert.ok(parseTimetable('xin chào\ttạm biệt', { subjects }).error);
  assert.ok(parseTimetable('', { subjects }).error);
});

test('Áp dụng: thay toàn bộ / chỉ điền thêm', () => {
  const cells = [
    { day: 2, session: 'morning', period: 1, subject: 'TOÁN' },
    { day: 2, session: 'morning', period: 5, subject: 'TIN HỌC' },
  ];
  const replaced = applyTimetable(defaults.timetable, cells, 'replace', { morning: 5, afternoon: 0 });
  assert.equal(replaced.days[2].morning[0], 'TOÁN');
  assert.equal(replaced.days[3].morning[0], '', 'TKB cũ bị xóa');
  assert.equal(replaced.morningCount, 5);
  assert.equal(replaced.afternoonCount, 0);

  const merged = applyTimetable(defaults.timetable, cells, 'merge');
  assert.equal(merged.days[2].morning[0], 'HĐTN', 'giữ tiết đã có');
  assert.equal(merged.days[2].morning[4], 'TIN HỌC', 'điền vào ô trống');
  assert.equal(merged.days[3].morning[0], 'TIẾNG VIỆT');
  assert.equal(merged.morningCount, 5);
  assert.equal(merged.afternoonCount, defaults.timetable.afternoonCount);
});
