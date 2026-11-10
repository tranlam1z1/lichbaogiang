// Thông báo: người dùng đã đăng nhập đọc thông báo đang hiệu lực; admin quản lý ở /api/admin/announcements.
import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const PLACEMENTS = ['MODAL', 'LEFT', 'RIGHT'];
export const TONES = ['INFO', 'WARNING', 'SUCCESS'];
export const TITLE_MAX = 120;
export const BODY_MAX = 5000;
const SORT_LIMIT = 1000;

const PUBLIC_FIELDS = { id: true, title: true, body: true, placement: true, tone: true };
const ORDER = [{ sortOrder: 'asc' }, { id: 'desc' }];

/** null/'' → null; chuỗi ngày hợp lệ (ISO, có múi giờ) → Date; còn lại → undefined (lỗi). */
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return undefined;
  return new Date(v);
}

/** Kiểm tra dữ liệu admin gửi lên; trả về { errors, data }. */
export function validateAnnouncement(body = {}) {
  const errors = {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!title) errors.title = 'Vui lòng nhập tiêu đề.';
  else if (title.length > TITLE_MAX) errors.title = `Tiêu đề tối đa ${TITLE_MAX} ký tự.`;
  if (!text) errors.body = 'Vui lòng nhập nội dung.';
  else if (text.length > BODY_MAX) errors.body = `Nội dung tối đa ${BODY_MAX} ký tự.`;
  if (!PLACEMENTS.includes(body.placement)) errors.placement = 'Vị trí hiển thị không hợp lệ.';
  const tone = body.tone ?? 'INFO';
  if (!TONES.includes(tone)) errors.tone = 'Kiểu thông báo không hợp lệ.';
  const sortOrder = body.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > SORT_LIMIT) errors.sortOrder = `Thứ tự là số nguyên từ −${SORT_LIMIT} đến ${SORT_LIMIT}.`;
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  if (startsAt === undefined) errors.startsAt = 'Ngày bắt đầu không hợp lệ.';
  if (endsAt === undefined) errors.endsAt = 'Ngày kết thúc không hợp lệ.';
  else if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = 'Ngày kết thúc phải sau ngày bắt đầu.';
  const data = { title, body: text, placement: body.placement, tone, isActive: body.isActive !== false, startsAt, endsAt, sortOrder };
  return { errors, data };
}

/** Thông báo đang bật và nằm trong khoảng thời gian hiển thị. */
function activeWhere(now = new Date()) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

announcementsRouter.get('/', async (req, res) => {
  const items = await prisma.announcement.findMany({ where: activeWhere(), select: PUBLIC_FIELDS, orderBy: ORDER });
  res.json({ items });
});

// ---------- Admin (được gắn dưới adminRouter, đã qua requireAdmin) ----------
export const adminAnnouncementsRouter = Router();

function announcementId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Không tìm thấy thông báo.', { code: 'NOT_FOUND' });
  return id;
}

async function findOr404(id) {
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, 'Không tìm thấy thông báo (có thể đã bị xóa).', { code: 'NOT_FOUND' });
  return a;
}

adminAnnouncementsRouter.get('/', async (req, res) => {
  res.json({ items: await prisma.announcement.findMany({ orderBy: ORDER }) });
});

adminAnnouncementsRouter.post('/', async (req, res) => {
  const { errors, data } = validateAnnouncement(req.body);
  if (Object.keys(errors).length) throw validationError(errors);
  res.status(201).json({ item: await prisma.announcement.create({ data }) });
});

adminAnnouncementsRouter.put('/:id', async (req, res) => {
  const id = announcementId(req);
  const { errors, data } = validateAnnouncement(req.body);
  if (Object.keys(errors).length) throw validationError(errors);
  await findOr404(id);
  res.json({ item: await prisma.announcement.update({ where: { id }, data }) });
});

adminAnnouncementsRouter.delete('/:id', async (req, res) => {
  const id = announcementId(req);
  await findOr404(id);
  await prisma.announcement.delete({ where: { id } });
  res.json({ ok: true });
});
