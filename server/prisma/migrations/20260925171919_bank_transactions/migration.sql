-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "providerTxId" TEXT NOT NULL,
    "gateway" TEXT,
    "accountNumber" TEXT,
    "amountVnd" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "referenceCode" TEXT,
    "transactionDate" TEXT,
    "matchedCode" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "topUpId" INTEGER,
    "resolvedById" INTEGER,
    "resolvedAt" DATETIME,
    "raw" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransaction_topUpId_fkey" FOREIGN KEY ("topUpId") REFERENCES "TopUpRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BankTransaction_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BankTransaction_status_createdAt_idx" ON "BankTransaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_provider_providerTxId_key" ON "BankTransaction"("provider", "providerTxId");
