// Tiền vào tài khoản ngân hàng (webhook SePay báo về) → tự động duyệt yêu cầu nạp tương ứng.
//
// Chỉ tự cộng điểm khi CHẮC CHẮN: tìm được đúng mã KHBD… đang chờ duyệt VÀ số tiền khớp tuyệt đối.
// Mọi trường hợp khác đều được lưu lại để admin xem và xử lý tay, không bao giờ tự đoán.
import { prisma } from '../db.js';
import { bank } from '../lib/bank.js';
import { HttpError } from '../lib/errors.js';
import { extractTopUpCodes } from '../lib/topupCode.js';
import { formatVnd } from '../../../shared/validation.js';
import { TX_OPTS, approveTopUpTx } from './points.js';

export const BANK_TX_STATUSES = ['AUTO_APPROVED', 'NO_CODE', 'NOT_FOUND', 'AMOUNT_MISMATCH', 'NOT_PENDING', 'OTHER_ACCOUNT', 'RESOLVED', 'DISMISSED'];
/** Các trạng thái admin cần xem và xử lý. */
export const NEEDS_REVIEW = ['NO_CODE', 'NOT_FOUND', 'AMOUNT_MISMATCH', 'NOT_PENDING'];

const STATUS_LABEL = { PENDING: 'chờ duyệt', APPROVED: 'đã duyệt', REJECTED: 'bị từ chối', CANCELLED: 'đã hủy' };

/** Tiền vào đúng tài khoản nhận tiền của hệ thống? (SePay có thể liên kết nhiều tài khoản / tài khoản ảo.) */
function isOurAccount(accountNumber, subAccount) {
  if (!bank.accountNo) return true;
  const ours = bank.accountNo.replace(/\s/g, '');
  return [accountNumber, subAccount].some((a) => a && String(a).replace(/\s/g, '') === ours) || (!accountNumber && !subAccount);
}

/** Quyết định xử lý một giao dịch tiền vào; tự duyệt ngay trong transaction nếu mọi thứ khớp. */
async function match(tx, { amountVnd, content, codeHint, accountNumber, subAccount }) {
  if (!isOurAccount(accountNumber, subAccount)) {
    return { status: 'OTHER_ACCOUNT', note: `Tiền vào tài khoản khác (${accountNumber}), không phải tài khoản nhận tiền nạp điểm.` };
  }
  const codes = extractTopUpCodes(codeHint, content);
  if (!codes.length) return { status: 'NO_CODE', note: 'Nội dung chuyển khoản không có mã nạp KHBD….' };

  const found = await tx.topUpRequest.findMany({ where: { code: { in: codes } } });
  if (!found.length) return { status: 'NOT_FOUND', matchedCode: codes[0], note: `Không có yêu cầu nạp nào mang mã ${codes.join(', ')}.` };
  if (found.length > 1) {
    return { status: 'NOT_FOUND', matchedCode: codes[0], note: `Nội dung chứa nhiều mã nạp (${found.map((t) => t.code).join(', ')}), cần kiểm tra tay.` };
  }

  const [topUp] = found;
  const base = { matchedCode: topUp.code, topUpId: topUp.id };
  if (topUp.status !== 'PENDING') {
    return { ...base, status: 'NOT_PENDING', note: `Yêu cầu ${topUp.code} đang ở trạng thái "${STATUS_LABEL[topUp.status] || topUp.status}".` };
  }
  if (amountVnd !== topUp.amountVnd) {
    return { ...base, status: 'AMOUNT_MISMATCH', note: `Yêu cầu ${topUp.code} cần ${formatVnd(topUp.amountVnd)}, thực nhận ${formatVnd(amountVnd)}.` };
  }
  try {
    await approveTopUpTx(tx, topUp.id, null, { noteSuffix: ' — tự động xác nhận qua ngân hàng' });
  } catch (e) {
    if (e.code !== 'ALREADY_PROCESSED') throw e;
    return { ...base, status: 'NOT_PENDING', note: `Yêu cầu ${topUp.code} vừa được xử lý trước đó.` };
  }
  return { ...base, status: 'AUTO_APPROVED', note: null };
}

/**
 * Ghi nhận một giao dịch tiền vào. Gọi lại với cùng (provider, providerTxId) → không xử lý lần hai.
 * Trả về { bankTx, duplicate }.
 */
