// Tải file về máy — gom phần phụ thuộc thư viện để giao diện chỉ tải khi cần (dynamic import).
import { saveAs } from 'file-saver';
import { buildDocx, docxToBlob } from './exportDocx.js';
import { buildWorkbook, workbookToBlob } from './exportXlsx.js';

export async function downloadDocx(weeks, info, filename) {
  const blob = await docxToBlob(buildDocx(weeks, info));
  saveAs(blob, filename);
}

export async function downloadXlsx(weeks, info, filename) {
  const blob = await workbookToBlob(buildWorkbook(weeks, info));
  saveAs(blob, filename);
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  saveAs(blob, filename);
}
