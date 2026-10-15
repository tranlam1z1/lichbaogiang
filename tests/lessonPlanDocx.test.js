import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import JSZip from 'jszip';

import { buildLessonPlanDocx, lessonPlanFileName } from '../src/lib/lessonPlanDocx.js';

// File .docx nhỏ nhất Word mở được, một đoạn chữ.
async function tinyDocx(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + `<w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: 'uint8array' });
}

test('Gộp giáo án bằng altChunk: đủ part, rels, content types, ngắt trang', async () => {
  const a = await tinyDocx('Giáo án Toán — Bài 1');
  const b = await tinyDocx('Giáo án Tiếng Việt — Bài 2');
  // Một phần ArrayBuffer, một phần Blob: cả hai kiểu đầu vào đều phải chạy.
  const blob = await buildLessonPlanDocx([a.buffer, new Blob([b])]);
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  const buf = new Uint8Array(await blob.arrayBuffer());
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/giao-an-gop.docx', buf);

  const zip = await JSZip.loadAsync(buf);
  assert.deepEqual(await zip.file('word/chunk1.docx').async('uint8array'), a);
  assert.deepEqual(await zip.file('word/chunk2.docx').async('uint8array'), b);

  const doc = await zip.file('word/document.xml').async('string');
  assert.deepEqual([...doc.matchAll(/<w:altChunk r:id="(\w+)"\/>/g)].map((m) => m[1]), ['chunk1', 'chunk2']);
  assert.equal(doc.match(/<w:br w:type="page"\/>/g).length, 1);
  assert.match(doc, /<w:altChunk r:id="chunk1"\/><w:p><w:r><w:br w:type="page"\/><\/w:r><\/w:p><w:altChunk r:id="chunk2"\/>/);
  assert.match(doc, /<w:pgSz w:w="11906" w:h="16838"\/>/);

  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  for (const id of ['chunk1', 'chunk2']) {
    assert.ok(rels.includes(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="${id}.docx" TargetMode="Internal"/>`));
  }
  assert.match(await zip.file('_rels/.rels').async('string'), /Target="word\/document.xml"/);

  const types = await zip.file('[Content_Types].xml').async('string');
  assert.ok(types.includes('<Default Extension="docx" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'));
  assert.ok(types.includes('<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'));
});

test('Gộp giáo án: không có file nào thì báo lỗi', async () => {
  await assert.rejects(buildLessonPlanDocx([]), { message: 'Chưa có giáo án nào để xuất.' });
});

test('Tên file giáo án theo tuần và lớp', () => {
  assert.equal(lessonPlanFileName(5, '1A'), 'Giao-an-tuan-5-1a.docx');
  assert.equal(lessonPlanFileName(12, 'Lớp 4B'), 'Giao-an-tuan-12-lop-4b.docx');
});
