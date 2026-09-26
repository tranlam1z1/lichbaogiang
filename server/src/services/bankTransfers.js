// Đối soát tiền vào tài khoản ngân hàng (SePay webhook) với yêu cầu nạp điểm.
//
// Chỉ TỰ cộng điểm khi chắc chắn: đúng tài khoản nhận, nội dung có mã KHBD… của một yêu cầu
// đang chờ (hoặc người dùng lỡ hủy) và số tiền khớp đúng. Mọi trường hợp khác lưu lại ở trạng thái
// UNMATCHED để admin xử lý tay — không bao giờ đoán.
import { prisma } from '../db.js';
import { bank } from '../lib/bank.js';
import { HttpError } from '../lib/errors.js';
import { formatVnd } from '../../../shared/validation.js';
import { TX_OPTS, approveTopUpInTx } from './points.js';

export const BANK_TX_STATUSES = ['MATCHED', 'UNMATCHED', 'IGNORED', 'RESOLVED'];

/** Yêu cầu ở các trạng thái này mà nhận đúng số tiền thì tự duyệt. CANCELLED: người dùng chuyển rồi mới bấm hủy. */
const AUTO_APPROVE_FROM = ['PENDING', 'CANCELLED'];

const TOPUP_STATUS_TEXT = { APPROVED: 'đã được duyệt', REJECTED: 'đã bị từ chối' };

/** Tìm các mã nạp trong nội dung CK. Ngân hàng hay dính mã vào chữ khác hoặc đổi hoa/thường nên chỉ lấy đúng 10 ký tự. */
export function extractTopUpCodes(...texts) {
  const codes = new Set();
  for (const t of texts) {
    for (const m of String(t || '').toUpperCase().matchAll(/KHBD[A-Z0-9]{6}/g)) codes.add(m[0]);
  }
  return [...codes];
}

const digits = (s) => String(s || '').replace(/\D/g, '');

/** Quyết định giao dịch này thuộc yêu cầu nạp nào (chỉ đọc). */
async function classify(tx, p) {
  if (p.transferType !== 'in') return { status: 'IGNORED', note: 'Giao dịch tiền ra' };
  if (bank.accountNo && p.accountNumber && digits(p.accountNumber) !== digits(bank.accountNo)) {
    return { status: 'IGNORED', note: `Tiền vào tài khoản khác (${p.accountNumber}), không phải tài khoản nhận nạp điểm` };
  }
  const codes = extractTopUpCodes(p.code, p.content, p.description);
  if (!codes.length) return { status: 'UNMATCHED', note: 'Nội dung chuyển khoản không có mã KHBD…' };

  const topUps = await tx.topUpRequest.findMany({ where: { code: { in: codes } } });
  if (!topUps.length) return { status: 'UNMATCHED', note: `Không có yêu cầu nạp nào mang mã ${codes.join(', ')}` };
  // Nội dung có nhiều mã (hiếm): ưu tiên yêu cầu còn chờ và khớp số tiền.
  const topUp =
    topUps.find((t) => AUTO_APPROVE_FROM.includes(t.status) && t.amountVnd === p.amountVnd) ||
    topUps.find((t) => AUTO_APPROVE_FROM.includes(t.status)) ||
    topUps[0];

  if (!AUTO_APPROVE_FROM.includes(topUp.status)) {
    return { status: 'UNMATCHED', topUp, note: `Yêu cầu ${topUp.code} ${TOPUP_STATUS_TEXT[topUp.status]} trước đó — có thể chuyển trùng` };
  }
  if (topUp.amountVnd !== p.amountVnd) {
    return {
      status: 'UNMATCHED',
      topUp,
      note: `Số tiền nhận ${formatVnd(p.amountVnd)} khác số tiền yêu cầu ${formatVnd(topUp.amountVnd)} (${topUp.code})`,
    };
  }
  return { status: 'MATCHED', topUp };
}

/** Chuẩn hóa dữ liệu SePay gửi. Sai định dạng → 400 (SePay sẽ báo lỗi ở trang lịch sử webhook). */
function parseSepay(body) {
  const b = body && typeof body === 'object' ? body : {};
  const amountVnd = Number(b.transferAmount);
  if (b.id === undefined || b.id === null || String(b.id).trim() === '') {
    throw new HttpError(400, 'Thiếu id giao dịch.', { code: 'VALIDATION' });
  }
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
    throw new HttpError(400, 'transferAmount không hợp lệ.', { code: 'VALIDATION' });
  }
  const str = (v, max = 500) => (v === undefined || v === null ? null : String(v).slice(0, max));
  return {
    providerTxId: String(b.id).slice(0, 64),
    transferType: String(b.transferType || '').toLowerCase(),
    amountVnd,
    gateway: str(b.gateway, 64),
    accountNumber: str(b.accountNumber, 64),
    code: str(b.code, 64),
    content: str(b.content) || '',
    description: str(b.description, 1000),
    referenceCode: str(b.referenceCode, 128),
    transactionDate: str(b.transactionDate, 64),
  };
}

