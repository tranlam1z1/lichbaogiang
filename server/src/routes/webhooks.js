// Webhook từ dịch vụ bên ngoài (không dùng cookie đăng nhập, xác thực bằng API Key riêng).
import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { sepayApiKey } from '../lib/bank.js';
import { HttpError } from '../lib/errors.js';
import { handleSepayWebhook } from '../services/bankTransfers.js';

const sha = (s) => createHash('sha256').update(String(s)).digest();

/** SePay gửi header "Authorization: Apikey <key>". So sánh hằng thời gian để không lộ key qua thời gian phản hồi. */
function requireSepayKey(req, res, next) {
  if (!sepayApiKey) {
    throw new HttpError(503, 'Chưa cấu hình SEPAY_WEBHOOK_API_KEY.', { code: 'SEPAY_NOT_CONFIGURED' });
  }
  const m = /^apikey\s+(.+)$/i.exec(String(req.get('authorization') || '').trim());
  if (!m || !timingSafeEqual(sha(m[1].trim()), sha(sepayApiKey))) {
    throw new HttpError(401, 'Sai API Key.', { code: 'UNAUTHORIZED' });
  }
  next();
}

export const webhooksRouter = Router();

webhooksRouter.post('/sepay', requireSepayKey, async (req, res) => {
  const result = await handleSepayWebhook(req.body);
  if (result.topUp) {
    console.log(`[sepay] ${result.topUp.code}: cộng ${result.topUp.points} điểm cho user #${result.topUp.userId}`);
  } else if (result.bankTx && result.bankTx.status === 'UNMATCHED') {
    console.warn(`[sepay] giao dịch #${result.bankTx.id} chưa khớp: ${result.bankTx.note}`);
  }
  // SePay coi 200/201 + {"success": true} là đã nhận; mã khác sẽ gửi lại. Giao dịch trùng/chưa khớp vẫn trả success
  // vì đã lưu xong, gửi lại cũng không thay đổi gì.
  res.status(200).json({ success: true });
});
