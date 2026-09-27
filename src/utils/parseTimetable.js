// Đọc thời khóa biểu dán từ Excel (hoặc đọc từ file .xlsx). Hàm thuần — không phụ thuộc React.
//
// Hai kiểu bảng được nhận dạng:
//  - Lưới: hàng đầu là các thứ, cột đầu là buổi/tiết ("Sáng 1", "S1", "Tiết 6"…).
//  - Danh sách: mỗi dòng một tiết, các cột Thứ | Buổi | Tiết | Môn.
// Mỗi ô được đọc ra một tên môn chuẩn (TOÁN, TIẾNG VIỆT…).

import { foldVietnamese, normalizeSubject } from '../lib/text.js';
import { MAX_PERIODS } from '../lib/schedule.js';

/** Ghép lại cho so khớp: bỏ dấu, chữ thường, mọi ký tự khác chữ/số/& thành khoảng trắng. */
export function simplify(value) {
  return foldVietnamese(value)
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s*&\s*/g, '&')
    .trim();
}

// ---------- Đọc dữ liệu dán (TSV của Excel) ----------

/**
 * Tách văn bản dán từ Excel thành mảng 2 chiều.
 * Excel bọc ô có xuống dòng / dấu Tab / dấu nháy trong "…" (nháy kép bên trong viết thành "").
 */
export function parseTsv(text) {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let atCellStart = true;
  while (i < src.length) {
    const ch = src[i];
    if (atCellStart && ch === '"') {
      // Ô có bọc nháy: đọc tới dấu nháy đóng.
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { value += '"'; j += 2; continue; }
          closed = true;
          j += 1;
          break;
        }
        value += src[j];
        j += 1;
      }
      if (closed && (j >= src.length || src[j] === '\t' || src[j] === '\n')) {
        cell = value;
        i = j;
        atCellStart = false;
        continue;
      }
      // Không phải ô bọc nháy thật (vd: "abc"def) → đọc như chữ thường.
    }
    atCellStart = false;
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
    } else {
      cell += ch;
    }
    i += 1;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => String(c ?? '').replace(/ /g, ' ').trim()));
}

// ---------- Thứ, buổi, tiết ----------

const DAY_WORDS = { hai: 2, ba: 3, tu: 4, nam: 5, sau: 6, bay: 7 };

/** "Thứ 2", "Thứ Hai", "T2", "thu2", "Hai", "2" → 2 … 7; "Chủ nhật"/"CN" → 8; không phải thứ → null. */
export function parseDay(value, { allowBareNumber = false } = {}) {
  const s = simplify(value);
  if (!s) return null;
  if (/^(chu nhat|cn)\b/.test(s)) return 8;
  let m = s.match(/^(?:thu|t)\s*([2-7])(?:\s|$)/);
  if (m) return Number(m[1]);
  m = s.match(/^(?:thu\s+)?(hai|ba|tu|nam|sau|bay)(?:\s|$)/);
  if (m) return DAY_WORDS[m[1]];
  if (allowBareNumber && /^[2-7]$/.test(s)) return Number(s);
  return null;
}

/** "Sáng", "S", "Chiều", "C" (có thể kèm số tiết phía sau) → 'morning' | 'afternoon' | null. */
export function parseSession(value) {
  const s = simplify(value);
  if (/^sang\b|^s(\s*\d|$)|\bsang\b/.test(s)) return 'morning';
  if (/^chieu\b|^c(\s*\d|$)|\bchieu\b/.test(s)) return 'afternoon';
  return null;
}

/** Số tiết trong nhãn: "Tiết 3", "S3", "Sáng 3", "3" → 3; không có → null. */
export function parsePeriod(value) {
  const m = simplify(value).match(/(\d{1,2})(?!.*\d)/);
  return m ? Number(m[1]) : null;
}

/**
 * Đổi (buổi, tiết) về vị trí trong thời khóa biểu của ứng dụng.
 * Không ghi buổi: tiết 1–5 là sáng, tiết 6–10 là chiều (tiết 6 = chiều tiết 1).
 * Ghi buổi chiều nhưng đánh số tiếp (6, 7…) cũng được đổi về 1, 2…
 */
export function toSlot(session, period) {
  if (!Number.isInteger(period) || period < 1) return null;
  if (!session) {
    return period <= MAX_PERIODS
      ? { session: 'morning', period }
      : toSlot('afternoon', period);
  }
  if (session === 'afternoon' && period > MAX_PERIODS) period -= MAX_PERIODS;
  if (period > MAX_PERIODS) return null;
  return { session, period };
}

// ---------- Tên môn ----------