export async function recordIncoming({ provider, providerTxId, amountVnd, content, codeHint, gateway, accountNumber, subAccount, referenceCode, transactionDate, raw }) {
  const key = { provider_providerTxId: { provider, providerTxId } };
  const existing = await prisma.bankTransaction.findUnique({ where: key });
  if (existing) return { bankTx: existing, duplicate: true };
  try {
    const bankTx = await prisma.$transaction(async (tx) => {
      const result = await match(tx, { amountVnd, content, codeHint, accountNumber, subAccount });
      return tx.bankTransaction.create({
        data: {
          provider,
          providerTxId,
          gateway: gateway || null,
          accountNumber: accountNumber || subAccount || null,
          amountVnd,
          content,
          referenceCode: referenceCode || null,
          transactionDate: transactionDate || null,
          matchedCode: result.matchedCode ?? null,
          status: result.status,
          note: result.note,
          topUpId: result.topUpId ?? null,
          raw: JSON.stringify(raw).slice(0, 5000),
        },
      });
    }, TX_OPTS);
    return { bankTx, duplicate: false };
  } catch (e) {
    // Hai webhook trùng đến cùng lúc: bản sau vướng khóa unique → cả transaction (kể cả cộng điểm) bị hủy.
    if (e.code === 'P2002') return { bankTx: await prisma.bankTransaction.findUnique({ where: key }), duplicate: true };
    throw e;
  }
}

async function claimForReview(tx, id, data) {
  const done = await tx.bankTransaction.updateMany({ where: { id, status: { in: NEEDS_REVIEW } }, data });
  if (done.count !== 1) {
    const exists = await tx.bankTransaction.findUnique({ where: { id } });
    if (!exists) throw new HttpError(404, 'Không tìm thấy giao dịch ngân hàng này.', { code: 'NOT_FOUND' });
    throw new HttpError(409, 'Giao dịch này đã được xử lý.', { code: 'ALREADY_PROCESSED' });
  }
}

/**
 * Admin gán giao dịch ngân hàng cho một yêu cầu nạp và cộng điểm.
 * Cho phép cả yêu cầu đã hủy / bị từ chối (tiền về muộn sau khi người dùng lỡ hủy).
 */
export async function assignBankTx(id, actorId, topUpCode) {
  const code = String(topUpCode || '').trim().toUpperCase();
  if (!code) throw new HttpError(400, 'Vui lòng nhập mã nạp.', { code: 'VALIDATION', errors: { code: 'Vui lòng nhập mã nạp.' } });
  return prisma.$transaction(async (tx) => {
    const topUp = await tx.topUpRequest.findUnique({ where: { code } });
    if (!topUp) throw new HttpError(404, `Không tìm thấy yêu cầu nạp mã ${code}.`, { code: 'NOT_FOUND', errors: { code: 'Không tìm thấy mã nạp này.' } });
    await claimForReview(tx, id, { status: 'RESOLVED', topUpId: topUp.id, matchedCode: code, resolvedById: actorId, resolvedAt: new Date() });
    const approved = await approveTopUpTx(tx, topUp.id, actorId, {
      fromStatuses: ['PENDING', 'CANCELLED', 'REJECTED'],
      noteSuffix: ` — admin gán giao dịch ngân hàng #${id}`,
    });
    return { ...approved, bankTx: await tx.bankTransaction.findUniqueOrThrow({ where: { id } }) };
  }, TX_OPTS);
}

/** Admin đánh dấu bỏ qua (VD: tiền không liên quan, đã hoàn tiền cho người chuyển). Bắt buộc ghi chú. */
export async function dismissBankTx(id, actorId, reason) {
  const note = String(reason || '').trim();
  if (!note) throw new HttpError(400, 'Vui lòng nhập ghi chú.', { code: 'VALIDATION', errors: { note: 'Vui lòng nhập ghi chú.' } });
  return prisma.$transaction(async (tx) => {
    await claimForReview(tx, id, { status: 'DISMISSED', note: note.slice(0, 300), resolvedById: actorId, resolvedAt: new Date() });
    return tx.bankTransaction.findUniqueOrThrow({ where: { id } });
  }, TX_OPTS);
}
