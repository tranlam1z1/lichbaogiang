import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseInline, parseMarkdown, slugify } from '../src/lib/markdown.js';

test('slug tiêu đề giống GitHub để link mục lục trong file .md vẫn chạy', () => {
  assert.equal(slugify('3. Bước 1 — Điền thông tin lớp'), '3-bước-1--điền-thông-tin-lớp');
  assert.equal(slugify('7. Bước 5 — Tải file Word / Excel'), '7-bước-5--tải-file-word--excel');
  assert.equal(slugify('11. Cần hỗ trợ?'), '11-cần-hỗ-trợ');
});

test('chữ trong dòng: đậm, nghiêng, code, link', () => {
  assert.deepEqual(parseInline('Bấm **Tải Word** rồi *chờ* `KHBD` [xem](#muc)'), [
    { type: 'text', text: 'Bấm ' },
    { type: 'strong', children: [{ type: 'text', text: 'Tải Word' }] },
    { type: 'text', text: ' rồi ' },
    { type: 'em', children: [{ type: 'text', text: 'chờ' }] },
    { type: 'text', text: ' ' },
    { type: 'code', text: 'KHBD' },
    { type: 'text', text: ' ' },
    { type: 'link', href: '#muc', children: [{ type: 'text', text: 'xem' }] },
  ]);
});

test('danh sách đánh số có danh sách con và đoạn văn tiếp nối', () => {
  const [list] = parseMarkdown('1. Một\n2. Hai:\n   - a\n   - b\n\n   Tiếp nối.\n3. Ba\n');
  assert.equal(list.type, 'list');
  assert.equal(list.ordered, true);
  assert.equal(list.items.length, 3);
  assert.deepEqual(list.items[1].map((b) => b.type), ['paragraph', 'list', 'paragraph']);
  assert.equal(list.items[1][1].items.length, 2);
});

test('bảng, trích dẫn, đường kẻ', () => {
  const blocks = parseMarkdown('| A | B |\n|---|---|\n| 1 | **2** |\n\n> Ghi chú\n\n---\n');
  assert.deepEqual(blocks.map((b) => b.type), ['table', 'quote', 'hr']);
  assert.equal(blocks[0].rows.length, 1);
  assert.equal(blocks[0].rows[0][1][0].type, 'strong');
});

test('mọi link #mục trong hướng dẫn sử dụng đều trỏ tới một tiêu đề có thật', () => {
  const source = readFileSync(new URL('../docs/HUONG_DAN_SU_DUNG.md', import.meta.url), 'utf8');
  const ids = new Set(parseMarkdown(source).filter((b) => b.type === 'heading').map((b) => b.id));
  const anchors = [...source.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(anchors.length > 0);
  for (const a of anchors) assert.ok(ids.has(a), `Không có tiêu đề cho #${a}`);
});
