// Tạo 3 tài khoản mẫu để thử nghiệm (CHỈ dùng khi phát triển). Chạy lại nhiều lần vẫn an toàn: tài khoản đã có thì bỏ qua.
//   npm run db:seed-demo
// Mật khẩu chung: matkhau123
import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { prisma } from '../src/db.js';
import { BCRYPT_ROUNDS } from '../src/routes/auth.js';
import { approveTopUp, authorizeExport, completeExport, createUserWithBonus } from '../src/services/points.js';
import { getSettings } from '../src/services/settings.js';
import { pointsForAmount } from '../../shared/validation.js';

const PASSWORD = 'matkhau123';

if (process.env.NODE_ENV === 'production') {
  console.error('Không chạy dữ liệu mẫu trên môi trường production.');
  process.exit(1);
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => `KHBD${Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')}`;

async function topUp(userId, amountVnd) {
  const { topupUnitVnd, pointsPerUnit } = await getSettings();
  return prisma.topUpRequest.create({
    data: { userId, amountVnd, points: pointsForAmount(amountVnd, topupUnitVnd, pointsPerUnit), code: newCode() },
  });
}

async function exportFile(userId, fileType, description, confirmCost = 0) {
  const { exportLog } = await authorizeExport(userId, { fileType, confirmCost, description });
  await completeExport(userId, exportLog.id);
}

const DEMO_USERS = [
  {
    username: 'gv_hoa',
    email: 'hoa.nguyen@example.com',
    phone: '0901000001',
    note: 'Tài khoản mới, còn đủ lượt miễn phí',
  },
  {
    username: 'gv_minh',
    email: 'minh.tran@example.com',
    phone: '0901000002',
    note: 'Đã dùng hết lượt miễn phí, có điểm, có lịch sử xuất file và 1 yêu cầu nạp chờ duyệt',
    async setup(user) {
      const { pointsPerExport } = await getSettings();
      for (let i = 1; i <= 5; i++) await exportFile(user.id, i % 2 ? 'DOCX' : 'XLSX', `tuan-${i} (1 tuần)`);
      await approveTopUp((await topUp(user.id, 30000)).id, null);
      await exportFile(user.id, 'DOCX', 'hk1 (18 tuần)', pointsPerExport);
      await exportFile(user.id, 'XLSX', 'ca-nam (35 tuần)', pointsPerExport);
      await topUp(user.id, 50000); // để lại ở trạng thái Chờ duyệt
    },
  },
  {
    username: 'gv_tuan',
    email: 'tuan.le@example.com',
    phone: '0901000003',
    note: 'Tài khoản bị khóa',
    async setup(user) {
      await exportFile(user.id, 'DOCX', 'tuan-1 (1 tuần)');
      await prisma.user.update({
        where: { id: user.id },
        data: { isLocked: true, lockReason: 'Tài khoản mẫu bị khóa để thử nghiệm', tokenVersion: { increment: 1 } },
      });
    },
  },
];

try {
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  for (const demo of DEMO_USERS) {
    const clash = await prisma.user.findFirst({
      where: { OR: [{ username: demo.username }, { email: demo.email }, { phone: demo.phone }] },
    });
    if (clash) {
      console.log(`• Bỏ qua ${demo.username}: đã có tài khoản trùng tên / email / SĐT (${clash.username}).`);
      continue;
    }
    const user = await createUserWithBonus({ username: demo.username, email: demo.email, phone: demo.phone, passwordHash });
    await demo.setup?.(user);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    console.log(`• Đã tạo ${u.username.padEnd(8)} — ${demo.note}. Lượt miễn phí: ${u.freeExportsLeft}, điểm: ${u.points}.`);
  }
  console.log(`\nMật khẩu của các tài khoản mẫu: ${PASSWORD}`);
} catch (e) {
  console.error(`Lỗi: ${e.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
