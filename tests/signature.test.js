// Khối chữ ký cuối mỗi tuần khi xuất Word/Excel: 4 trường hợp (không ai / chỉ GV / chỉ TTCM / cả hai có ảnh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';

import ppctData from '../src/data/ppct.json';
import calendarData from '../src/data/calendar.json';
import defaults from '../src/data/defaults.json';
import { buildPpctIndex } from '../src/lib/ppct.js';
import { buildExportWeeks, weeksInRange } from '../src/lib/range.js';
import { buildDocx, docxToBuffer, fitWeek } from '../src/lib/exportDocx.js';
import { buildWorkbook } from '../src/lib/exportXlsx.js';
import { signatureImage, fitBox } from '../src/lib/signature.js';
import { reducer, createInitialState, hydrate, toBackup } from '../src/state/reducer.js';

// ---------- Ảnh PNG mẫu (nền trong suốt, một nét lượn sóng), tạo bằng zlib để không cần canvas ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function samplePng(width, height, color = [20, 40, 160]) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let x = 0; x < width; x += 1) {
    const yc = Math.round(height / 2 + (height / 3) * Math.sin((x / width) * Math.PI * 4));
    for (let y = Math.max(0, yc - 2); y <= Math.min(height - 1, yc + 2); y += 1) {
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = color[0];
      raw[o + 1] = color[1];
      raw[o + 2] = color[2];
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const TEACHER_IMG = samplePng(400, 150); // tỉ lệ thường gặp
const LEADER_IMG = samplePng(400, 40, [160, 20, 20]); // rất dẹt → bị giới hạn theo chiều rộng

const CASES = [
  { key: 'khong-ai', label: 'không ai có chữ ký', teacher: false, leader: false },
  { key: 'chi-gv', label: 'chỉ giáo viên có', teacher: true, leader: false },
  { key: 'chi-tt', label: 'chỉ tổ trưởng có', teacher: false, leader: true },
  { key: 'ca-hai', label: 'cả hai đều có', teacher: true, leader: true },
];

function infoFor(c) {
  return {
    ...defaults.info,
    leader: 'Lê Văn Tổ',
    signatures: {
      teacher: { enabled: c.teacher, image: TEACHER_IMG },
      // Trường hợp không bật: vẫn có ảnh nhưng tắt công tắc → không được chèn.
      leader: { enabled: c.leader, image: c.leader ? LEADER_IMG : '' },
    },
  };
}

const grade = defaults.info.grade;
const allWeeks = buildExportWeeks({
  weeks: weeksInRange(calendarData, { type: 'year' }),
  timetable: defaults.timetable,
  index: buildPpctIndex(ppctData[grade]),
  grade,
});
// Tuần dài nhất (nhiều dòng chữ nhất) và vài tuần đầu — đủ để kiểm tra tràn trang.
const textLen = (w) => w.rows.reduce((n, r) => n + (r.title || '').length + (r.equipment || '').length, 0);
const busiest = [...allWeeks].sort((a, b) => b.rows.length - a.rows.length || textLen(b) - textLen(a))[0];
const sampleWeeks = [...new Set([...allWeeks.slice(0, 3), busiest])];

test('signatureImage: chỉ trả ảnh khi bật công tắc và có ảnh hợp lệ', () => {
  assert.equal(signatureImage(undefined), null);
  assert.equal(signatureImage({ enabled: true, image: '' }), null);
  assert.equal(signatureImage({ enabled: false, image: TEACHER_IMG }), null);
  assert.equal(signatureImage({ enabled: 'true', image: TEACHER_IMG }), null);
  assert.equal(signatureImage({ enabled: true, image: 'data:image/png;base64,AAAA' }), null);
  const img = signatureImage({ enabled: true, image: TEACHER_IMG });
  assert.deepEqual([img.type, img.width, img.height], ['png', 400, 150]);
  // Giữ tỉ lệ khi co vào khung.
  const box = fitBox(img, 227, 68);
  assert.equal(box.height, 68);
  assert.ok(Math.abs(box.width / box.height - 400 / 150) < 0.05);
  const wide = fitBox(signatureImage({ enabled: true, image: LEADER_IMG }), 227, 68);
  assert.equal(wide.width, 227);
  assert.ok(wide.height < 68);
});

test('Sao lưu / khôi phục / đặt lại giữ đúng chữ ký; bản sao lưu cũ không có signatures vẫn khôi phục được', () => {
  let s = createInitialState();
  assert.deepEqual(s.info.signatures, { teacher: { enabled: false, image: '' }, leader: { enabled: false, image: '' } });
  assert.equal(s.info.leader, '');

  s = reducer(s, { type: 'SET_INFO', patch: { leader: 'Lê Văn Tổ', signatures: { ...s.info.signatures, teacher: { enabled: true, image: TEACHER_IMG } } } });
  const restored = reducer(createInitialState(), { type: 'RESTORE', data: JSON.parse(JSON.stringify(toBackup(s))) });
  assert.equal(restored.info.leader, 'Lê Văn Tổ');
  assert.deepEqual(restored.info.signatures.teacher, { enabled: true, image: TEACHER_IMG });
  assert.deepEqual(restored.info.signatures.leader, { enabled: false, image: '' });

  // Bản sao lưu cũ: info không có leader / signatures.
  const old = toBackup(createInitialState());
  delete old.data.info.leader;
  delete old.data.info.signatures;
  old.data.info.teacher = 'Giáo viên cũ';
  const fromOld = reducer(s, { type: 'RESTORE', data: old });
  assert.equal(fromOld.info.teacher, 'Giáo viên cũ');
  assert.equal(fromOld.info.leader, '');
  assert.deepEqual(fromOld.info.signatures, { teacher: { enabled: false, image: '' }, leader: { enabled: false, image: '' } });

  // Chỉ có một phần / dữ liệu hỏng.
  const partial = hydrate({ info: { signatures: { leader: { enabled: true, image: 'javascript:alert(1)' } } } });
  assert.deepEqual(partial.info.signatures, { teacher: { enabled: false, image: '' }, leader: { enabled: true, image: '' } });

  const reset = reducer(s, { type: 'RESET_ALL' });
  assert.deepEqual(reset.info.signatures, createInitialState().info.signatures);
});

test('Tính cỡ chữ Word có trừ chiều cao khối chữ ký', () => {
  // Không có khối chữ ký thì tuần dài nhất vừa trang ở cỡ ≥ 9pt (README); thêm khối chữ ký thì cỡ chữ không tăng.
  const pt = fitWeek(busiest.rows).bodyPt;
  assert.ok(pt >= 7 && pt <= 12);
  console.log(`  tuần ${busiest.week.num}: ${busiest.rows.length} dòng, cỡ chữ dọc ${pt}pt, ngang ${fitWeek(busiest.rows, 'landscape').bodyPt}pt`);
});

for (const c of CASES) {
  for (const orientation of ['portrait', 'landscape']) {
    test(`Xuất Word + Excel (${orientation === 'portrait' ? 'dọc' : 'ngang'}): ${c.label}`, async () => {
      const info = infoFor(c);
      const expected = Number(c.teacher) + Number(c.leader);
      mkdirSync('tests/out', { recursive: true });
      const suffix = `${c.key}${orientation === 'landscape' ? '-ngang' : ''}`;

      // Word
      const buf = await docxToBuffer(buildDocx(sampleWeeks, info, { orientation }));
      writeFileSync(`tests/out/chu-ky-${suffix}.docx`, buf);
      const docx = await JSZip.loadAsync(buf);
      const xml = await docx.file('word/document.xml').async('string');
      const media = Object.keys(docx.files).filter((f) => f.startsWith('word/media/') && !docx.files[f].dir);
      assert.equal(xml.match(/<w:drawing>/g)?.length ?? 0, expected * sampleWeeks.length, 'số ảnh chữ ký trong Word');
      assert.equal(media.length, expected, 'ảnh trùng nhau chỉ lưu một lần');
      assert.equal(xml.match(/TỔ TRƯỞNG CHUYÊN MÔN/g).length, sampleWeeks.length);
      assert.equal(xml.match(/\(Ký, ghi rõ họ tên\)/g).length, 2 * sampleWeeks.length);
      assert.equal(xml.match(/Lê Văn Tổ/g).length, sampleWeeks.length);
      // Ảnh cao tối đa 1,8 cm (EMU) và không rộng hơn nửa trang.
      for (const [, cx, cy] of xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)) {
        assert.ok(Number(cy) <= 1.8 * 360000 + 10000, `ảnh cao ${cy} EMU`);
        assert.ok(Number(cx) <= 6 * 360000 + 10000, `ảnh rộng ${cx} EMU`);
      }

      // Excel
      const wb = buildWorkbook(sampleWeeks, info, { orientation });
      const xbuf = await wb.xlsx.writeBuffer();
      writeFileSync(`tests/out/chu-ky-${suffix}.xlsx`, Buffer.from(xbuf));
      for (const ws of wb.worksheets) {
        assert.equal(ws.pageSetup.fitToHeight, 1, `${ws.name}: in vừa 1 trang`);
        const images = ws.getImages();
        assert.equal(images.length, expected, `${ws.name}: số ảnh`);
        const printEnd = Number(ws.pageSetup.printArea.split(':')[1].replace(/\D/g, ''));
        const titleRow = [...Array(printEnd + 1).keys()].find((i) => i && ws.getCell(i, 1).value === 'GIÁO VIÊN');
        assert.ok(titleRow, `${ws.name}: có khối chữ ký`);
        assert.equal(ws.getCell(titleRow, 6).value, 'TỔ TRƯỞNG CHUYÊN MÔN');
        assert.equal(ws.getCell(printEnd, 1).value, defaults.info.teacher, 'vùng in bao cả dòng họ tên');
        assert.equal(ws.getCell(printEnd, 6).value, 'Lê Văn Tổ');
        for (const img of images) {
          // Ảnh nằm trong dòng vùng ký, bên trong vùng in.
          assert.equal(img.range.tl.nativeRow, titleRow + 1, `${ws.name}: ảnh neo đúng dòng ký`);
          assert.ok(img.range.ext.height <= 68 && img.range.ext.width <= 227);
          assert.ok(img.range.tl.nativeRow + 1 <= printEnd);
        }
      }
    });
  }
}

