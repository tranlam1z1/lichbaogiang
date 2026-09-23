// Xuất Kế hoạch giảng dạy ra Word (.docx): A4 đứng, Times New Roman, mỗi tuần một trang.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from 'docx';
import { formatDM, formatDMY } from './calendar.js';
import { weekLine } from './range.js';

const CM = 567; // twip / cm
const PAGE = { width: 21 * CM, height: 29.7 * CM };
const MARGIN = { top: 1.0 * CM, bottom: 0.9 * CM, left: 1.6 * CM, right: 1.0 * CM };
const FONT = 'Times New Roman';

// Độ rộng cột (cm), tổng = 21 - 1.6 - 1.0 = 18.4
export const DOCX_COLUMNS = [
  { key: 'day', title: 'Thứ, ngày', cm: 1.7 },
  { key: 'session', title: 'Buổi', cm: 1.25 },
  { key: 'period', title: 'Tiết', cm: 1.0 },
  { key: 'subject', title: 'Môn', cm: 2.75 },
  { key: 'ppct', title: 'PPCT', cm: 1.3 },
  { key: 'title', title: 'Tên bài dạy', cm: 7.8 },
  { key: 'equipment', title: 'Đồ dùng dạy học', cm: 2.6 },
];

const CELL_PAD_TW = 20; // lề trong ô (twip) trên/dưới
const PT_PER_TW = 1 / 20;

/** Ước lượng số dòng chữ khi ô rộng `cm` với cỡ chữ `pt`. `em` = độ rộng trung bình một kí tự. */
function linesFor(text, cm, pt, em = 0.45) {
  if (!text) return 1;
  const usablePt = cm * 28.35 - 8; // trừ lề trái/phải của ô
  const charsPerLine = Math.max(3, Math.floor(usablePt / (pt * em)));
  return String(text)
    .split('\n')
    .reduce((n, part) => {
      // Ngắt theo từ để sát với cách Word xuống dòng.
      let lines = 1;
      let len = 0;
      for (const word of part.split(' ')) {
        const w = word.length;
        if (len && len + 1 + w > charsPerLine) {
          lines += 1;
          len = w;
        } else {
          len += (len ? 1 : 0) + w;
        }
      }
      return n + lines;
    }, 0);
}

/**
 * Chọn cỡ chữ lớn nhất (12 → 7pt) để cả tuần vừa đúng một trang A4.
 * Chiều cao ước lượng theo đo đạc thực tế trên Word/LibreOffice với Times New Roman.
 */
export function fitWeek(rows) {
  const available = (PAGE.height - MARGIN.top - MARGIN.bottom) * PT_PER_TW; // pt
  const colCm = Object.fromEntries(DOCX_COLUMNS.map((c) => [c.key, c.cm]));
  const headerH = 58; // tiêu đề, tuần/lớp/giáo viên, từ ngày… đến ngày…
  const pad = (CELL_PAD_TW * 2) * PT_PER_TW + 0.75;
  for (const pt of [12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7]) {
    const lineH = pt * 1.16;
    const headPt = Math.min(pt + 0.5, 10);
    let tableH = 2 * headPt * 1.16 + pad;
    for (const r of rows) {
      const lines = Math.max(
        linesFor(r.title, colCm.title, pt),
        linesFor(r.equipment, colCm.equipment, pt),
        linesFor(r.subject, colCm.subject, pt, 0.7),
        r.dayRowSpan > 0 && r.dayRowSpan < 2 ? 2 : 1,
      );
      tableH += lines * lineH + pad;
    }
    if (headerH + tableH <= available * 0.96) return { bodyPt: pt };
  }
  return { bodyPt: 7 };
}

const size = (pt) => Math.round(pt * 2);

function para(text, { bold, italics, color, lineColors, pt = 12, align = AlignmentType.LEFT, after = 0, before = 0 } = {}) {
  const parts = String(text ?? '').split('\n');
  return new Paragraph({
    alignment: align,
    spacing: { before, after, line: 240 },
    run: { size: size(pt), font: FONT },
    children: parts.map((t, i) => new TextRun({ text: t, bold, italics, color: lineColors?.[i] ?? color, size: size(pt), font: FONT, break: i ? 1 : 0 })),
  });
}

