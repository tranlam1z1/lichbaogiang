// PPCT do admin tải lên. Khối không có trong bảng Ppct thì frontend dùng bản gốc đóng gói (src/data/ppct.json).
import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const PPCT_GRADES = [1, 2, 3, 4, 5];
export const MAX_PPCT_ROWS = 5000;
const SUBJECT_MAX = 60;
const NAME_MAX = 500;
const WEEK_MAX = 60;
const TIET_MAX = 50;
const NUM_MAX = 2000;

const isInt = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;

/** Kiểm tra mảng dòng [môn, tuần, tiết thứ, số tiết PPCT, tên bài]; trả về { error, rows } (rows đã làm sạch). */
export function validatePpctRows(input) {
  if (!Array.isArray(input) || !input.length) return { error: 'PPCT không có dòng nào.' };
  if (input.length > MAX_PPCT_ROWS) return { error: `PPCT tối đa ${MAX_PPCT_ROWS} dòng.` };
  const rows = [];
  for (let i = 0; i < input.length; i += 1) {
    const r = input[i];
    const at = `Dòng ${i + 1}`;
    if (!Array.isArray(r) || r.length < 4) return { error: `${at}: thiếu cột.` };
    const subject = typeof r[0] === 'string' ? r[0].trim().replace(/\s+/g, ' ') : '';
    const name = r[4] == null ? '' : typeof r[4] === 'string' ? r[4].trim() : null;
    if (!subject || subject.length > SUBJECT_MAX) return { error: `${at}: tên môn trống hoặc dài quá ${SUBJECT_MAX} ký tự.` };
    if (!isInt(r[1], WEEK_MAX)) return { error: `${at}: tuần phải là số nguyên từ 1 đến ${WEEK_MAX}.` };
    if (!isInt(r[2], TIET_MAX)) return { error: `${at}: tiết thứ phải là số nguyên từ 1 đến ${TIET_MAX}.` };
    if (!isInt(r[3], NUM_MAX)) return { error: `${at}: số tiết PPCT phải là số nguyên từ 1 đến ${NUM_MAX}.` };
    if (name === null || name.length > NAME_MAX) return { error: `${at}: tên bài dài quá ${NAME_MAX} ký tự.` };
    rows.push([subject, r[1], r[2], r[3], name]);
  }
  return { rows };
}

function gradeParam(req) {
  const grade = Number(req.params.grade);
  if (!PPCT_GRADES.includes(grade)) throw new HttpError(404, 'Khối lớp không hợp lệ.');
  return grade;
}

/** Người dùng: PPCT admin đã thay, dạng { grades: { "3": rows } }. */
export const ppctRouter = Router();
ppctRouter.use(requireAuth);
ppctRouter.get('/', async (req, res) => {
  const items = await prisma.ppct.findMany({ select: { grade: true, data: true } });
  res.json({ grades: Object.fromEntries(items.map((p) => [p.grade, JSON.parse(p.data)])) });
});

/** Admin (gắn dưới /api/admin/ppct, đã qua requireAdmin). */
export const adminPpctRouter = Router();

adminPpctRouter.get('/', async (req, res) => {
  const items = await prisma.ppct.findMany({ select: { grade: true, rowCount: true, updatedAt: true, updatedById: true } });
  const users = await prisma.user.findMany({ where: { id: { in: items.map((p) => p.updatedById).filter(Boolean) } }, select: { id: true, username: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  res.json({ items: items.map(({ updatedById, ...p }) => ({ ...p, updatedBy: byId.get(updatedById) ?? null })) });
});

adminPpctRouter.get('/:grade', async (req, res) => {
  const p = await prisma.ppct.findUnique({ where: { grade: gradeParam(req) } });
  if (!p) throw new HttpError(404, 'Khối này đang dùng PPCT gốc.');
  res.json({ grade: p.grade, rows: JSON.parse(p.data), updatedAt: p.updatedAt });
});

/** Thay toàn bộ PPCT một khối. body: { rows }. */
adminPpctRouter.put('/:grade', async (req, res) => {
  const grade = gradeParam(req);
  const { error, rows } = validatePpctRows(req.body?.rows);
  if (error) throw validationError({ rows: error }, error);
  const data = { data: JSON.stringify(rows), rowCount: rows.length, updatedById: req.user.id };
  const p = await prisma.ppct.upsert({ where: { grade }, create: { grade, ...data }, update: data });
  res.json({ grade, rowCount: p.rowCount, updatedAt: p.updatedAt });
});

/** Trả khối về PPCT gốc. */
adminPpctRouter.delete('/:grade', async (req, res) => {
  await prisma.ppct.deleteMany({ where: { grade: gradeParam(req) } });
  res.json({ ok: true });
});