// Cách viết tắt / cách gọi khác của các môn (viết theo simplify: không dấu, chữ thường).
const SUBJECT_ALIASES = {
  'CHÀO CỜ': ['chao co', 'cc', 'sinh hoat duoi co'],
  'TOÁN': ['toan', 't toan'],
  'TIẾNG VIỆT': ['tieng viet', 't viet', 'tv'],
  'TIẾNG ANH': ['tieng anh', 't anh', 'ta', 'anh', 'anh van', 'ngoai ngu', 'nn', 'english'],
  'ĐẠO ĐỨC': ['dao duc', 'dd'],
  'TN&XH': ['tn&xh', 'tnxh', 'tn xh', 'tu nhien xa hoi', 'tu nhien va xa hoi'],
  'GDTC': ['gdtc', 'the duc', 'td', 'giao duc the chat'],
  'MĨ THUẬT': ['mi thuat', 'my thuat', 'mt'],
  'ÂM NHẠC': ['am nhac', 'an', 'hat nhac'],
  'HĐTN': ['hdtn', 'trai nghiem', 'hoat dong trai nghiem', 'hd trai nghiem'],
  'KHOA HỌC': ['khoa hoc', 'kh'],
  'LS&ĐL': ['ls&dl', 'lsdl', 'ls dl', 'lich su dia li', 'lich su dia ly', 'lich su va dia li', 'lich su va dia ly', 'lich su&dia li', 'lich su&dia ly'],
  'CÔNG NGHỆ': ['cong nghe', 'cn'],
  'TIN HỌC': ['tin hoc', 'tin', 'th'],
  'LUYỆN TOÁN': ['luyen toan', 'l toan', 'lt'],
  'LUYỆN TV': ['luyen tv', 'luyen tieng viet', 'l tv', 'ltv'],
  'LUYỆN TA': ['luyen ta', 'luyen tieng anh', 'l ta'],
  'SINH HOẠT': ['sinh hoat', 'sinh hoat lop', 'shl'],
};

/** Viết tắt ngắn (≤ 3 chữ, 1 từ) dễ trùng tên người ("cô An") nên chỉ nhận khi đứng một mình hoặc viết HOA. */
const isShort = (alias) => alias.length <= 3 && !alias.includes(' ');

/**
 * Dựng bảng tra tên môn.
 * @param {string[]} subjects tên môn đã biết (PPCT + danh mục), dạng chuẩn
 */
export function buildSubjectMatcher(subjects = []) {
  const known = new Set(subjects.map(normalizeSubject).filter(Boolean));
  Object.keys(SUBJECT_ALIASES).forEach((s) => known.add(s));
  const aliases = new Map(); // alias → môn chuẩn
  const add = (alias, subject) => {
    const a = simplify(alias);
    if (a && !aliases.has(a)) aliases.set(a, subject);
  };
  // Tên đầy đủ của môn trước, rồi mới tới viết tắt.
  known.forEach((s) => add(s, s));
  Object.entries(SUBJECT_ALIASES).forEach(([s, list]) => list.forEach((a) => add(a, s)));
  const sorted = [...aliases.keys()].sort((a, b) => b.length - a.length);
  return { known, aliases, sorted };
}

/** Bỏ phòng học, ghi chú trong ngoặc, tên giáo viên sau "cô/thầy/gv". */
function stripNoise(text) {
  return String(text ?? '')
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
    .replace(/\b(?:p|phòng|phong|room)\s*[.:]?\s*\d+\w*/gi, ' ')
    .replace(/(?:^|[\s\-–:,])(?:cô|thầy|gv|giáo viên)\s*[.:]?\s+\S.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Đọc tên môn trong một ô.
 * @returns {{status: 'empty'|'ok'|'new'|'multi'|'invalid', subject: string, candidates: string[]}}
 *   ok: một môn đã biết · new: một tên môn chưa biết · multi: có từ 2 môn · invalid: không đọc được.
 */
export function readSubjectCell(raw, matcher) {
  const text = String(raw ?? '').replace(/ /g, ' ').trim();
  const cleaned = stripNoise(text);
  const s = simplify(cleaned);
  if (!s && !/[\p{L}\d]/u.test(text)) return { status: 'empty', subject: '', candidates: [] };
  if (!/[a-z]/.test(s) || s.replace(/ /g, '').length < 2) return { status: 'invalid', subject: '', candidates: [] };

  // Cả ô là đúng một tên môn / viết tắt.
  const whole = matcher.aliases.get(s) || matcher.aliases.get(s.replace(/ /g, ''));
  if (whole) return { status: 'ok', subject: whole, candidates: [whole] };

  // Tìm các tên môn nằm trong ô (ưu tiên tên dài, không chồng lấn).
  const upperWords = new Set(
    cleaned.split(/[^\p{L}\d&]+/u).filter((w) => w.length > 1 && w === w.toLocaleUpperCase('vi') && /\p{L}/u.test(w)).map(simplify),
  );
  let rest = ` ${s} `;
  const found = [];
  for (const alias of matcher.sorted) {
    const needle = ` ${alias} `;
    if (!rest.includes(needle)) continue;
    if (isShort(alias) && !upperWords.has(alias)) continue;
    const subject = matcher.aliases.get(alias);
    if (!found.includes(subject)) found.push(subject);
    rest = rest.split(needle).join('  ');
  }
  if (found.length === 1) return { status: 'ok', subject: found[0], candidates: found };
  if (found.length > 1) return { status: 'multi', subject: '', candidates: found };

  // Không khớp môn nào: coi là môn mới (giáo viên có thể giữ lại hoặc bỏ).
  const name = normalizeSubject(cleaned.replace(/[\s\-–:,;.]+$/, ''));
  if (name.length > 30) return { status: 'invalid', subject: '', candidates: [] };
  return { status: 'new', subject: name, candidates: [] };
}

// ---------- Nhận dạng bảng ----------

const HEADER_SCAN_ROWS = 15;

function findGridHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r += 1) {
    const cols = [];
    rows[r].forEach((v, c) => {
      const d = parseDay(v);
      if (d) cols.push({ c, day: d });
    });
    if (new Set(cols.map((x) => x.day)).size >= 2) return { row: r, cols };
  }
  return null;
}

