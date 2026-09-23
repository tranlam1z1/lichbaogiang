import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';

import ppctData from '../src/data/ppct.json';
import calendarData from '../src/data/calendar.json';
import defaults from '../src/data/defaults.json';
import { buildPpctIndex } from '../src/lib/ppct.js';
import { buildExportWeeks, weeksInRange } from '../src/lib/range.js';
import { buildDocx, docxToBuffer, fitWeek } from '../src/lib/exportDocx.js';

test('Xuất Word cả năm: mỗi tuần học một section', async () => {
  const grade = defaults.info.grade;
  const weeks = weeksInRange(calendarData, { type: 'year' });
  const data = buildExportWeeks({ weeks, timetable: defaults.timetable, index: buildPpctIndex(ppctData[grade]), grade });
  const doc = buildDocx(data, defaults.info);
  const buf = await docxToBuffer(doc);
  assert.ok(buf.length > 10000);
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/lich-bao-giang-ca-nam.docx', buf);
  const sizes = data.map((w) => fitWeek(w.rows).bodyPt);
  console.log(`  ${data.length} tuần, cỡ chữ bảng: ${Math.min(...sizes)}–${Math.max(...sizes)}pt`);
  // Số trang thực tế được kiểm bằng LibreOffice: xem README (mục Kiểm tra).
});
