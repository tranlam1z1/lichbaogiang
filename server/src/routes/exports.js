import { Router } from 'express';
import { prisma } from '../db.js';
import { validationError } from '../lib/errors.js';
import { pageResult, paging } from '../lib/paging.js';
import { publicUser } from '../lib/users.js';
import { requireAuth } from '../middleware/auth.js';
import { FILE_TYPES, authorizeExport, completeExport, refundExport } from '../services/points.js';

export function publicExport(e) {
  return {
    id: e.id,
    fileType: e.fileType,
    chargeType: e.chargeType,
    pointsCharged: e.pointsCharged,
    status: e.status,
    description: e.description,
    createdAt: e.createdAt,
    completedAt: e.completedAt,
    refundedAt: e.refundedAt,
  };
}

export const exportsRouter = Router();
exportsRouter.use(requireAuth);

/** Bước 1: kiểm tra & trừ lượt/điểm, trả exportId. Frontend chỉ tạo file sau khi có exportId. */
exportsRouter.post('/authorize', async (req, res) => {
  const fileType = String(req.body?.fileType || '').toUpperCase();
  if (!FILE_TYPES[fileType]) throw validationError({ fileType: 'Loại file phải là DOCX (Word) hoặc XLSX (Excel).' });
  const { exportLog, user } = await authorizeExport(req.user.id, {
    fileType,
    confirmCost: req.body?.confirmCost ?? 0,
    description: String(req.body?.description || '').slice(0, 120),
  });
  res.status(201).json({ exportId: exportLog.id, export: publicExport(exportLog), user: publicUser(user) });
});

/** Bước 2a: tạo file thành công. */
exportsRouter.post('/:id/complete', async (req, res) => {
  await completeExport(req.user.id, req.params.id);
  res.json({ ok: true });
});

/** Bước 2b: tạo file lỗi → hoàn lại lượt/điểm. */
exportsRouter.post('/:id/refund', async (req, res) => {
  const { user } = await refundExport(req.user.id, req.params.id, req.body?.reason);
  res.json({ user: publicUser(user) });
});

/** Lịch sử xuất file của chính người dùng. */
exportsRouter.get('/', async (req, res) => {
  const p = paging(req.query);
  const where = { userId: req.user.id };
  const [items, total] = await Promise.all([
    prisma.exportLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
    prisma.exportLog.count({ where }),
  ]);
  res.json(pageResult(items.map(publicExport), total, p));
});