const LIST_COLUMNS = [
  ['day', /^(thu|ngay)\b/],
  ['session', /^buoi\b/],
  ['period', /^tiet\b/],
  ['subject', /^(mon|mon hoc|lop|noi dung|ten mon)\b/],
];

function findListHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r += 1) {
    const map = {};
    rows[r].forEach((v, c) => {
      const s = simplify(v);
      const hit = LIST_COLUMNS.find(([key, re]) => map[key] == null && re.test(s));
      if (hit) map[hit[0]] = c;
    });
    if (map.day != null && map.period != null && map.subject != null) return { row: r, map };
  }
  // Không có dòng tiêu đề: thử thứ tự cột Thứ | Buổi | Tiết | Môn.
  const data = rows.filter((row) => row.some(Boolean));
  const looksLikeList = data.filter((row) => parseDay(row[0], { allowBareNumber: true }) && parsePeriod(row[2]) != null);
  if (data.length && looksLikeList.length >= Math.ceil(data.length / 2)) {
    return { row: -1, map: { day: 0, session: 1, period: 2, subject: 3 } };
  }
  return null;
}

/**
 * Đọc thời khóa biểu.
 * @param {string | string[][]} input  văn bản dán từ Excel, hoặc mảng 2 chiều (đọc từ file)
 * @param {object} [opts]
 * @param {string[]} [opts.subjects]        tên môn đã biết
 * @param {boolean} [opts.includeSaturday]  lấy cả thứ 7 (mặc định bỏ qua và báo)
 * @returns {{
 *   kind: 'grid'|'list'|null,
 *   entries: Array<{key, day, session, period, raw, status, subject, candidates}>,
 *   periods: {morning: number, afternoon: number},
 *   ignored: {saturday: number, sunday: number, outOfRange: number, duplicate: number},
 *   error: string|null,
 * }}
 */
