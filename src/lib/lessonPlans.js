// Kho giáo án: gắn nhãn file và khớp với các tiết của một tuần — thuần JS, không dùng API trình duyệt.
import { foldVietnamese, SKIP_LOOKUP_SUBJECTS } from './text.js';

export const MAX_PLAN_FILE_BYTES = 20 * 1024 * 1024;

/** Khóa duy nhất của nhãn: khối|môn|loại|số. */
export function labelKey({ grade, subject, kind, num }) {
  return `${grade}|${subject}|${kind}|${num}`;
}

// Tên viết tắt hay gặp trong tên file.
const SHORT_FORMS = { tv: 'TIẾNG VIỆT', ta: 'TIẾNG ANH' };

/**
 * Đoán nhãn từ tên file: "Toan_tuan4.docx" → {subject:'TOÁN', kind:'week', num:4}.
 * subjects: tên môn (đã chuẩn hóa) có trong PPCT của khối. Không đoán được → null.
 */
export function guessLabel(fileName, subjects = []) {
  const text = ` ${foldVietnamese(fileName).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  let subject = null;
  let best = 0;
  for (const s of subjects) {
    const f = foldVietnamese(s).replace(/[^a-z0-9]+/g, ' ').trim();
    if (f && f.length > best && text.includes(` ${f} `)) {
      subject = s;
      best = f.length;
    }
  }
  if (!subject) {
    for (const [short, full] of Object.entries(SHORT_FORMS)) {
      if (subjects.includes(full) && text.includes(` ${short} `)) {
        subject = full;
        break;
      }
    }
  }
  const tiet = text.match(/ tiet ?(\d+) /) || text.match(/ t(\d+) /);
  const tuan = text.match(/ tuan ?(\d+) /);
  if (tiet) return { subject, kind: 'lesson', num: Number(tiet[1]) };
  if (tuan) return { subject, kind: 'week', num: Number(tuan[1]) };
  return { subject, kind: null, num: null };
}

/** Kiểm tra đuôi file: null nếu là .docx, ngược lại trả câu báo lỗi. */
export function validateFileName(fileName) {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith('.docx')) return null;
  if (lower.endsWith('.doc')) {
    return `«${fileName}» là định dạng Word cũ. Mở file trong Word → Lưu thành → chọn Word Document (.docx), rồi tải lại.`;
  }
  return `«${fileName}» không phải file Word .docx.`;
}

const isSkip = (row) => !row.subject || row.notTaught || SKIP_LOOKUP_SUBJECTS.has(row.subject);
const ppctNum = (row) => (row.ppct === '' || row.ppct == null ? NaN : Number(row.ppct));

/**
 * Khớp giáo án với các dòng của một tuần (rows = flattenWeek(...)).
 * choices: {[môn]: 'week'|'lesson'} — lựa chọn khi môn vừa có file cả tuần vừa có file theo tiết.
 * Trả về { items: [{row, status, plan}], conflicts, files (thứ tự xuất), counted, covered }.
 * status: 'skip' | 'file' | 'inWeekFile' | 'missing' | 'needChoice'.
 */
export function resolveWeekPlans({ rows, weekNum, plans, choices = {} }) {
  const lessonOf = (row) =>
    plans.find((p) => p.kind === 'lesson' && p.subject === row.subject && p.num === ppctNum(row)) || null;

  // Chế độ của từng môn có tiết tính trong tuần: 'week' | 'lesson' | 'needChoice'.
  const mode = new Map();
  const weekPlan = new Map();
  for (const row of rows) {
    if (isSkip(row) || mode.has(row.subject)) continue;
    const wp = plans.find((p) => p.kind === 'week' && p.subject === row.subject && p.num === weekNum);
    if (!wp) {
      mode.set(row.subject, 'lesson');
      continue;
    }
    weekPlan.set(row.subject, wp);
    const hasLesson = rows.some((r) => !isSkip(r) && r.subject === row.subject && lessonOf(r));
    const choice = choices[row.subject];
    mode.set(row.subject, choice === 'lesson' ? 'lesson' : choice === 'week' || !hasLesson ? 'week' : 'needChoice');
  }

  const items = [];
  const files = [];
  const conflicts = [];
  const weekPlaced = new Set();
  let counted = 0;
  let covered = 0;
  for (const row of rows) {
    if (isSkip(row)) {
      items.push({ row, status: 'skip', plan: null });
      continue;
    }
    counted++;
    const m = mode.get(row.subject);
    let item;
    if (m === 'needChoice') {
      item = { row, status: 'needChoice', plan: null };
      if (!conflicts.includes(row.subject)) conflicts.push(row.subject);
    } else if (m === 'week') {
      const plan = weekPlan.get(row.subject);
      item = { row, status: weekPlaced.has(row.subject) ? 'inWeekFile' : 'file', plan };
      weekPlaced.add(row.subject);
    } else {
      const plan = lessonOf(row);
      item = { row, status: plan ? 'file' : 'missing', plan };
    }
    if (item.status === 'file' && !files.includes(item.plan)) files.push(item.plan);
    if (item.status === 'file' || item.status === 'inWeekFile') covered++;
    items.push(item);
  }
  return { items, conflicts, files, counted, covered };
}
