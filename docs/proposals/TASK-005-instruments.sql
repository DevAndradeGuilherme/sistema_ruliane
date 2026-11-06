-- CreateEnum
CREATE TYPE "PayableInstrumentKind" AS ENUM ('CHEQUE', 'BOLETO');

-- AlterTable
ALTER TABLE "PayablePayment" ADD COLUMN     "instrumentId" UUID;

-- CreateTable
CREATE TABLE "PayableInstrument" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "kind" "PayableInstrumentKind" NOT NULL,
    "bankName" VARCHAR(120),
    "accountReference" VARCHAR(120),
    "beneficiaryName" VARCHAR(200),
    "chequeNumber" VARCHAR(80),
    "issuedOn" DATE,
    "expectedClearingOn" DATE,
    "clearedAt" TIMESTAMPTZ(6),
    "boletoLine" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PayableInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayableInstrument_organizationId_payableId_kind_idx" ON "PayableInstrument"("organizationId", "payableId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PayableInstrument_id_payableId_organizationId_key" ON "PayableInstrument"("id", "payableId", "organizationId");

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_instrumentId_payableId_organizationId_fkey" FOREIGN KEY ("instrumentId", "payableId", "organizationId") REFERENCES "PayableInstrument"("id", "payableId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableInstrument" ADD CONSTRAINT "PayableInstrument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableInstrument" ADD CONSTRAINT "PayableInstrument_payableId_organizationId_fkey" FOREIGN KEY ("payableId", "organizationId") REFERENCES "Payable"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrição adicional revisável: metadados não se misturam entre cheque e boleto.
ALTER TABLE "PayableInstrument" ADD CONSTRAINT "PayableInstrument_kind_fields_check" CHECK (
  ("kind" = 'CHEQUE' AND "chequeNumber" IS NOT NULL AND length(trim("chequeNumber")) > 0 AND "boletoLine" IS NULL)
  OR ("kind" = 'BOLETO' AND "chequeNumber" IS NULL AND "issuedOn" IS NULL
      AND "expectedClearingOn" IS NULL AND "clearedAt" IS NULL)
);
