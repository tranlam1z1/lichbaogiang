// Modal thông báo hiện lại sau MỖI lần đăng nhập: lưu id đã đóng kèm mốc lastLoginAt.
// Đăng nhập lại → lastLoginAt đổi → danh sách đã đóng cũ không còn hiệu lực.

export const DISMISS_STORAGE_KEY = 'announcements:dismissed';

/** Mốc nhận diện lần đăng nhập hiện tại của người dùng. */
export const loginKey = (user) => `${user?.id ?? ''}:${user?.lastLoginAt ?? ''}`;

/** Id các modal đã đóng trong lần đăng nhập `login`, đọc từ chuỗi đã lưu (có thể hỏng / rỗng). */
export function dismissedIds(raw, login) {
  try {
    const d = JSON.parse(raw);
    return d?.login === login && Array.isArray(d.ids) ? d.ids : [];
  } catch {
    return [];
  }
}

/** Chuỗi lưu mới sau khi đóng thêm `ids` trong lần đăng nhập `login`. */
export function withDismissed(raw, login, ids) {
  return JSON.stringify({ login, ids: [...new Set([...dismissedIds(raw, login), ...ids])] });
}

/** Thông báo modal chưa đóng trong lần đăng nhập này. */
export const pendingModals = (items, dismissed) => items.filter((a) => a.placement === 'MODAL' && !dismissed.includes(a.id));
