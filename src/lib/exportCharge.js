// Xuất file có tính lượt/điểm:
//   1. POST /exports/authorize  → server trừ lượt miễn phí hoặc điểm, trả exportId
//   2. tạo file trên trình duyệt
//   3a. thành công → POST /exports/:id/complete
//   3b. lỗi        → POST /exports/:id/refund (hoàn lại đúng phần đã trừ)
import { api } from '../api/client.js';

/**
 * @param {object} p
 * @param {'DOCX'|'XLSX'} p.fileType
 * @param {number} p.confirmCost  số điểm người dùng đã đồng ý trả (0 nếu còn lượt miễn phí)
 * @param {string} p.description  mô tả ngắn cho lịch sử, VD "Tuần 1–35"
 * @param {() => Promise<void>} p.generate  hàm tạo và tải file
 * @param {(user: object) => void} p.onUser  nhận số dư mới sau mỗi bước
 * Lỗi khi tạo file được ném lại với e.refunded = true/false để giao diện báo đúng.
 */
export async function runChargedExport({ fileType, confirmCost, description, generate, onUser }) {
  const auth = await api.post('/exports/authorize', { fileType, confirmCost, description });
  onUser(auth.user);
  try {
    await generate();
  } catch (e) {
    try {
      const r = await api.post(`/exports/${auth.exportId}/refund`, { reason: e?.message });
      onUser(r.user);
      e.refunded = true;
    } catch {
      e.refunded = false;
    }
    throw e;
  }
  // File đã tải xong; báo hoàn tất không cần chờ, lỗi mạng ở bước này không ảnh hưởng người dùng.
  api.post(`/exports/${auth.exportId}/complete`).catch(() => {});
  return auth;
}
