// Khởi tạo dữ liệu: cài đặt mặc định + tài khoản quản trị đầu tiên, đọc từ .env.
//   npm run db:seed
// Chạy nhiều lần vẫn an toàn (không tạo trùng, không ghi đè cài đặt admin đã sửa).
import bcrypt from 'bcrypt';
import { prisma } from '../src/db.js';
import { BCRYPT_ROUNDS } from '../src/routes/auth.js';
import { createUserWithBonus } from '../src/services/points.js';
import { ensureDefaultSettings } from '../src/services/settings.js';
import {
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  validateEmail,
  validatePassword,
  validatePhone,
  validateUsername,
} from '../../shared/validation.js';

const env = process.env;

async function seedAdmin() {
  const username = normalizeUsername(env.ADMIN_USERNAME);
  if (!username) {
    console.log('• Bỏ qua tạo admin: chưa đặt ADMIN_USERNAME trong .env.');
    return;
  }
  const usernameErr = validateUsername(env.ADMIN_USERNAME);
  if (usernameErr) throw new Error(`ADMIN_USERNAME: ${usernameErr}`);

  const existing = await prisma.user.findUnique({ where: { username } });
  const resetPassword = ['1', 'true', 'yes'].includes(String(env.ADMIN_RESET_PASSWORD || '').toLowerCase());

  if (existing) {
    const data = { role: 'ADMIN', isLocked: false, lockReason: null };
    if (resetPassword) {
      const err = validatePassword(env.ADMIN_PASSWORD);
      if (err) throw new Error(`ADMIN_PASSWORD: ${err}`);
      data.passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS);
      data.tokenVersion = { increment: 1 };
    }
    await prisma.user.update({ where: { id: existing.id }, data });
    console.log(`• Tài khoản "${username}" đã có sẵn → đặt quyền ADMIN${resetPassword ? ' và đổi mật khẩu' : ' (giữ nguyên mật khẩu)'}.`);
    return;
  }

  const errors = [
    ['ADMIN_PASSWORD', validatePassword(env.ADMIN_PASSWORD)],
    ['ADMIN_EMAIL', validateEmail(env.ADMIN_EMAIL)],
    ['ADMIN_PHONE', validatePhone(env.ADMIN_PHONE)],
  ].filter(([, e]) => e);
  if (errors.length) {
    throw new Error(`Chưa tạo được admin "${username}":\n${errors.map(([k, e]) => `  - ${k}: ${e}`).join('\n')}`);
  }
  const email = normalizeEmail(env.ADMIN_EMAIL);
  const phone = normalizePhone(env.ADMIN_PHONE);
  const clash = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
  if (clash) throw new Error(`Email hoặc SĐT của admin đã được tài khoản "${clash.username}" sử dụng.`);

  await createUserWithBonus({
    username,
    email,
    phone,
    role: 'ADMIN',
    passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS),
  });
  console.log(`• Đã tạo tài khoản quản trị "${username}". Nên xóa ADMIN_PASSWORD khỏi .env.`);
}

try {
  await ensureDefaultSettings();
  console.log('• Cài đặt mặc định: OK');
  await seedAdmin();
} catch (e) {
  console.error(`Lỗi: ${e.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
