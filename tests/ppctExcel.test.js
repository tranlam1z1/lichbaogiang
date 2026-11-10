import { test } from 'node:test';
import assert from 'node:assert/strict';
import ppctData from '../src/data/ppct.json';
import { ppctToWorkbook, rowsFromXlsx } from '../src/lib/ppctExcel.js';

test('PPCT xuất ra Excel rồi đọc lại giữ nguyên từng dòng', async () => {
  const rows = ppctData['3'];
  const buf = await ppctToWorkbook(rows, 3).xlsx.writeBuffer();
  assert.deepEqual(await rowsFromXlsx(buf), rows);
});

test('đọc Excel: bỏ dòng trống, ô sai kiểu thành NaN để server báo lỗi', async () => {
  const wb = ppctToWorkbook([['TOÁN', 1, 1, 1, 'Bài 1']], 1);
  const ws = wb.worksheets[0];
  ws.addRow([]);
  ws.addRow(['TOÁN', 'một', 2, 2, { richText: [{ text: 'Bài ' }, { text: '2' }] }]);
  const rows = await rowsFromXlsx(await wb.xlsx.writeBuffer());
  assert.equal(rows.length, 2);
  assert.ok(Number.isNaN(rows[1][1]));
  assert.equal(rows[1][4], 'Bài 2');
});
