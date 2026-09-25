// Sinh prisma/postgres/schema.prisma từ prisma/schema.prisma (SQLite), chỉ đổi provider.
//   npm run db:pg:schema
// Dev và test vẫn dùng SQLite; bản triển khai (Render + Neon) dùng file sinh ra này cùng migrations/ riêng cho PostgreSQL.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = new URL('../prisma/schema.prisma', import.meta.url);
const outDir = new URL('../prisma/postgres/', import.meta.url);

const schema = readFileSync(src, 'utf8');
const pg = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
if (pg === schema) throw new Error('Không tìm thấy provider = "sqlite" trong prisma/schema.prisma.');

mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL('schema.prisma', outDir),
  `// FILE SINH TỰ ĐỘNG bởi scripts/pg-schema.js — đừng sửa tay, hãy sửa prisma/schema.prisma.\n${pg}`,
);
console.log('• Đã ghi prisma/postgres/schema.prisma');
