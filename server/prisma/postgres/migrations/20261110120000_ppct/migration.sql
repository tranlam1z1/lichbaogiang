-- CreateTable
CREATE TABLE "Ppct" (
    "grade" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ppct_pkey" PRIMARY KEY ("grade")
);
