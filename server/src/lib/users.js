/** Thông tin người dùng gửi về trình duyệt — không bao giờ kèm passwordHash / tokenVersion. */
export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    phone: u.phone,
    role: u.role,
    freeExportsLeft: u.freeExportsLeft,
    points: u.points,
    // Frontend dùng làm mốc "lần đăng nhập này" để hiện lại modal thông báo sau mỗi lần đăng nhập.
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function lockedMessage(user) {
  return user.lockReason
    ? `Tài khoản của bạn đã bị khóa. Lý do: ${user.lockReason}`
    : 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.';
}