export function parseTimetable(input, { subjects = [], includeSaturday = false } = {}) {
  const rows = (typeof input === 'string' ? parseTsv(input) : (input || []).map((r) => (r || []).map((c) => String(c ?? '').trim())))
    .filter((r) => r.some(Boolean));
  const result = {
    kind: null,
    entries: [],
    periods: { morning: 0, afternoon: 0 },
    ignored: { saturday: 0, sunday: 0, outOfRange: 0, duplicate: 0 },
    error: null,
  };
  if (!rows.length) {
    result.error = 'Chưa có dữ liệu.';
    return result;
  }
  const matcher = buildSubjectMatcher(subjects);
  const byKey = new Map();

  const put = (day, session, period, raw) => {
    const cell = readSubjectCell(raw, matcher);
    if (cell.status === 'empty') return;
    if (day === 8) { result.ignored.sunday += 1; return; }
    if (day === 7 && !includeSaturday) { result.ignored.saturday += 1; return; }
    const slot = toSlot(session, period);
    if (!slot) { result.ignored.outOfRange += 1; return; }
    const key = `${day}-${slot.session}-${slot.period}`;
    const prev = byKey.get(key);
    if (prev) {
      // Hai dòng cùng một tiết: gộp lại để giáo viên chọn.
      result.ignored.duplicate += 1;
      const subjectsInSlot = [...new Set([...prev.candidates, prev.subject, ...cell.candidates, cell.subject].filter(Boolean))];
      if (subjectsInSlot.length <= 1) return;
      Object.assign(prev, { raw: `${prev.raw} / ${raw}`, status: 'multi', subject: '', candidates: subjectsInSlot });
      return;
    }
    const entry = { key, day, session: slot.session, period: slot.period, raw: String(raw).trim(), ...cell };
    byKey.set(key, entry);
    result.entries.push(entry);
  };
  const seePeriod = (session, period) => {
    const slot = toSlot(session, period);
    if (slot) result.periods[slot.session] = Math.max(result.periods[slot.session], slot.period);
  };

  const grid = findGridHeader(rows);
  if (grid) {
    result.kind = 'grid';
    const firstDayCol = Math.min(...grid.cols.map((x) => x.c));
    let session = null; // buổi đang đọc (từ ô gộp "Sáng" / dòng "Chiều")
    let implicit = null; // buổi suy ra khi không ghi buổi
    let lastPeriod = 0;
    for (let r = grid.row + 1; r < rows.length; r += 1) {
      const row = rows[r];
      const label = row.slice(0, firstDayCol).filter(Boolean).join(' ');
      const s = parseSession(label);
      const p = parsePeriod(label);
      if (s) session = s;
      if (p == null) continue; // dòng chỉ ghi buổi, hoặc dòng ghi chú
      let sess = session;
      if (!sess) {
        // Không ghi buổi: tiết 1–5 sáng, 6–10 chiều (toSlot); đánh số lại từ 1 nghĩa là sang chiều.
        if (!implicit) implicit = 'morning';
        else if (implicit === 'morning' && p <= lastPeriod) implicit = 'afternoon';
        sess = implicit === 'afternoon' ? 'afternoon' : null;
      }
      lastPeriod = p;
      seePeriod(sess, p);
      grid.cols.forEach(({ c, day }) => put(day, sess, p, row[c] ?? ''));
    }
  } else {
    const list = findListHeader(rows);
    if (!list) {
      result.error = 'Không nhận ra bảng. Cần có hàng tiêu đề các thứ (Thứ 2 … Thứ 6), hoặc các cột Thứ | Buổi | Tiết | Môn.';
      return result;
    }
    result.kind = 'list';
    const { map } = list;
    let day = null;
    let session = null;
    for (let r = list.row + 1; r < rows.length; r += 1) {
      const row = rows[r];
      // Ô Thứ / Buổi gộp trong Excel chỉ có giá trị ở dòng đầu → dùng lại giá trị trước.
      if (row[map.day]) day = parseDay(row[map.day], { allowBareNumber: true });
      if (map.session != null && row[map.session]) session = parseSession(row[map.session]);
      const p = parsePeriod(row[map.period]);
      if (!day || p == null) continue;
      seePeriod(session, p);
      put(day, session, p, row[map.subject] ?? '');
    }
  }

  if (!result.entries.length && !result.error) result.error = 'Không đọc được tiết nào trong bảng.';
  return result;
}

// ---------- Áp dụng vào thời khóa biểu ----------

/**
 * Tạo thời khóa biểu mới từ các tiết đã đọc.
 * @param {object} timetable   thời khóa biểu hiện tại
 * @param {Array<{day, session, period, subject}>} cells  các tiết sẽ nhập (subject rỗng = bỏ qua)
 * @param {'replace'|'merge'} mode  replace: thay toàn bộ · merge: chỉ điền vào ô còn trống
 * @param {{morning: number, afternoon: number}} [periods] số tiết mỗi buổi trong bảng dán
 */
export function applyTimetable(timetable, cells, mode, periods = { morning: 0, afternoon: 0 }) {
  const days = {};
  const allDays = new Set([2, 3, 4, 5, 6, 7, ...Object.keys(timetable.days || {}).map(Number)]);
  allDays.forEach((d) => {
    const old = timetable.days?.[d] || {};
    days[d] = {
      morning: Array.from({ length: MAX_PERIODS }, (_, i) => (mode === 'merge' ? old.morning?.[i] || '' : '')),
      afternoon: Array.from({ length: MAX_PERIODS }, (_, i) => (mode === 'merge' ? old.afternoon?.[i] || '' : '')),
    };
  });
  const used = { morning: 0, afternoon: 0 };
  cells.forEach(({ day, session, period, subject }) => {
    if (!subject) return;
    const list = days[day][session];
    if (mode === 'merge' && String(list[period - 1] || '').trim()) return;
    list[period - 1] = normalizeSubject(subject);
    used[session] = Math.max(used[session], period);
  });
  const count = (key, session) => {
    const wanted = Math.max(used[session], periods[session] || 0);
    if (mode === 'merge') return Math.max(timetable[key] || 0, used[session]);
    return Math.min(MAX_PERIODS, wanted || (session === 'morning' ? 1 : 0));
  };
  return {
    ...timetable,
    morningCount: Math.max(1, count('morningCount', 'morning')),
    afternoonCount: count('afternoonCount', 'afternoon'),
    days,
  };
}
