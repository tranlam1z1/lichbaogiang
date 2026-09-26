-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SEPAY',
    "providerTxId" TEXT NOT NULL,
    "gateway" TEXT,
    "accountNumber" TEXT,
    "amountVnd" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "referenceCode" TEXT,
    "transactionDate" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "topUpId" INTEGER,
    "resolvedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "raw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankTransaction_status_createdAt_idx" ON "BankTransaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BankTransaction_topUpId_idx" ON "BankTransaction"("topUpId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_provider_providerTxId_key" ON "BankTransaction"("provider", "providerTxId");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_topUpId_fkey" FOREIGN KEY ("topUpId") REFERENCES "TopUpRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

