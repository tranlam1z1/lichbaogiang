import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dismissedIds, loginKey, pendingModals, withDismissed } from '../src/lib/announcements.js';

const items = [
  { id: 1, placement: 'MODAL' },
  { id: 2, placement: 'LEFT' },
  { id: 3, placement: 'MODAL' },
];

test('modal đã đóng không hiện lại trong cùng lần đăng nhập', () => {
  const login = loginKey({ id: 5, lastLoginAt: '2026-11-10T08:00:00.000Z' });
  const raw = withDismissed(null, login, [1]);
  assert.deepEqual(pendingModals(items, dismissedIds(raw, login)).map((a) => a.id), [3]);
  const raw2 = withDismissed(raw, login, [3, 1]);
  assert.deepEqual(dismissedIds(raw2, login), [1, 3]);
});

test('đăng nhập lại (lastLoginAt đổi) hoặc người khác đăng nhập thì modal hiện lại', () => {
  const raw = withDismissed(null, loginKey({ id: 5, lastLoginAt: 'A' }), [1, 3]);
  assert.deepEqual(dismissedIds(raw, loginKey({ id: 5, lastLoginAt: 'B' })), []);
  assert.deepEqual(dismissedIds(raw, loginKey({ id: 6, lastLoginAt: 'A' })), []);
});

test('dữ liệu lưu hỏng hoặc trống không làm lỗi', () => {
  for (const raw of [null, '', '{', '"x"', '{"login":"5:A","ids":"1"}']) {
    assert.deepEqual(dismissedIds(raw, '5:A'), []);
  }
});

test('chỉ thông báo MODAL được đưa vào modal', () => {
  assert.deepEqual(pendingModals(items, []).map((a) => a.id), [1, 3]);
});
