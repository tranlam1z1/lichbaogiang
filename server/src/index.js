import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { ensureDefaultSettings } from './services/settings.js';

// Lần chạy đầu: ghi các cài đặt mặc định vào bảng Setting (không ghi đè giá trị admin đã sửa).
await ensureDefaultSettings();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`API đang chạy tại http://localhost:${config.port}/api`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
