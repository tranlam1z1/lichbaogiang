// Xuất Kế hoạch giảng dạy ra Excel (.xlsx): mỗi tuần một sheet "Tuần N", in vừa khổ A4.
import ExcelJS from 'exceljs';
import { formatDM, formatDMY } from './calendar.js';
import { weekLine } from './range.js';
import { fitBox, signatureImage } from './signature.js';

const FONT = 'Times New Roman';
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

export const XLSX_COLUMNS = [
  { key: 'day', header: 'Thứ, ngày', width: 10 },
  { key: 'session', header: 'Buổi', width: 7 },
  { key: 'period', header: 'Tiết', width: 5 },
  { key: 'subject', header: 'Môn', width: 14 },
  { key: 'ppct', header: 'Tiết PPCT', width: 7 },
  { key: 'title', header: 'Tên bài dạy', width: 46 },
  { key: 'equipment', header: 'Đồ dùng dạy học', width: 18 },
];

// Khổ ngang: bề ngang rộng hơn, cột "Tên bài dạy" được giãn nhiều nhất.
const LANDSCAPE_WIDTHS = { day: 11, session: 8, period: 6, subject: 16, ppct: 8, title: 78, equipment: 26 };

/** Bỏ cột "Đồ dùng dạy học" thì cột "Tên bài dạy" nhận luôn phần bề ngang đó. */
function columnsFor(orientation, equipment = true) {
  const columns = orientation === 'landscape'
    ? XLSX_COLUMNS.map((c) => ({ ...c, width: LANDSCAPE_WIDTHS[c.key] }))
    : XLSX_COLUMNS;
  if (equipment) return columns;
  const eq = columns.find((c) => c.key === 'equipment').width;
  return columns.filter((c) => c.key !== 'equipment').map((c) => (c.key === 'title' ? { ...c, width: c.width + eq } : c));
}

function styleRange(ws, r1, r2, c1, c2, fn) {
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) fn(ws.getCell(r, c));
}

/** Ước lượng chiều cao dòng; số kí tự mỗi dòng tỉ lệ với độ rộng cột (dọc: 52 và 19 kí tự). */
function estimateHeight(r, widths) {
  const lines = Math.max(
    Math.ceil((r.title || '').length / ((52 * widths.title) / 46)) || 1,
    widths.equipment ? Math.ceil((r.equipment || '').length / ((19 * widths.equipment) / 18)) || 1 : 1,
  );
  return Math.max(16, lines * 14 + 2);
}

function addWeekSheet(wb, info, week, rows, orientation, equipment, signature) {
  const columns = columnsFor(orientation, equipment);
  const col = Object.fromEntries(columns.map((c, i) => [c.key, i + 1]));
  const widths = Object.fromEntries(columns.map((c) => [c.key, c.width]));
  const landscape = orientation === 'landscape';
  const ws = wb.addWorksheet(`Tuần ${week.num}`, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: landscape ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      // Cả tuần (kể cả khối chữ ký cuối trang) vừa đúng 1 trang, dọc hay ngang đều vậy.
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const last = columns.length;

  const put = (row, col, value, font = {}, alignment = {}) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = { name: FONT, size: 12, ...font };
    cell.alignment = { vertical: 'middle', wrapText: true, ...alignment };
    return cell;
  };

  // Đầu trang
  ws.mergeCells(1, 1, 1, last);
  put(1, 1, 'KẾ HOẠCH GIẢNG DẠY', { bold: true, size: 16, color: { argb: 'FFFF0000' } }, { horizontal: 'center' });
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, last);
  put(2, 1, weekLine(info, week), { bold: true, size: 13, color: { argb: 'FF00B050' } }, { horizontal: 'center' });
  ws.mergeCells(3, 1, 3, last);
  put(3, 1, `Từ ngày ${formatDMY(week.start)} đến ngày ${formatDMY(week.end)}`, { italic: true }, { horizontal: 'center' });

  // Tiêu đề bảng
  const headRow = 5;
  columns.forEach((c, i) => {
    put(headRow, i + 1, c.header, { bold: true, size: 11 }, { horizontal: 'center' }).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
  });
  ws.getRow(headRow).height = 30;

  // Nội dung
  let r = headRow + 1;
  const firstBody = r;
  for (const row of rows) {
    if (row.dayRowSpan > 0) {
      const dayFont = { name: FONT, size: 11, bold: true };
      const dayText = row.date
        ? { richText: [{ text: `${row.dayLabel}\n`, font: dayFont }, { text: formatDM(row.date), font: { ...dayFont, color: { argb: 'FFFF0000' } } }] }
        : row.dayLabel;
      put(r, 1, dayText, { bold: true, size: 11 }, { horizontal: 'center' });
      if (row.dayRowSpan > 1) ws.mergeCells(r, 1, r + row.dayRowSpan - 1, 1);
    }
    if (row.sessionRowSpan > 0) {
      put(r, 2, row.sessionLabel, { bold: true, size: 11, color: { argb: 'FF8B4513' } }, { horizontal: 'center' });
      if (row.sessionRowSpan > 1) ws.mergeCells(r, 2, r + row.sessionRowSpan - 1, 2);
    }
    put(r, col.period, row.period, { size: 11 }, { horizontal: 'center' });
    put(r, col.subject, row.subject, { bold: true, size: 11 });
    put(r, col.ppct, row.ppct === '' || row.ppct == null ? '' : row.ppct, { size: 11 }, { horizontal: 'center' });
    put(r, col.title, row.title, { size: 11 });
    if (col.equipment) put(r, col.equipment, row.equipment, { size: 11 });
    ws.getRow(r).height = estimateHeight(row, widths);
    r += 1;
  }
  styleRange(ws, headRow, r - 1, 1, last, (cell) => {
    cell.border = BORDER;
    if (!cell.font) cell.font = { name: FONT, size: 11 };
    if (!cell.alignment) cell.alignment = { vertical: 'middle', wrapText: true };
  });

  const lastRow = signature ? addSignatureBlock(wb, ws, info, r, columns) : r - 1;
  ws.pageSetup.printArea = `A1:${String.fromCharCode(64 + last)}${lastRow}`;
  ws.pageSetup.printTitlesRow = `${headRow}:${headRow}`;
  return firstBody;
}

