import { PrismaClient } from '@prisma/client';

// SQLite chỉ cho một transaction ghi tại một thời điểm; nhiều kết nối song song sẽ chờ khóa lẫn nhau
// tới khi timeout. Dùng đúng 1 kết nối để các transaction xếp hàng lần lượt. PostgreSQL không bị ảnh hưởng.
function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('file:') || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=1`;
}

export const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
