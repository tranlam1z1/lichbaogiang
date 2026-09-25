// MỌI thay đổi điểm / lượt miễn phí đều đi qua file này và luôn ghi một dòng PointTransaction.
//
// Chống trừ sai khi bấm nhiều lần / nhiều tab cùng lúc: không bao giờ "đọc số dư rồi ghi số mới",
// mà dùng câu lệnh cập nhật có điều kiện, VD: UPDATE ... SET points = points - 5 WHERE id = ? AND points >= 5.
// Database tự đảm bảo chỉ request nào thỏa điều kiện mới trừ được → số dư không bao giờ âm.
import { prisma } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { formatVnd } from '../../../shared/validation.js';
import { getSettings } from './settings.js';

// SQLite chỉ cho một transaction ghi tại một thời điểm; cho phép chờ lâu hơn mặc định (2s) khi đông request.
const TX_OPTS = { maxWait: 10_000, timeout: 15_000 };

/** Chỉ hoàn lại lượt/điểm cho lần xuất vừa cấp phép trong khoảng thời gian này. */
export const REFUND_WINDOW_MS = 15 * 60 * 1000;

export const FILE_TYPES = { DOCX: 'Word', XLSX: 'Excel' };

/** Ghi sổ cái; user phải là bản ghi ĐÃ cập nhật để lấy đúng số dư sau giao dịch. */
function writeLedger(tx, user, { type, points = 0, freeExports = 0, actorId = null, note = null, exportId = null, topUpId = null }) {
  return tx.pointTransaction.create({
    data: {
      userId: user.id,
      type,
      points,
      balanceAfter: user.points,
      freeExports,
      freeExportsAfter: user.freeExportsLeft,
      actorId,
      note,
      exportId,
      topUpId,
    },
  });
}

async function balances(tx, userId) {
  return tx.user.findUniqueOrThrow({ where: { id: userId } });
}

// ---------------------------------------------------------------------------
// Đăng ký: tặng lượt miễn phí
// ---------------------------------------------------------------------------

/** Tạo tài khoản kèm lượt miễn phí theo cài đặt hiện tại, có ghi sổ cái. */
export async function createUserWithBonus(data) {
  return prisma.$transaction(async (tx) => {
    const { freeExportsForNewUser } = await getSettings(tx);
    const user = await tx.user.create({ data: { ...data, freeExportsLeft: freeExportsForNewUser } });
    if (freeExportsForNewUser > 0) {
      await writeLedger(tx, user, {
        type: 'SIGNUP_BONUS',
        freeExports: freeExportsForNewUser,
        actorId: user.id,
        note: `Tặng ${freeExportsForNewUser} lượt xuất miễn phí khi đăng ký`,
      });
    }
    return user;
  }, TX_OPTS);
}

// ---------------------------------------------------------------------------
// Xuất file
// ---------------------------------------------------------------------------

/**
 * Cấp phép một lần xuất file: ưu tiên dùng lượt miễn phí, hết thì trừ điểm.
 * confirmCost = số điểm người dùng đã đồng ý trả (0 nếu họ nghĩ còn lượt miễn phí).
 * Nếu thực tế phải trừ điểm mà con số này không khớp giá hiện tại → 409 để frontend hỏi lại.
 */
export async function authorizeExport(userId, { fileType, confirmCost, description }) {
  return prisma.$transaction(async (tx) => {
    const { pointsPerExport: cost } = await getSettings(tx);

    const free = await tx.user.updateMany({
      where: { id: userId, freeExportsLeft: { gt: 0 } },
      data: { freeExportsLeft: { decrement: 1 } },
    });

    let chargeType = 'FREE';
    let pointsCharged = 0;
    if (free.count !== 1) {
      if (Number(confirmCost) !== cost) {
        const u = await balances(tx, userId);
        throw new HttpError(409, `Bạn đã hết lượt miễn phí. Lần xuất này sẽ trừ ${cost} điểm, vui lòng xác nhận lại.`, {
          code: 'CONFIRM_REQUIRED',
          details: { cost, points: u.points, freeExportsLeft: u.freeExportsLeft },
        });
      }
      if (cost > 0) {
        const paid = await tx.user.updateMany({
          where: { id: userId, points: { gte: cost } },
          data: { points: { decrement: cost } },
        });
        if (paid.count !== 1) {
          const u = await balances(tx, userId);
          throw new HttpError(402, `Bạn không đủ điểm để xuất file (cần ${cost} điểm, hiện có ${u.points} điểm).`, {
            code: 'INSUFFICIENT_POINTS',
            details: { cost, points: u.points, freeExportsLeft: u.freeExportsLeft },
          });
        }
      }
      chargeType = 'POINTS';
      pointsCharged = cost;
    }

    const user = await balances(tx, userId);
    const exportLog = await tx.exportLog.create({
      data: { userId, fileType, chargeType, pointsCharged, description: description || null },
    });
    await writeLedger(tx, user, {
      type: 'EXPORT',
      points: -pointsCharged,
      freeExports: chargeType === 'FREE' ? -1 : 0,
      actorId: userId,
      exportId: exportLog.id,
      note: `Xuất file ${FILE_TYPES[fileType]}${chargeType === 'FREE' ? ' (lượt miễn phí)' : ''}`,
    });
    return { exportLog, user };
  }, TX_OPTS);
}

