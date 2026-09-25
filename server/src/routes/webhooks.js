// Webhook từ dịch vụ theo dõi số dư ngân hàng (SePay — hỗ trợ MB Bank) → tự động duyệt nạp điểm.
// Tài liệu: https://docs.sepay.vn/tich-hop-webhooks.html
//
// SePay coi là thành công khi nhận HTTP 200/201 kèm {"success": true}; nếu không sẽ gửi lại (tối đa 7 lần trong 5 giờ),
// nên mọi giao dịch đã ghi nhận (kể cả trùng, kể cả cần admin kiểm tra) đều trả success để SePay không gửi lại.
import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { recordIncoming } from '../services/bankTransactions.js';

export const webhooksRouter = Router();

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** So khớp header "Authorization: Apikey <key>" theo thời gian cố định (chống dò key). */
function sepayAuthorized(req) {
  const m = /^Apikey\s+(.+)$/i.exec(req.get('authorization') || '');
  return Boolean(m) && timingSafeEqual(digest(m[1].trim()), digest(config.sepayWebhookKey));
}

webhooksRouter.post('/sepay', async (req, res) => {
  if (!config.sepayWebhookKey) throw new HttpError(404, 'Webhook chưa được bật.', { code: 'NOT_FOUND' });
  if (!sepayAuthorized(req)) throw new HttpError(401, 'Sai API key webhook.', { code: 'UNAUTHORIZED' });

  const b = req.body || {};
  const amount = Number(b.transferAmount);
  if (b.id == null || !Number.isInteger(amount) || amount < 0 || typeof b.transferType !== 'string') {
    throw new HttpError(400, 'Dữ liệu webhook không hợp lệ.', { code: 'VALIDATION' });
  }
  // Chỉ quan tâm tiền VÀO; tiền ra không liên quan tới nạp điểm.
  if (b.transferType !== 'in' || amount === 0) return res.json({ success: true, ignored: true });

  const { bankTx, duplicate } = await recordIncoming({
    provider: 'SEPAY',
    providerTxId: String(b.id),
    amountVnd: amount,
    content: String(b.content ?? b.description ?? '').slice(0, 1000),
    codeHint: b.code,
    gateway: b.gateway,
    accountNumber: b.accountNumber,
    subAccount: b.subAccount,
    referenceCode: b.referenceCode,
    transactionDate: b.transactionDate,
    raw: b,
  });
  res.json({ success: true, status: bankTx.status, duplicate });
});
