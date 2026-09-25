// Tiện ích dùng chung cho các route quản trị.

export const TRANSACTION_TYPES = ['SIGNUP_BONUS', 'EXPORT', 'EXPORT_REFUND', 'TOPUP', 'ADMIN_ADJUST', 'FREE_RESET'];

/** Tìm người dùng theo tên đăng nhập, email hoặc SĐT (tìm gần đúng). */
export function userSearchWhere(q) {
  const text = String(q || '').trim().toLowerCase();
  if (!text) return null;
  const or = [{ username: { contains: text } }, { email: { contains: text } }];
  const digits = text.replace(/[\s.\-()+]/g, '');
  if (/^\d{3,}$/.test(digits)) {
    or.push({ phone: { contains: digits } });
    // Người dùng gõ dạng 84912… → cũng tìm 0912…
    if (digits.startsWith('84')) or.push({ phone: { contains: `0${digits.slice(2)}` } });
  }
  return { OR: or };
}

/** Điều kiện lọc theo người dùng cho bảng có userId: ?userId= (chính xác) hoặc ?q= (tìm gần đúng). */
export function userFilter(query) {
  const id = Number(query.userId);
  if (Number.isInteger(id) && id > 0) return { userId: id };
  const search = userSearchWhere(query.q);
  return search ? { user: search } : null;
}

export const userBrief = { select: { id: true, username: true, email: true } };

export function publicTransaction(t) {
  return {
    id: t.id,
    type: t.type,
    points: t.points,
    balanceAfter: t.balanceAfter,
    freeExports: t.freeExports,
    freeExportsAfter: t.freeExportsAfter,
    note: t.note,
    exportId: t.exportId,
    topUpId: t.topUpId,
    createdAt: t.createdAt,
    user: t.user ? { id: t.user.id, username: t.user.username } : undefined,
    actor: t.actor ? { id: t.actor.id, username: t.actor.username } : null,
  };
}
