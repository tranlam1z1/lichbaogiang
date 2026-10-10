import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { planWriteLimiter } from '../middleware/rateLimit.js';
import { PLAN_NAME_MAX, planLabel } from '../../../shared/plan.js';

/** Kích thước tối đa của một hồ sơ (JSON). Body parser của route này đặt rộng hơn một chút, xem app.js. */
export const MAX_PLAN_BYTES = 512 * 1024;
/** Số hồ sơ tối đa của một tài khoản. */
export const MAX_PLANS_PER_USER = 100;

// Trường chỉ dùng cho giao diện (mục đang mở, tuần đang chọn) — không lưu lên server.
const UI_ONLY_KEYS = ['tab', 'selectedWeekId'];
// Phần của hồ sơ trả về khi liệt kê (không kèm data).
const SUMMARY = { id: true, name: true, label: true, version: true, updatedAt: true };

function conflict(plan) {
  return new HttpError(409, 'Kế hoạch đã được sửa ở máy hoặc trình duyệt khác.', {
    code: 'PLAN_CONFLICT',
    details: { version: plan.version, updatedAt: plan.updatedAt },
  });
}

function notFound() {
  return new HttpError(404, 'Hồ sơ này không còn trên tài khoản (đã bị xóa ở máy hoặc trình duyệt khác).', { code: 'PLAN_NOT_FOUND' });
}

function planId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw notFound();
  return id;
}

/** Kiểm tra dữ liệu kế hoạch và chuẩn bị phần lưu vào database: { data, label }. */
function prepareData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw validationError({ data: 'Dữ liệu kế hoạch không hợp lệ.' });
  }
  const clean = { ...data };
  UI_ONLY_KEYS.forEach((k) => delete clean[k]);
  const text = JSON.stringify(clean);
  if (Buffer.byteLength(text, 'utf8') > MAX_PLAN_BYTES) {
    throw new HttpError(413, 'Kế hoạch quá lớn (tối đa 512 KB), chưa lưu được lên tài khoản. Hãy tải file sao lưu .json để giữ dữ liệu.', {
      code: 'PLAN_TOO_LARGE',
    });
  }
  return { data: text, label: planLabel(clean.info) };
}

function parseName(name) {
  if (typeof name !== 'string') throw validationError({ name: 'Tên hồ sơ không hợp lệ.' });
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length > PLAN_NAME_MAX) throw validationError({ name: `Tên hồ sơ tối đa ${PLAN_NAME_MAX} ký tự.` });
  return clean;
}

export const planRouter = Router();
planRouter.use(requireAuth);

/** Danh sách hồ sơ của chính người dùng, mới sửa nhất đứng đầu. */
planRouter.get('/', async (req, res) => {
  const userId = req.user.id;
  const plans = await prisma.plan.findMany({ where: { userId }, select: SUMMARY, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
  // Hồ sơ lưu từ trước khi có cột label: điền nhãn ở lần liệt kê đầu tiên (giữ nguyên updatedAt).
  for (const p of plans.filter((x) => !x.label)) {
    const row = await prisma.plan.findUnique({ where: { id: p.id }, select: { data: true } });
    try {
      p.label = planLabel(JSON.parse(row.data).info);
    } catch {
      continue;
    }
    if (p.label) await prisma.plan.updateMany({ where: { id: p.id, userId }, data: { label: p.label, updatedAt: p.updatedAt } });
  }
  res.json({ plans });
});

/** Tạo hồ sơ mới. body: { data, name? }. */
planRouter.post('/', planWriteLimiter, async (req, res) => {
  const prepared = prepareData(req.body?.data);
  const name = parseName(req.body?.name ?? '');
  const userId = req.user.id;
  if ((await prisma.plan.count({ where: { userId } })) >= MAX_PLANS_PER_USER) {
    // Không dùng 409: phía client hiểu 409 là xung đột phiên bản.
    throw new HttpError(400, `Mỗi tài khoản lưu tối đa ${MAX_PLANS_PER_USER} hồ sơ. Hãy xóa bớt hồ sơ không dùng nữa.`, { code: 'PLAN_LIMIT' });
  }
  const plan = await prisma.plan.create({ data: { userId, name, ...prepared, version: 1, updatedAt: new Date() }, select: SUMMARY });
  res.status(201).json(plan);
});

planRouter.get('/:id', async (req, res) => {
  const plan = await prisma.plan.findFirst({ where: { id: planId(req), userId: req.user.id } });
  if (!plan) throw notFound();
  res.json({ id: plan.id, name: plan.name, label: plan.label, data: JSON.parse(plan.data), version: plan.version, updatedAt: plan.updatedAt });
});

/**
 * Lưu hồ sơ. body: { data, baseVersion } — baseVersion là version client đang sửa.
 * Ghi có điều kiện trong một câu lệnh nên hai máy lưu cùng lúc thì chỉ một máy thắng, máy kia nhận 409.
 */
planRouter.put('/:id', planWriteLimiter, async (req, res) => {
  const id = planId(req);
  const { data, baseVersion } = req.body || {};
  const prepared = prepareData(data);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) {
    throw validationError({ baseVersion: 'Thiếu phiên bản của kế hoạch.' });
  }

  const userId = req.user.id;
  const now = new Date();
  const { count } = await prisma.plan.updateMany({
    where: { id, userId, version: baseVersion },
    data: { ...prepared, version: { increment: 1 }, updatedAt: now },
  });
  if (count === 0) {
    const plan = await prisma.plan.findFirst({ where: { id, userId }, select: SUMMARY });
    throw plan ? conflict(plan) : notFound();
  }
  res.json({ version: baseVersion + 1, updatedAt: now });
});

/** Đổi tên hồ sơ. body: { name } — để trống thì hiển thị theo nhãn tự sinh. */
planRouter.patch('/:id', planWriteLimiter, async (req, res) => {
  const id = planId(req);
  const name = parseName(req.body?.name);
  const userId = req.user.id;
  const plan = await prisma.plan.findFirst({ where: { id, userId }, select: SUMMARY });
  if (!plan) throw notFound();
  // Đổi tên không phải là sửa nội dung: giữ nguyên version và updatedAt.
  await prisma.plan.updateMany({ where: { id, userId }, data: { name, updatedAt: plan.updatedAt } });
  res.json({ ...plan, name });
});

planRouter.delete('/:id', planWriteLimiter, async (req, res) => {
  const { count } = await prisma.plan.deleteMany({ where: { id: planId(req), userId: req.user.id } });
  if (count === 0) throw notFound();
  res.json({ ok: true });
});