test('Tên để trống thì bỏ dòng họ tên, vẫn giữ chỗ ký', async () => {
  const info = { ...defaults.info, teacher: '', leader: '' };
  const xml = await (await JSZip.loadAsync(await docxToBuffer(buildDocx(sampleWeeks.slice(0, 1), info)))).file('word/document.xml').async('string');
  assert.ok(xml.includes('w:lineRule="atLeast"'));
  const ws = buildWorkbook(sampleWeeks.slice(0, 1), info).worksheets[0];
  const printEnd = Number(ws.pageSetup.printArea.split(':')[1].replace(/\D/g, ''));
  assert.equal(ws.getRow(printEnd).height, 54, 'dòng cuối vùng in là vùng ký');
});

for (const orientation of ['portrait', 'landscape']) {
  test(`Bỏ cột "Đồ dùng dạy học" (${orientation === 'portrait' ? 'dọc' : 'ngang'}): Word và Excel chỉ còn 6 cột`, async () => {
    const weeks = sampleWeeks.slice(0, 1);
    const xml = await (await JSZip.loadAsync(await docxToBuffer(buildDocx(weeks, defaults.info, { orientation, equipment: false })))).file('word/document.xml').async('string');
    assert.ok(!xml.includes('Đồ dùng dạy học'));
    assert.ok(xml.includes('Tên bài dạy'));
    const full = await (await JSZip.loadAsync(await docxToBuffer(buildDocx(weeks, defaults.info, { orientation })))).file('word/document.xml').async('string');
    assert.ok(full.includes('Đồ dùng dạy học'), 'mặc định vẫn có cột đồ dùng');

    const ws = buildWorkbook(weeks, defaults.info, { orientation, equipment: false }).worksheets[0];
    assert.equal(ws.columns.length, 6);
    assert.equal(ws.getCell(5, 6).value, 'Tên bài dạy');
    assert.equal(ws.getCell(5, 7).value, null);
    assert.match(ws.pageSetup.printArea, /^A1:F\d+$/);
  });
}
