-- Bảng "BankTransaction" đã có từ 0_init (bản webhook cũ) — sửa lại cho khớp schema mới thay vì tạo mới.

-- Đổi trạng thái cũ sang bộ MATCHED | UNMATCHED | IGNORED | RESOLVED (RESOLVED phải đổi trước DISMISSED)
UPDATE "BankTransaction" SET "status" = 'MATCHED' WHERE "status" IN ('AUTO_APPROVED', 'RESOLVED');
UPDATE "BankTransaction" SET "status" = 'RESOLVED' WHERE "status" = 'DISMISSED';
UPDATE "BankTransaction" SET "status" = 'UNMATCHED' WHERE "status" IN ('NO_CODE', 'NOT_FOUND', 'AMOUNT_MISMATCH', 'NOT_PENDING');

-- AlterTable
ALTER TABLE "BankTransaction" DROP COLUMN "matchedCode",
ALTER COLUMN "provider" SET DEFAULT 'SEPAY',
ALTER COLUMN "content" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "BankTransaction_topUpId_idx" ON "BankTransaction"("topUpId");
