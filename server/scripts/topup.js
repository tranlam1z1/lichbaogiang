// Duyệt / từ chối yêu cầu nạp điểm từ dòng lệnh (dùng tạm trước khi có trang quản trị).
// Dùng chung logic với trang admin nên cũng ghi đầy đủ sổ cái.
//
//   npm run topup -- list
//   npm run topup -- approve KHBDXXXXXX
//   npm run topup -- reject KHBDXXXXXX "Chưa nhận được tiền"
import { prisma } from '../src/db.js';
import { approveTopUp, rejectTopUp } from '../src/services/points.js';
import { formatVnd } from '../../shared/validation.js';

const [cmd, code, ...rest] = process.argv.slice(2);

async function findByCode(c) {
  const t = await prisma.topUpRequest.findUnique({ where: { code: String(c || '').toUpperCase() }, include: { user: true } });
  if (!t) throw new Error(`Không tìm thấy yêu cầu nạp có mã ${c}.`);
  return t;
}

try {
  if (cmd === 'list') {
    const rows = await prisma.topUpRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!rows.length) console.log('Không có yêu cầu nào đang chờ duyệt.');
    for (const t of rows) {
      console.log(`${t.code}  ${t.user.username.padEnd(20)} ${formatVnd(t.amountVnd).padStart(12)}  → ${t.points} điểm  (${t.createdAt.toLocaleString('vi-VN')})`);
    }
  } else if (cmd === 'approve') {
    const t = await findByCode(code);
    const { user } = await approveTopUp(t.id, null);
    console.log(`Đã duyệt ${t.code}: cộng ${t.points} điểm cho ${user.username}. Số dư mới: ${user.points} điểm.`);
  } else if (cmd === 'reject') {
    const t = await findByCode(code);
    await rejectTopUp(t.id, null, rest.join(' '));
    console.log(`Đã từ chối ${t.code} của ${t.user.username}.`);
  } else {
    console.log('Cách dùng: npm run topup -- list | approve <MÃ> | reject <MÃ> "<lý do>"');
  }
} catch (e) {
  console.error(`Lỗi: ${e.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