/**
 * Xử lý một webhook SePay. SePay gửi lại khi lỗi mạng / timeout nên cùng id có thể tới nhiều lần:
 * ràng buộc unique (provider, providerTxId) đảm bảo chỉ lần đầu được cộng điểm.
 */
export async function handleSepayWebhook(body) {
  const p = parseSepay(body);
  const raw = JSON.stringify(body).slice(0, 5000);
  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await tx.bankTransaction.findUnique({
        where: { provider_providerTxId: { provider: 'SEPAY', providerTxId: p.providerTxId } },
      });
      if (dup) return { duplicate: true, bankTx: dup };

      let { status, note, topUp } = await classify(tx, p);
      // Ghi giao dịch TRƯỚC khi cộng điểm: hai webhook trùng chạy song song sẽ vướng unique ngay ở đây.
      const bankTx = await tx.bankTransaction.create({
        data: {
          provider: 'SEPAY',
          providerTxId: p.providerTxId,
          gateway: p.gateway,
          accountNumber: p.accountNumber,
          amountVnd: p.amountVnd,
          content: p.content,
          referenceCode: p.referenceCode,
          transactionDate: p.transactionDate,
          status,
          note: note ?? null,
          topUpId: topUp?.id ?? null,
          raw,
        },
      });
      if (status !== 'MATCHED') return { bankTx };

      const done = await approveTopUpInTx(tx, topUp.id, null, {
        fromStatuses: AUTO_APPROVE_FROM,
        via: ' — tự động qua SePay',
      });
      if (!done) {
        // Admin vừa duyệt/từ chối tay đúng lúc tiền về.
        status = 'UNMATCHED';
        note = `Yêu cầu ${topUp.code} vừa được xử lý tay — kiểm tra có cộng trùng không`;
        return { bankTx: await tx.bankTransaction.update({ where: { id: bankTx.id }, data: { status, note } }) };
      }
      return { bankTx, topUp: done.topUp, user: done.user };
    }, TX_OPTS);
  } catch (e) {
    if (e.code === 'P2002') return { duplicate: true };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Admin xử lý giao dịch UNMATCHED
// ---------------------------------------------------------------------------

/**
 * Gán giao dịch chưa khớp vào một yêu cầu nạp (VD người dùng ghi sai nội dung) → duyệt yêu cầu đó.
 * Điểm cộng theo yêu cầu nạp; tiền nhận khác thì admin tự cộng/trừ thêm ở trang người dùng.
 */
export async function assignBankTransaction(bankTxId, code, actorId) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) throw new HttpError(400, 'Vui lòng nhập mã nạp.', { code: 'VALIDATION', errors: { code: 'Vui lòng nhập mã nạp.' } });
  return prisma.$transaction(async (tx) => {
    const topUp = await tx.topUpRequest.findUnique({ where: { code: c } });
    if (!topUp) throw new HttpError(404, `Không có yêu cầu nạp nào mang mã ${c}.`, { code: 'NOT_FOUND', errors: { code: 'Mã không tồn tại.' } });
    const marked = await tx.bankTransaction.updateMany({
      where: { id: bankTxId, status: 'UNMATCHED' },
      data: { status: 'MATCHED', topUpId: topUp.id, resolvedById: actorId, resolvedAt: new Date() },
    });
    if (marked.count !== 1) {
      throw new HttpError(409, 'Giao dịch không tồn tại hoặc đã được xử lý.', { code: 'ALREADY_PROCESSED' });
    }
    const done = await approveTopUpInTx(tx, topUp.id, actorId, { fromStatuses: AUTO_APPROVE_FROM, via: ' — admin đối soát' });
    if (!done) {
      throw new HttpError(409, `Yêu cầu ${c} ${TOPUP_STATUS_TEXT[topUp.status] || 'đã được xử lý'}, không gán được.`, {
        code: 'ALREADY_PROCESSED',
      });
    }
    const bankTx = await tx.bankTransaction.findUniqueOrThrow({ where: { id: bankTxId } });
    return { bankTx, topUp: done.topUp, user: done.user };
  }, TX_OPTS);
}

/** Đánh dấu đã xử lý tay (đã hoàn tiền, đã cộng điểm thủ công…). Bắt buộc ghi chú. */
export async function resolveBankTransaction(bankTxId, actorId, note) {
  const text = String(note || '').trim();
  if (!text) throw new HttpError(400, 'Vui lòng ghi chú cách đã xử lý.', { code: 'VALIDATION', errors: { note: 'Vui lòng ghi chú cách đã xử lý.' } });
  const bankTx = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  const marked = await prisma.bankTransaction.updateMany({
    where: { id: bankTxId, status: 'UNMATCHED' },
    data: {
      status: 'RESOLVED',
      resolvedById: actorId,
      resolvedAt: new Date(),
      note: `${bankTx?.note ? `${bankTx.note}. ` : ''}Admin: ${text}`.slice(0, 500),
    },
  });
  if (marked.count !== 1) throw new HttpError(409, 'Giao dịch không tồn tại hoặc đã được xử lý.', { code: 'ALREADY_PROCESSED' });
  return prisma.bankTransaction.findUniqueOrThrow({ where: { id: bankTxId } });
}
