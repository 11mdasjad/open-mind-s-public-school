-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billingPeriod" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "generationKey" TEXT,
ADD COLUMN     "issueStatus" TEXT NOT NULL DEFAULT 'Issued',
ADD COLUMN     "items" JSONB,
ADD COLUMN     "originalAmount" INTEGER,
ADD COLUMN     "snapshot" JSONB;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "collectionId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "FeeVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "draftStudentId" TEXT,
    "profileKey" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeCollection" (
    "id" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reference" TEXT,
    "studentId" TEXT,
    "draftStudentId" TEXT,
    "session" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "details" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAdjustment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeInstallment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeGenerationBatch" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeGenerationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeVersion_kind_session_effectiveDate_idx" ON "FeeVersion"("kind", "session", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "FeeVersion_key_session_version_key" ON "FeeVersion"("key", "session", "version");

-- CreateIndex
CREATE INDEX "BillingAssignment_profileKey_session_effectiveDate_idx" ON "BillingAssignment"("profileKey", "session", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "FeeCollection_receipt_key" ON "FeeCollection"("receipt");

-- CreateIndex
CREATE UNIQUE INDEX "FeeCollection_idempotencyKey_key" ON "FeeCollection"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeeCollection_reference_key" ON "FeeCollection"("reference");

-- CreateIndex
CREATE INDEX "FeeCollection_studentId_session_status_idx" ON "FeeCollection"("studentId", "session", "status");

-- CreateIndex
CREATE INDEX "FeeCollection_draftStudentId_session_status_idx" ON "FeeCollection"("draftStudentId", "session", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FeeAdjustment_sourceKey_key" ON "FeeAdjustment"("sourceKey");

-- CreateIndex
CREATE INDEX "FeeAdjustment_invoiceId_createdAt_idx" ON "FeeAdjustment"("invoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeeInstallment_invoiceId_number_key" ON "FeeInstallment"("invoiceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "FeeGenerationBatch_requestKey_key" ON "FeeGenerationBatch"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_generationKey_key" ON "Invoice"("generationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "FeeCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeVersion" ADD CONSTRAINT "FeeVersion_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAssignment" ADD CONSTRAINT "BillingAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAssignment" ADD CONSTRAINT "BillingAssignment_draftStudentId_fkey" FOREIGN KEY ("draftStudentId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeCollection" ADD CONSTRAINT "FeeCollection_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeCollection" ADD CONSTRAINT "FeeCollection_draftStudentId_fkey" FOREIGN KEY ("draftStudentId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeCollection" ADD CONSTRAINT "FeeCollection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeInstallment" ADD CONSTRAINT "FeeInstallment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve historical net demand and import existing concession history.
UPDATE "Invoice" SET "originalAmount" = "amount";
INSERT INTO "FeeAdjustment" ("id","invoiceId","kind","amount","reason","actorId","createdAt")
SELECT 'legacy-' || e."id", i."id", 'Discount', -(e."data"->>'amount')::integer,
COALESCE(e."data"->>'reason','Legacy concession'), COALESCE(e."userId",'legacy'), e."createdAt"
FROM "Entry" e JOIN "Invoice" i ON i."id" = e."data"->>'invoiceId'
WHERE e."module"='feeConcessions' AND (e."data"->>'amount') ~ '^[0-9]+$';
UPDATE "Invoice" i SET "originalAmount" = i."amount" - COALESCE((SELECT SUM(a."amount") FROM "FeeAdjustment" a WHERE a."invoiceId"=i."id"),0);
ALTER TABLE "BillingAssignment" ADD CONSTRAINT "BillingAssignment_owner_check" CHECK (("studentId" IS NULL) <> ("draftStudentId" IS NULL));
ALTER TABLE "FeeCollection" ADD CONSTRAINT "FeeCollection_owner_check" CHECK (("studentId" IS NULL) <> ("draftStudentId" IS NULL));
ALTER TABLE "FeeCollection" ADD CONSTRAINT "FeeCollection_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "FeeInstallment" ADD CONSTRAINT "FeeInstallment_positive_amount" CHECK ("amount" > 0);
