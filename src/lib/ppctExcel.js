// Đổi PPCT [môn, tuần, tiết thứ, số tiết PPCT, tên bài] qua lại file Excel để admin sửa rồi tải lên.
import ExcelJS from 'exceljs';

export const PPCT_HEADER = ['Môn', 'Tuần', 'Tiết thứ trong tuần', 'Số tiết PPCT', 'Tên bài'];

export function ppctToWorkbook(rows, grade) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`PPCT lớp ${grade}`);
  ws.columns = [{ width: 14 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 70 }];
  ws.addRow(PPCT_HEADER).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  return wb;
}

/** Giá trị hiển thị của ô (ô công thức lấy kết quả, chữ nhiều định dạng ghép lại). */
function cellValue(v) {
  if (v == null) return '';
  if (typeof v !== 'object') return v;
  if (v.richText) return v.richText.map((t) => t.text).join('');
  if ('result' in v) return v.result ?? '';
  return v.text ?? '';
}

const toInt = (v) => (v === '' ? NaN : Number(v));

/** Đọc sheet đầu tiên: bỏ dòng tiêu đề (cột Tuần không phải số) và dòng trống. Server kiểm tra lại từng dòng. */
export async function rowsFromXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow((row) => {
    const [subject, week, tiet, num, name] = [1, 2, 3, 4, 5].map((c) => cellValue(row.getCell(c).value));
    if (String(subject).trim() === '' && week === '') return;
    if (!rows.length && Number.isNaN(toInt(week))) return; // dòng tiêu đề
    rows.push([String(subject).trim(), toInt(week), toInt(tiet), toInt(num), String(name).trim()]);
  });
  return rows;
}
