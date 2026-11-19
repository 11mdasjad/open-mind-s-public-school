ALTER TABLE "Invoice" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "draftStudentId" TEXT;
CREATE INDEX "Invoice_draftStudentId_idx" ON "Invoice"("draftStudentId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_draftStudentId_fkey" FOREIGN KEY ("draftStudentId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_student_owner_check" CHECK (("studentId" IS NOT NULL) <> ("draftStudentId" IS NOT NULL));
