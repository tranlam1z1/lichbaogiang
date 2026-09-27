import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canUseFreeExport, exportCost, priceText, quoteExport } from '../shared/pricing.js';

const settings = { pointsPerExport: 5, pointsPerExtraWeek: 2 };

test('giá tăng dần theo số tuần: tuần đầu + mỗi tuần thêm', () => {
  assert.deepEqual([1, 2, 18, 35].map((w) => exportCost(w, settings)), [5, 7, 39, 73]);
  assert.equal(exportCost(0, settings), 0);
  // Mỗi tuần thêm 0 điểm → giá như cũ (mỗi lần tải một mức).
  assert.equal(exportCost(35, { pointsPerExport: 5, pointsPerExtraWeek: 0 }), 5);
});

test('lượt miễn phí chỉ dùng khi tải 1 tuần', () => {
  assert.equal(canUseFreeExport(1, 3), true);
  assert.equal(canUseFreeExport(1, 0), false);
  assert.equal(canUseFreeExport(2, 3), false);
});

test('báo giá: miễn phí / đủ điểm / thiếu điểm', () => {
  assert.deepEqual(quoteExport(1, { points: 10, freeExportsLeft: 2 }, settings), {
    weeks: 1, free: true, cost: 0, enough: true, pointsAfter: 10, freeAfter: 1,
  });
  const hk = quoteExport(18, { points: 100, freeExportsLeft: 2 }, settings);
  assert.equal(hk.free, false);
  assert.equal(hk.cost, 39);
  assert.equal(hk.pointsAfter, 61);
  assert.equal(hk.freeAfter, 2);
  const year = quoteExport(35, { points: 20, freeExportsLeft: 0 }, settings);
  assert.equal(year.enough, false);
  assert.equal(-year.pointsAfter, 53);
});

test('mô tả bảng giá', () => {
  assert.equal(priceText(settings), '1 tuần: 5 điểm, mỗi tuần thêm: 2 điểm');
  assert.equal(priceText({ pointsPerExport: 5, pointsPerExtraWeek: 0 }), '5 điểm mỗi lần tải');
});