// Khối chữ ký: GIÁO VIÊN gộp cột A–E, TỔ TRƯỞNG CHUYÊN MÔN gộp từ cột F đến cột cuối.
const SIGN_SPLIT = 5;
const SIGN_ROW_PT = 54; // vùng ký ≈ 1,9 cm
const SIGN_IMG_PX = { width: 227, height: 68 }; // tối đa 6 × 1,8 cm
const EMU_PER_PX = 9525;
const colPx = (w) => Math.floor(w * 7 + 5); // độ rộng cột (kí tự) → pixel, font mặc định Calibri 11

/** Neo ảnh `box` (px) vào giữa vùng cột c1..c2 (1-based) của dòng `row`. */
function centeredAnchor(columns, c1, c2, row, box) {
  const widths = columns.slice(c1 - 1, c2).map((c) => colPx(c.width));
  let left = Math.max(0, (widths.reduce((s, w) => s + w, 0) - box.width) / 2);
  let col = c1 - 1;
  for (const w of widths) {
    if (left < w) break;
    left -= w;
    col += 1;
  }
  const top = Math.max(0, ((SIGN_ROW_PT * 4) / 3 - box.height) / 2);
  return {
    nativeCol: col,
    nativeColOff: Math.round(left * EMU_PER_PX),
    nativeRow: row - 1,
    nativeRowOff: Math.round(top * EMU_PER_PX),
  };
}

function addSignatureBlock(wb, ws, info, startRow, columns) {
  const last = columns.length;
  const sigs = info.signatures || {};
  const parts = [
    { title: 'GIÁO VIÊN', name: info.teacher, sig: sigs.teacher, c1: 1, c2: SIGN_SPLIT },
    { title: 'TỔ TRƯỞNG CHUYÊN MÔN', name: info.leader, sig: sigs.leader, c1: SIGN_SPLIT + 1, c2: last },
  ];
  const r = startRow + 1; // chừa một dòng trống sau bảng
  ws.getRow(startRow).height = 8;
  const hasName = parts.some((p) => p.name?.trim());
  const rows = [
    { at: r, height: 18, text: (p) => p.title, font: { bold: true } },
    { at: r + 1, height: 17, text: () => '(Ký, ghi rõ họ tên)', font: { italic: true } },
    { at: r + 2, height: SIGN_ROW_PT, text: () => '' },
    ...(hasName ? [{ at: r + 3, height: 18, text: (p) => p.name?.trim() || '', font: { bold: true } }] : []),
  ];
  for (const row of rows) {
    ws.getRow(row.at).height = row.height;
    for (const p of parts) {
      ws.mergeCells(row.at, p.c1, row.at, p.c2);
      const cell = ws.getCell(row.at, p.c1);
      cell.value = row.text(p);
      cell.font = { name: FONT, size: 12, ...row.font };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }
  for (const p of parts) {
    const img = signatureImage(p.sig);
    if (!img) continue;
    const blockPx = columns.slice(p.c1 - 1, p.c2).reduce((s, c) => s + colPx(c.width), 0);
    const box = fitBox(img, Math.min(SIGN_IMG_PX.width, blockPx - 10), SIGN_IMG_PX.height);
    const imageId = wb.addImage({ base64: img.dataUrl, extension: img.type === 'png' ? 'png' : 'jpeg' });
    ws.addImage(imageId, { tl: centeredAnchor(columns, p.c1, p.c2, r + 2, box), ext: box, editAs: 'oneCell' });
  }
  return rows[rows.length - 1].at;
}

/**
 * Tạo workbook từ dữ liệu các tuần (buildExportWeeks).
 * orientation: 'portrait' (A4 dọc, mặc định) | 'landscape' (A4 ngang).
 * equipment: false = bỏ cột "Đồ dùng dạy học".
 * signature: false = bỏ khối ký tên GIÁO VIÊN / TỔ TRƯỞNG CHUYÊN MÔN cuối trang.
 */
export function buildWorkbook(weeks, info, { orientation = 'portrait', equipment = true, signature = true } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = info.teacher || 'Giáo viên';
  wb.created = new Date();
  for (const { week, rows } of weeks) addWeekSheet(wb, info, week, rows, orientation, equipment, signature);
  return wb;
}

export async function workbookToBlob(wb) {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
