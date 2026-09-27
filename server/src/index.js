import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { ensureDefaultSettings } from './services/settings.js';

// Mở cổng NGAY khi khởi động (Render/host chỉ coi là chạy khi thấy cổng mở), bind 0.0.0.0 để nhận kết nối từ ngoài.
const app = createApp();
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`API đang chạy tại cổng ${config.port} (/api)`);
});

// Lần chạy đầu: ghi các cài đặt mặc định vào bảng Setting (không ghi đè giá trị admin đã sửa).
// Chạy sau khi đã mở cổng để database chậm/lỗi không làm treo cả quá trình khởi động.
console.log('Đang kết nối database…');
ensureDefaultSettings()
  .then(() => console.log('Database OK, đã kiểm tra cài đặt mặc định.'))
  .catch((e) => console.error('Không ghi được cài đặt mặc định (kiểm tra DATABASE_URL):', e));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
