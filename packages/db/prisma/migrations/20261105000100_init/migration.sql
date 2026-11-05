-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FINANCEIRO', 'PROPRIETARIA');

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('WEB', 'WHATSAPP', 'IMPORTACAO');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('ABERTA', 'PARCIALMENTE_PAGA', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('A_DEFINIR', 'BOLETO', 'CHEQUE', 'PIX', 'TRANSFERENCIA', 'DINHEIRO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('FECHAMENTO_CAIXA', 'COMPROVANTE', 'BOLETO', 'CHEQUE', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDENTE', 'PROCESSANDO', 'PROCESSADO', 'PENDENTE_REVISAO', 'ERRO');

-- CreateEnum
CREATE TYPE "CashClosureReviewStatus" AS ENUM ('PROCESSADO', 'PENDENTE_REVISAO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "ClosureLineSection" AS ENUM ('SUMMARY', 'CASH_ENTRIES', 'CASH_EXITS', 'OTHER_ENTRIES', 'SMARTTEF');

-- CreateEnum
CREATE TYPE "CashMethod" AS ENUM ('DINHEIRO', 'CREDITO', 'DEBITO', 'VENCIMENTO', 'BOLETO', 'TRANSF_PIX', 'VOUCHER', 'OUTRO');

-- CreateEnum
CREATE TYPE "CashMovementKind" AS ENUM ('SANGRIA', 'SUPRIMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "CashClassification" AS ENUM ('DESPESA_OPERACIONAL', 'DEVOLUCAO_CLIENTE', 'ADIANTAMENTO', 'RETIRADA_INTERNA', 'OUTROS', 'NAO_CLASSIFICADA');

-- CreateEnum
CREATE TYPE "ExpenseOrigin" AS ENUM ('SANGRIA', 'PAGAMENTO_CONTA', 'MANUAL');

-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'FALHOU');

-- CreateEnum
CREATE TYPE "ReviewSeverity" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "whatsappJid" TEXT,
    "loginEmail" TEXT,
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentGroup" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID,
    "categoryId" UUID,
    "installmentGroupId" UUID,
    "installmentNumber" INTEGER,
    "description" TEXT NOT NULL,
    "amountExpected" DECIMAL(14,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'ABERTA',
    "plannedMethod" "PaymentMethod" NOT NULL DEFAULT 'A_DEFINIR',
    "notes" TEXT,
    "sourceChannel" "SourceChannel" NOT NULL DEFAULT 'WEB',
    "createdById" UUID,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayablePayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "externalRef" TEXT,
    "idempotencyKey" TEXT,
    "recordedById" UUID,
    "cashMovementId" UUID,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDENTE',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "parserVersion" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "payload" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashClosure" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "closureNumber" TEXT NOT NULL,
    "terminal" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "operatorCode" TEXT,
    "operatorName" TEXT,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3) NOT NULL,
    "statusRaw" TEXT,
    "reportedCloseTotal" DECIMAL(14,2),
    "calculatedReportTotal" DECIMAL(14,2),
    "reportedVariance" DECIMAL(14,2),
    "calculatedVariance" DECIMAL(14,2),
    "reportedCashNet" DECIMAL(14,2),
    "rawReportText" TEXT,
    "reviewStatus" "CashClosureReviewStatus" NOT NULL DEFAULT 'PENDENTE_REVISAO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashClosureLine" (
    "id" UUID NOT NULL,
    "closureId" UUID NOT NULL,
    "section" "ClosureLineSection" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "labelRaw" TEXT NOT NULL,
    "methodNormalized" "CashMethod",
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CashClosureLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "closureId" UUID NOT NULL,
    "kind" "CashMovementKind" NOT NULL,
    "sourceOrdinal" INTEGER NOT NULL,
    "descriptionRaw" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "classification" "CashClassification" NOT NULL DEFAULT 'NAO_CLASSIFICADA',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID,
    "categoryId" UUID,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "origin" "ExpenseOrigin" NOT NULL,
    "paymentId" UUID,
    "cashMovementId" UUID,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewIssue" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recordType" TEXT,
    "recordId" TEXT,
    "closureId" UUID,
    "code" TEXT NOT NULL,
    "severity" "ReviewSeverity" NOT NULL,
    "expected" TEXT,
    "observed" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "instanceName" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "direction" "WhatsAppDirection" NOT NULL,
    "senderJid" TEXT NOT NULL,
    "deliveryStatus" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "channel" "SourceChannel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_loginEmail_key" ON "User"("loginEmail");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_organizationId_key" ON "User"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_whatsappJid_key" ON "User"("organizationId", "whatsappJid");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_name_idx" ON "Supplier"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_id_organizationId_key" ON "Supplier"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_id_organizationId_key" ON "ExpenseCategory"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_name_key" ON "ExpenseCategory"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentGroup_id_organizationId_key" ON "InstallmentGroup"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Payable_organizationId_dueDate_status_idx" ON "Payable"("organizationId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "Payable_organizationId_supplierId_idx" ON "Payable"("organizationId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Payable_id_organizationId_key" ON "Payable"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PayablePayment_cashMovementId_key" ON "PayablePayment"("cashMovementId");

-- CreateIndex
CREATE INDEX "PayablePayment_payableId_paidAt_idx" ON "PayablePayment"("payableId", "paidAt");

-- CreateIndex
CREATE INDEX "PayablePayment_organizationId_paidAt_idx" ON "PayablePayment"("organizationId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayablePayment_cashMovementId_organizationId_key" ON "PayablePayment"("cashMovementId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PayablePayment_id_organizationId_key" ON "PayablePayment"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PayablePayment_organizationId_idempotencyKey_key" ON "PayablePayment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_sha256_key" ON "Document"("organizationId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Document_id_organizationId_key" ON "Document"("id", "organizationId");

-- CreateIndex
CREATE INDEX "ImportJob_documentId_createdAt_idx" ON "ImportJob"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosure_documentId_key" ON "CashClosure"("documentId");

-- CreateIndex
CREATE INDEX "CashClosure_organizationId_closedAt_idx" ON "CashClosure"("organizationId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosure_documentId_organizationId_key" ON "CashClosure"("documentId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosure_organizationId_closureNumber_terminal_businessD_key" ON "CashClosure"("organizationId", "closureNumber", "terminal", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosure_id_organizationId_key" ON "CashClosure"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosureLine_closureId_section_ordinal_key" ON "CashClosureLine"("closureId", "section", "ordinal");

-- CreateIndex
CREATE INDEX "CashMovement_closureId_classification_idx" ON "CashMovement"("closureId", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_id_organizationId_key" ON "CashMovement"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_closureId_kind_sourceOrdinal_key" ON "CashMovement"("closureId", "kind", "sourceOrdinal");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_paymentId_key" ON "Expense"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_cashMovementId_key" ON "Expense"("cashMovementId");

-- CreateIndex
CREATE INDEX "Expense_organizationId_occurredAt_idx" ON "Expense"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_paymentId_organizationId_key" ON "Expense"("paymentId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_cashMovementId_organizationId_key" ON "Expense"("cashMovementId", "organizationId");

-- CreateIndex
CREATE INDEX "ReviewIssue_closureId_code_idx" ON "ReviewIssue"("closureId", "code");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_receivedAt_idx" ON "WhatsAppMessage"("organizationId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_instanceName_providerMessageId_key" ON "WhatsAppMessage"("instanceName", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationKey_key" ON "NotificationDelivery"("notificationKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_organizationId_dueDate_idx" ON "NotificationDelivery"("organizationId", "dueDate");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentGroup" ADD CONSTRAINT "InstallmentGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_supplierId_organizationId_fkey" FOREIGN KEY ("supplierId", "organizationId") REFERENCES "Supplier"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "ExpenseCategory"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_installmentGroupId_organizationId_fkey" FOREIGN KEY ("installmentGroupId", "organizationId") REFERENCES "InstallmentGroup"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_createdById_organizationId_fkey" FOREIGN KEY ("createdById", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_payableId_organizationId_fkey" FOREIGN KEY ("payableId", "organizationId") REFERENCES "Payable"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_recordedById_organizationId_fkey" FOREIGN KEY ("recordedById", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_cashMovementId_organizationId_fkey" FOREIGN KEY ("cashMovementId", "organizationId") REFERENCES "CashMovement"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosure" ADD CONSTRAINT "CashClosure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosure" ADD CONSTRAINT "CashClosure_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosureLine" ADD CONSTRAINT "CashClosureLine_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "CashClosure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_closureId_organizationId_fkey" FOREIGN KEY ("closureId", "organizationId") REFERENCES "CashClosure"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_organizationId_fkey" FOREIGN KEY ("supplierId", "organizationId") REFERENCES "Supplier"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "ExpenseCategory"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentId_organizationId_fkey" FOREIGN KEY ("paymentId", "organizationId") REFERENCES "PayablePayment"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashMovementId_organizationId_fkey" FOREIGN KEY ("cashMovementId", "organizationId") REFERENCES "CashMovement"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewIssue" ADD CONSTRAINT "ReviewIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewIssue" ADD CONSTRAINT "ReviewIssue_closureId_organizationId_fkey" FOREIGN KEY ("closureId", "organizationId") REFERENCES "CashClosure"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientUserId_organizationId_fkey" FOREIGN KEY ("recipientUserId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_organizationId_fkey" FOREIGN KEY ("actorUserId", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants not expressible in Prisma schema.
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_amountExpected_positive" CHECK ("amountExpected" > 0);
ALTER TABLE "Document" ADD CONSTRAINT "Document_sha256_format" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sourceOrdinal_positive" CHECK ("sourceOrdinal" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_source_consistent" CHECK (
  ("origin" = 'PAGAMENTO_CONTA' AND "paymentId" IS NOT NULL AND "cashMovementId" IS NULL)
  OR ("origin" = 'SANGRIA' AND "cashMovementId" IS NOT NULL AND "paymentId" IS NULL)
  OR ("origin" = 'MANUAL' AND "cashMovementId" IS NULL AND "paymentId" IS NULL)
);

-- Serialize payments on the payable row, including retries and concurrent partial payments.
CREATE FUNCTION enforce_payable_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected numeric(14,2);
DECLARE paid numeric(14,2);
BEGIN
  SELECT "amountExpected" INTO expected FROM "Payable" WHERE id = NEW."payableId" FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM "PayablePayment"
    WHERE "payableId" = NEW."payableId" AND "voidedAt" IS NULL AND id <> NEW.id;
  IF NEW."voidedAt" IS NULL THEN paid := paid + NEW.amount; END IF;
  IF paid > expected THEN RAISE EXCEPTION 'Payments exceed payable amount' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payable_payment_balance BEFORE INSERT OR UPDATE OF "payableId", amount, "voidedAt" ON "PayablePayment"
  FOR EACH ROW EXECUTE FUNCTION enforce_payable_balance();

CREATE FUNCTION enforce_payable_amount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COALESCE(SUM(amount), 0) FROM "PayablePayment"
      WHERE "payableId" = NEW.id AND "voidedAt" IS NULL) > NEW."amountExpected" THEN
    RAISE EXCEPTION 'Payable amount below paid total' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payable_amount_balance BEFORE UPDATE OF "amountExpected" ON "Payable"
  FOR EACH ROW EXECUTE FUNCTION enforce_payable_amount();

-- A sangria can fund one payable payment or one direct expense, never both.
CREATE FUNCTION enforce_movement_use() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement_id uuid;
DECLARE movement_amount numeric(14,2);
BEGIN
  movement_id := NEW."cashMovementId";
  IF movement_id IS NULL THEN RETURN NEW; END IF;
  SELECT amount INTO movement_amount FROM "CashMovement" WHERE id = movement_id AND kind = 'SANGRIA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment/expense movement must be sangria' USING ERRCODE = '23514'; END IF;
  IF movement_amount <> NEW.amount THEN RAISE EXCEPTION 'Sangria and payment/expense amounts differ' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'Expense' THEN
    IF EXISTS (SELECT 1 FROM "PayablePayment" WHERE "cashMovementId" = movement_id) THEN
      RAISE EXCEPTION 'Sangria already linked to payment' USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "Expense" WHERE "cashMovementId" = movement_id) THEN
    RAISE EXCEPTION 'Sangria already linked to expense' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_movement_use BEFORE INSERT OR UPDATE OF "cashMovementId", amount ON "PayablePayment"
  FOR EACH ROW EXECUTE FUNCTION enforce_movement_use();
CREATE TRIGGER expense_movement_use BEFORE INSERT OR UPDATE OF "cashMovementId", amount ON "Expense"
  FOR EACH ROW EXECUTE FUNCTION enforce_movement_use();

CREATE FUNCTION enforce_sangria_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind <> 'SANGRIA' AND (
    EXISTS (SELECT 1 FROM "PayablePayment" WHERE "cashMovementId" = NEW.id)
    OR EXISTS (SELECT 1 FROM "Expense" WHERE "cashMovementId" = NEW.id)
  ) THEN RAISE EXCEPTION 'Linked movement must remain sangria' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM "PayablePayment" WHERE "cashMovementId" = NEW.id AND amount <> NEW.amount)
    OR EXISTS (SELECT 1 FROM "Expense" WHERE "cashMovementId" = NEW.id AND amount <> NEW.amount) THEN
    RAISE EXCEPTION 'Linked sangria amount cannot differ' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER movement_kind_guard BEFORE UPDATE OF kind, amount ON "CashMovement"
  FOR EACH ROW EXECUTE FUNCTION enforce_sangria_kind();
