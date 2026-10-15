import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guessLabel, validateFileName, resolveWeekPlans, labelKey } from '../src/lib/lessonPlans.js';

const SUBJECTS = ['TOÁN', 'TIẾNG VIỆT', 'TIẾNG ANH', 'HĐTN', 'TOÁN TĂNG CƯỜNG'];

test('Đoán nhãn từ tên file', () => {
  assert.deepEqual(guessLabel('Toán tuần 4.docx', SUBJECTS), { subject: 'TOÁN', kind: 'week', num: 4 });
  assert.deepEqual(guessLabel('toan_tuan_4.docx', SUBJECTS), { subject: 'TOÁN', kind: 'week', num: 4 });
  assert.deepEqual(guessLabel('Tieng Viet - tiet16.docx', SUBJECTS), { subject: 'TIẾNG VIỆT', kind: 'lesson', num: 16 });
  assert.deepEqual(guessLabel('TV t16.docx', SUBJECTS), { subject: 'TIẾNG VIỆT', kind: 'lesson', num: 16 });
  // Có cả tuần và tiết → ưu tiên tiết; môn dài nhất thắng.
  assert.deepEqual(guessLabel('Toan tang cuong tuan4 tiet 7.docx', SUBJECTS), {
    subject: 'TOÁN TĂNG CƯỜNG',
    kind: 'lesson',
    num: 7,
  });
  assert.deepEqual(guessLabel('HDTN.docx', SUBJECTS), { subject: 'HĐTN', kind: null, num: null });
  assert.deepEqual(guessLabel('giao an.docx', SUBJECTS), { subject: null, kind: null, num: null });
  // "ta" chỉ nhận khi khối có môn Tiếng Anh; "toantv" không phải ranh giới từ.
  assert.equal(guessLabel('ta tuan 2.docx', ['TOÁN']).subject, null);
  assert.equal(guessLabel('toantv.docx', SUBJECTS).subject, null);
});

test('Kiểm tra đuôi file', () => {
  assert.equal(validateFileName('a.docx'), null);
  assert.equal(validateFileName('A.DOCX'), null);
  assert.match(validateFileName('x.doc'), /«x.doc» là định dạng Word cũ/);
  assert.equal(validateFileName('x.pdf'), '«x.pdf» không phải file Word .docx.');
});

const row = (subject, ppct, extra = {}) => ({ subject, ppct, key: `${subject}${ppct}`, ...extra });
const plan = (subject, kind, num) => ({ id: `${subject}-${kind}-${num}`, grade: 4, subject, kind, num, blob: {} });

// Thứ Hai: Chào cờ, Toán 6, TV 11, ô trống; Thứ Ba: Toán 7, TV 12, Tin học (không dạy), Toán 8
const ROWS = [
  row('CHÀO CỜ', ''),
  row('TOÁN', 6),
  row('TIẾNG VIỆT', 11),
  row('', ''),
  row('TOÁN', 7),
  row('TIẾNG VIỆT', 12),
  row('TIN HỌC', 3, { notTaught: true }),
  row('TOÁN', '8'),
];
const statuses = (r) => r.items.map((i) => i.status);

test('Khớp theo tiết: thứ tự TKB, bỏ qua tiết không tính', () => {
  const tv11 = plan('TIẾNG VIỆT', 'lesson', 11);
  const t8 = plan('TOÁN', 'lesson', 8);
  const t6 = plan('TOÁN', 'lesson', 6);
  const r = resolveWeekPlans({ rows: ROWS, weekNum: 2, plans: [tv11, t8, t6, plan('TIN HỌC', 'lesson', 3)] });
  assert.deepEqual(statuses(r), ['skip', 'file', 'file', 'skip', 'missing', 'missing', 'skip', 'file']);
  assert.deepEqual(r.files, [t6, tv11, t8]);
  assert.equal(r.counted, 5);
  assert.equal(r.covered, 3);
  assert.deepEqual(r.conflicts, []);
});

test('File cả tuần đặt ở tiết đầu, xuất một lần', () => {
  const w = plan('TOÁN', 'week', 2);
  const tv12 = plan('TIẾNG VIỆT', 'lesson', 12);
  const r = resolveWeekPlans({ rows: ROWS, weekNum: 2, plans: [w, tv12, plan('TOÁN', 'week', 3)] });
  assert.deepEqual(statuses(r), ['skip', 'file', 'missing', 'skip', 'inWeekFile', 'file', 'skip', 'inWeekFile']);
  assert.equal(r.items[4].plan, w);
  assert.deepEqual(r.files, [w, tv12]);
  assert.equal(r.covered, 4);
});

test('Trùng nhãn: cần chọn, rồi chọn cả tuần hoặc theo tiết', () => {
  const w = plan('TOÁN', 'week', 2);
  const t7 = plan('TOÁN', 'lesson', 7);
  const plans = [w, t7];

  const need = resolveWeekPlans({ rows: ROWS, weekNum: 2, plans });
  assert.deepEqual(statuses(need), ['skip', 'needChoice', 'missing', 'skip', 'needChoice', 'missing', 'skip', 'needChoice']);
  assert.deepEqual(need.conflicts, ['TOÁN']);
  assert.deepEqual(need.files, []);
  assert.equal(need.items[1].plan, null);

  const week = resolveWeekPlans({ rows: ROWS, weekNum: 2, plans, choices: { TOÁN: 'week' } });
  assert.deepEqual(statuses(week), ['skip', 'file', 'missing', 'skip', 'inWeekFile', 'missing', 'skip', 'inWeekFile']);
  assert.deepEqual(week.files, [w]);
  assert.deepEqual(week.conflicts, []);

  const lesson = resolveWeekPlans({ rows: ROWS, weekNum: 2, plans, choices: { TOÁN: 'lesson' } });
  assert.deepEqual(statuses(lesson), ['skip', 'missing', 'missing', 'skip', 'file', 'missing', 'skip', 'missing']);
  assert.deepEqual(lesson.files, [t7]);
  assert.equal(lesson.covered, 1);
});

test('Cùng một giáo án trên hai dòng chỉ xuất một lần', () => {
  const t6 = plan('TOÁN', 'lesson', 6);
  const r = resolveWeekPlans({ rows: [row('TOÁN', 6), row('TOÁN', 6)], weekNum: 1, plans: [t6] });
  assert.deepEqual(r.files, [t6]);
  assert.equal(r.covered, 2);
});

test('Khóa nhãn', () => {
  assert.equal(labelKey({ grade: 4, subject: 'TOÁN', kind: 'week', num: 3 }), '4|TOÁN|week|3');
});
