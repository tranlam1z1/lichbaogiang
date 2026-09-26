// Thông tin tài khoản nhận tiền chuyển khoản (đọc từ .env) và link ảnh QR VietQR.
const env = process.env;

export const bank = {
  // Mã ngân hàng theo VietQR: mã BIN (VD 970436) hoặc tên viết tắt (VD vietcombank, mbbank, techcombank).
  bankId: (env.BANK_ID || '').trim(),
  bankName: (env.BANK_NAME || '').trim(),
  accountNo: (env.BANK_ACCOUNT_NO || '').trim(),
  accountName: (env.BANK_ACCOUNT_NAME || '').trim(),
  qrTemplate: (env.VIETQR_TEMPLATE || 'compact2').trim(),
};

export const bankConfigured = Boolean(bank.bankId && bank.accountNo && bank.accountName);

// API Key đặt ở SePay → Webhooks (kiểu chứng thực "API Key"). Có key thì bật tự cộng điểm khi tiền về.
export const sepayApiKey = (env.SEPAY_WEBHOOK_API_KEY || '').trim();
export const autoTopUpEnabled = bankConfigured && Boolean(sepayApiKey);

export function vietQrUrl(amountVnd, content) {
  const params = new URLSearchParams({ amount: String(amountVnd), addInfo: content, accountName: bank.accountName });
  const path = [bank.bankId, bank.accountNo, bank.qrTemplate].map(encodeURIComponent).join('-');
  return `https://img.vietqr.io/image/${path}.png?${params}`;
}

/** Thông tin chuyển khoản gửi về frontend cho một yêu cầu nạp. */
export function transferInfo(topUp) {
  if (!bankConfigured) return null;
  return {
    bankName: bank.bankName || bank.bankId,
    accountNo: bank.accountNo,
    accountName: bank.accountName,
    amountVnd: topUp.amountVnd,
    content: topUp.code,
    qrUrl: vietQrUrl(topUp.amountVnd, topUp.code),
  };
}