const border = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, col, opts = {}) {
  return new TableCell({
    width: { size: Math.round(col.cm * CM), type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    verticalMerge: opts.merge,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: CELL_PAD_TW, bottom: CELL_PAD_TW, left: 70, right: 70 },
    children: [para(text, { bold: opts.bold, pt: opts.pt, align: opts.align ?? AlignmentType.LEFT, italics: opts.italics, color: opts.color, lineColors: opts.lineColors })],
  });
}

function weekTable(rows, pt) {
  const C = Object.fromEntries(DOCX_COLUMNS.map((c) => [c.key, c]));
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: DOCX_COLUMNS.map((c) => cell(c.title, c, { bold: true, fill: '92D050', pt: Math.min(pt + 0.5, 10), align: AlignmentType.CENTER })),
  });
  const body = rows.map((r) => {
    const dayMerge = r.dayRowSpan > 0 ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE;
    const sesMerge = r.sessionRowSpan > 0 ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE;
    const dayText = r.dayRowSpan > 0 ? `${r.dayLabel}${r.date ? `\n${formatDM(r.date)}` : ''}` : '';
    return new TableRow({
      cantSplit: true,
      children: [
        cell(dayText, C.day, { merge: dayMerge, bold: true, pt, align: AlignmentType.CENTER, lineColors: [undefined, 'FF0000'] }),
        cell(r.sessionRowSpan > 0 ? r.sessionLabel : '', C.session, { merge: sesMerge, bold: true, color: '8B4513', pt, align: AlignmentType.CENTER }),
        cell(String(r.period), C.period, { pt, align: AlignmentType.CENTER }),
        cell(r.subject, C.subject, { pt, bold: !!r.subject }),
        cell(r.ppct === '' || r.ppct == null ? '' : String(r.ppct), C.ppct, { pt, align: AlignmentType.CENTER }),
        cell(r.title, C.title, { pt }),
        cell(r.equipment, C.equipment, { pt }),
      ],
    });
  });
  return new Table({
    width: { size: Math.round(DOCX_COLUMNS.reduce((s, c) => s + c.cm, 0) * CM), type: WidthType.DXA },
    columnWidths: DOCX_COLUMNS.map((c) => Math.round(c.cm * CM)),
    layout: TableLayoutType.FIXED,
    rows: [header, ...body],
  });
}

function headerBlock(info, week) {
  return [
    para('KẾ HOẠCH GIẢNG DẠY', { bold: true, color: 'FF0000', pt: 17, align: AlignmentType.CENTER }),
    para(weekLine(info, week), { bold: true, color: '00B050', pt: 13, align: AlignmentType.CENTER }),
    para(`Từ ngày ${formatDMY(week.start)} đến ngày ${formatDMY(week.end)}`, { italics: true, pt: 12, align: AlignmentType.CENTER, after: 120 }),
  ];
}

/** Tạo đối tượng Document từ dữ liệu các tuần (buildExportWeeks). */
export function buildDocx(weeks, info, { forcePt } = {}) {
  const sections = weeks.map(({ week, rows }) => {
    const bodyPt = forcePt || fitWeek(rows).bodyPt;
    return {
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { ...MARGIN, header: 300, footer: 300 },
        },
      },
      children: [...headerBlock(info, week), weekTable(rows, bodyPt)],
    };
  });
  return new Document({
    creator: info.teacher || 'Giáo viên',
    title: `Kế hoạch giảng dạy lớp ${info.className || ''}`,
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { before: 0, after: 0, line: 240 } } },
      },
    },
    sections,
  });
}

export async function docxToBlob(doc) {
  return Packer.toBlob(doc);
}

export async function docxToBuffer(doc) {
  return Packer.toBuffer(doc);
}