/** Frontend báo đã tạo file thành công → không hoàn lại được nữa. Gọi lại nhiều lần vẫn an toàn. */
export async function completeExport(userId, exportId) {
  const done = await prisma.exportLog.updateMany({
    where: { id: exportId, userId, status: 'AUTHORIZED' },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  if (done.count === 1) return;
  const log = await prisma.exportLog.findFirst({ where: { id: exportId, userId } });
  if (!log) throw new HttpError(404, 'Không tìm thấy lần xuất file này.', { code: 'NOT_FOUND' });
}

/** Tạo file ở frontend bị lỗi → hoàn lại đúng lượt/điểm đã trừ cho exportId đó (chỉ một lần). */
export async function refundExport(userId, exportId, reason) {
  return prisma.$transaction(async (tx) => {
    const log = await tx.exportLog.findFirst({ where: { id: exportId, userId } });
    if (!log) throw new HttpError(404, 'Không tìm thấy lần xuất file này.', { code: 'NOT_FOUND' });
    if (log.status !== 'AUTHORIZED') {
      throw new HttpError(409, 'Lần xuất file này đã hoàn tất hoặc đã được hoàn lại trước đó.', { code: 'NOT_REFUNDABLE' });
    }
    if (Date.now() - log.createdAt.getTime() > REFUND_WINDOW_MS) {
      throw new HttpError(409, 'Đã quá thời hạn hoàn lại cho lần xuất file này. Vui lòng liên hệ quản trị viên.', {
        code: 'REFUND_EXPIRED',
      });
    }
    // Điều kiện status = AUTHORIZED chặn việc hai request hoàn lại cùng lúc đều được cộng.
    const marked = await tx.exportLog.updateMany({
      where: { id: exportId, status: 'AUTHORIZED' },
      data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: String(reason || '').slice(0, 300) || null },
    });
    if (marked.count !== 1) {
      throw new HttpError(409, 'Lần xuất file này đã được hoàn lại trước đó.', { code: 'NOT_REFUNDABLE' });
    }
    const isFree = log.chargeType === 'FREE';
    const user = await tx.user.update({
      where: { id: userId },
      data: isFree ? { freeExportsLeft: { increment: 1 } } : { points: { increment: log.pointsCharged } },
    });
    await writeLedger(tx, user, {
      type: 'EXPORT_REFUND',
      points: isFree ? 0 : log.pointsCharged,
      freeExports: isFree ? 1 : 0,
      actorId: userId,
      exportId,
      note: `Hoàn lại do tạo file ${FILE_TYPES[log.fileType]} lỗi`,
    });
    return { user };
  }, TX_OPTS);
}

// ---------------------------------------------------------------------------
// Nạp điểm
// ---------------------------------------------------------------------------

/** Admin (hoặc script) duyệt yêu cầu nạp → cộng điểm. Duyệt hai lần cũng chỉ cộng một lần. */
export async function approveTopUp(topUpId, actorId) {
  return prisma.$transaction(async (tx) => {
    const marked = await tx.topUpRequest.updateMany({
      where: { id: topUpId, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedById: actorId, reviewedAt: new Date() },
    });
    if (marked.count !== 1) {
      throw new HttpError(409, 'Yêu cầu nạp không tồn tại hoặc đã được xử lý.', { code: 'ALREADY_PROCESSED' });
    }
    const topUp = await tx.topUpRequest.findUniqueOrThrow({ where: { id: topUpId } });
    const user = await tx.user.update({ where: { id: topUp.userId }, data: { points: { increment: topUp.points } } });
    await writeLedger(tx, user, {
      type: 'TOPUP',
      points: topUp.points,
      actorId,
      topUpId,
      note: `Nạp ${formatVnd(topUp.amountVnd)} (mã ${topUp.code})`,
    });
    return { topUp, user };
  }, TX_OPTS);
}

export async function rejectTopUp(topUpId, actorId, reason) {
  const text = String(reason || '').trim();
  if (!text) throw new HttpError(400, 'Vui lòng nhập lý do từ chối.', { code: 'VALIDATION', errors: { reason: 'Vui lòng nhập lý do từ chối.' } });
  const marked = await prisma.topUpRequest.updateMany({
    where: { id: topUpId, status: 'PENDING' },
    data: { status: 'REJECTED', reviewedById: actorId, reviewedAt: new Date(), rejectReason: text.slice(0, 300) },
  });
  if (marked.count !== 1) {
    throw new HttpError(409, 'Yêu cầu nạp không tồn tại hoặc đã được xử lý.', { code: 'ALREADY_PROCESSED' });
  }
  return prisma.topUpRequest.findUniqueOrThrow({ where: { id: topUpId } });
}

// ---------------------------------------------------------------------------
// Quản trị
// ---------------------------------------------------------------------------

/** Giới hạn mỗi lần cộng/trừ tay, chặn gõ nhầm thêm số 0. */
export const MAX_ADJUST_POINTS = 1_000_000;

/** Admin cộng (delta > 0) hoặc trừ (delta < 0) điểm thủ công. Bắt buộc lý do; trừ không được làm âm điểm. */
export async function adjustPoints(userId, delta, actorId, reason) {
  const note = String(reason || '').trim();
  const n = Number(delta);
  const errors = {};
  if (!Number.isInteger(n) || n === 0) errors.delta = 'Số điểm phải là số nguyên khác 0.';
  else if (Math.abs(n) > MAX_ADJUST_POINTS) errors.delta = `Mỗi lần chỉ cộng/trừ tối đa ${MAX_ADJUST_POINTS.toLocaleString('vi-VN')} điểm.`;
  if (!note) errors.reason = 'Vui lòng nhập lý do.';
  if (Object.keys(errors).length) {
    throw new HttpError(400, Object.values(errors)[0], { code: 'VALIDATION', errors });
  }
  return prisma.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: userId, ...(n < 0 && { points: { gte: -n } }) },
      data: { points: { increment: n } },
    });
    if (changed.count !== 1) {
      const u = await tx.user.findUnique({ where: { id: userId } });
      if (!u) throw new HttpError(404, 'Không tìm thấy người dùng.', { code: 'NOT_FOUND' });
      throw new HttpError(409, `Không thể trừ ${-n} điểm: người dùng chỉ còn ${u.points} điểm.`, {
        code: 'INSUFFICIENT_POINTS',
        details: { points: u.points },
      });
    }
    const user = await balances(tx, userId);
    await writeLedger(tx, user, { type: 'ADMIN_ADJUST', points: n, actorId, note: note.slice(0, 300) });
    return { user };
  }, TX_OPTS);
}

/** Admin đặt lại số lượt xuất miễn phí về một giá trị cụ thể (ghi sổ cái phần chênh lệch). */
export async function resetFreeExports(userId, value, actorId, reason) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 1000) {
    throw new HttpError(400, 'Số lượt miễn phí phải là số nguyên từ 0 đến 1000.', {
      code: 'VALIDATION',
      errors: { value: 'Số lượt miễn phí phải là số nguyên từ 0 đến 1000.' },
    });
  }
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw new HttpError(404, 'Không tìm thấy người dùng.', { code: 'NOT_FOUND' });
    const user = await tx.user.update({ where: { id: userId }, data: { freeExportsLeft: n } });
    const note = String(reason || '').trim();
    await writeLedger(tx, user, {
      type: 'FREE_RESET',
      freeExports: n - before.freeExportsLeft,
      actorId,
      note: (note || `Đặt lại lượt miễn phí: ${before.freeExportsLeft} → ${n}`).slice(0, 300),
    });
    return { user };
  }, TX_OPTS);
}
