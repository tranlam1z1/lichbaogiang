// Xuất Kế hoạch giảng dạy ra Excel (.xlsx): mỗi tuần một sheet "Tuần N", in vừa khổ A4.
import ExcelJS from 'exceljs';
import { formatDM, formatDMY } from './calendar.js';
import { weekLine } from './range.js';

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

function styleRange(ws, r1, r2, c1, c2, fn) {
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) fn(ws.getCell(r, c));
}

function estimateHeight(r) {
  const lines = Math.max(
    Math.ceil((r.title || '').length / 52) || 1,
    Math.ceil((r.equipment || '').length / 19) || 1,
  );
  return Math.max(16, lines * 14 + 2);
}

function addWeekSheet(wb, info, week, rows) {
  const ws = wb.addWorksheet(`Tuần ${week.num}`, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = XLSX_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  const last = XLSX_COLUMNS.length;

  const put = (row, col, value, font = {}, alignment = {}) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = { name: FONT, size: 12, ...font };
    cell.alignment = { vertical: 'middle', wrapText: true, ...alignment };
    return cell;
  };

  // Đầu trang
  ws.mergeCells(1, 1, 1, last);
  put(1, 1, 'KẾ HOẠCH GIẢNG DẠY', { bold: true, size: 16 }, { horizontal: 'center' });
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, last);
  put(2, 1, weekLine(info, week), { bold: true, size: 13 }, { horizontal: 'center' });
  ws.mergeCells(3, 1, 3, last);
  put(3, 1, `Từ ngày ${formatDMY(week.start)} đến ngày ${formatDMY(week.end)}`, { italic: true }, { horizontal: 'center' });

  // Tiêu đề bảng
  const headRow = 5;
  XLSX_COLUMNS.forEach((c, i) => put(headRow, i + 1, c.header, { bold: true, size: 11 }, { horizontal: 'center' }));
  ws.getRow(headRow).height = 30;

  // Nội dung
  let r = headRow + 1;
  const firstBody = r;
  for (const row of rows) {
    if (row.dayRowSpan > 0) {
      put(r, 1, `${row.dayLabel}${row.date ? `\n${formatDM(row.date)}` : ''}`, { bold: true, size: 11 }, { horizontal: 'center' });
      if (row.dayRowSpan > 1) ws.mergeCells(r, 1, r + row.dayRowSpan - 1, 1);
    }
    if (row.sessionRowSpan > 0) {
      put(r, 2, row.sessionLabel, { size: 11 }, { horizontal: 'center' });
      if (row.sessionRowSpan > 1) ws.mergeCells(r, 2, r + row.sessionRowSpan - 1, 2);
    }
    put(r, 3, row.period, { size: 11 }, { horizontal: 'center' });
    put(r, 4, row.subject, { bold: true, size: 11 });
    put(r, 5, row.ppct === '' || row.ppct == null ? '' : row.ppct, { size: 11 }, { horizontal: 'center' });
    put(r, 6, row.title, { size: 11 });
    put(r, 7, row.equipment, { size: 11 });
    ws.getRow(r).height = estimateHeight(row);
    r += 1;
  }
  styleRange(ws, headRow, r - 1, 1, last, (cell) => {
    cell.border = BORDER;
    if (!cell.font) cell.font = { name: FONT, size: 11 };
    if (!cell.alignment) cell.alignment = { vertical: 'middle', wrapText: true };
  });

  ws.pageSetup.printArea = `A1:G${r - 1}`;
  ws.pageSetup.printTitlesRow = `${headRow}:${headRow}`;
  return firstBody;
}

/** Tạo workbook từ dữ liệu các tuần (buildExportWeeks). */
export function buildWorkbook(weeks, info) {
  const wb = new ExcelJS.Workbook();
  wb.creator = info.teacher || 'Giáo viên';
  wb.created = new Date();
  for (const { week, rows } of weeks) addWeekSheet(wb, info, week, rows);
  return wb;
}

export async function workbookToBlob(wb) {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
