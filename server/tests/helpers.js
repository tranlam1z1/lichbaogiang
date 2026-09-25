// Dựng server thật trên cổng ngẫu nhiên với database test riêng (prisma/test.db, xóa sạch mỗi lần chạy).
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.NODE_ENV = 'test';
process.env.LOGIN_MAX_FAILS_PER_ACCOUNT = '3';
process.env.LOGIN_MAX_FAILS_PER_IP = '100';
process.env.REGISTER_MAX_PER_HOUR = '1000';
process.env.BANK_ID = '970436';
process.env.BANK_NAME = 'Vietcombank';
process.env.BANK_ACCOUNT_NO = '0123456789';
process.env.BANK_ACCOUNT_NAME = 'NGUYEN VAN A';
process.env.SEPAY_WEBHOOK_API_KEY = 'test-sepay-key-'.padEnd(32, 'k');

// Chỉ xóa database TEST (prisma/test.db), không bao giờ đụng tới dev.db.
for (const f of ['test.db', 'test.db-journal']) rmSync(fileURLToPath(new URL(`../prisma/${f}`, import.meta.url)), { force: true });
execSync('npx prisma migrate deploy', {
  env: process.env,
  stdio: 'ignore',
});

const { createApp } = await import('../src/app.js');
export const { prisma } = await import('../src/db.js');

export async function startServer() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

/** Client nhỏ giữ cookie giữa các request, giống trình duyệt. */
export function client(base) {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null), setCookie };
  };
}

export const validUser = (n = '') => ({
  username: `giaovien${n}`,
  password: 'matkhau123',
  confirmPassword: 'matkhau123',
  email: `gv${n}@truong.edu.vn`,
  phone: `09${String(12345678 + Number(n || 0)).padStart(8, '0')}`,
});
