-- REVIEW ONLY. Do not apply before explicit authorization.
-- Additive migration: no DROP, TRUNCATE, ALTER of existing tables, or data rewrite.

CREATE TYPE "InboundClaimState" AS ENUM ('PROCESSING', 'DONE');
CREATE TYPE "InboundFinancialEntity" AS ENUM ('PAYABLE', 'PAYMENT', 'EXPENSE');

CREATE TABLE "WhatsAppInstance" (
  "name" VARCHAR(120) NOT NULL,
  "organizationId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "WhatsAppInstance_pkey" PRIMARY KEY ("name"),
  CONSTRAINT "WhatsAppInstance_name_nonempty" CHECK (length(trim("name")) > 0)
);
CREATE UNIQUE INDEX "WhatsAppInstance_name_organizationId_key" ON "WhatsAppInstance" ("name", "organizationId");
CREATE INDEX "WhatsAppInstance_organizationId_active_idx" ON "WhatsAppInstance" ("organizationId", "active");
ALTER TABLE "WhatsAppInstance" ADD CONSTRAINT "WhatsAppInstance_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InboundMessageClaim" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "instanceName" VARCHAR(120) NOT NULL,
  "providerMessageId" VARCHAR(255) NOT NULL,
  "receivedAt" TIMESTAMPTZ(6) NOT NULL,
  "state" "InboundClaimState" NOT NULL DEFAULT 'PROCESSING',
  "leaseOwner" UUID NOT NULL,
  "claimedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "completedAt" TIMESTAMPTZ(6),
  "expiresAt" TIMESTAMPTZ(6),
  CONSTRAINT "InboundMessageClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboundMessageClaim_message_nonempty" CHECK (length(trim("providerMessageId")) > 0),
  CONSTRAINT "InboundMessageClaim_attempts_positive" CHECK ("attempts" >= 1),
  CONSTRAINT "InboundMessageClaim_lease_order" CHECK ("leaseUntil" > "claimedAt"),
  CONSTRAINT "InboundMessageClaim_state_shape" CHECK (
    ("state" = 'PROCESSING' AND "completedAt" IS NULL AND "expiresAt" IS NULL)
    OR ("state" = 'DONE' AND "completedAt" IS NOT NULL AND "expiresAt" IS NOT NULL
      AND "expiresAt" >= "completedAt" + INTERVAL '7 days')
  )
);
CREATE UNIQUE INDEX "InboundMessageClaim_id_organizationId_key" ON "InboundMessageClaim" ("id", "organizationId");
CREATE UNIQUE INDEX "InboundMessageClaim_organizationId_instanceName_providerMes_key"
  ON "InboundMessageClaim" ("organizationId", "instanceName", "providerMessageId");
CREATE INDEX "InboundMessageClaim_state_leaseUntil_idx" ON "InboundMessageClaim" ("state", "leaseUntil");
CREATE INDEX "InboundMessageClaim_state_expiresAt_idx" ON "InboundMessageClaim" ("state", "expiresAt");
ALTER TABLE "InboundMessageClaim" ADD CONSTRAINT "InboundMessageClaim_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundMessageClaim" ADD CONSTRAINT "InboundMessageClaim_instanceName_organizationId_fkey"
  FOREIGN KEY ("instanceName", "organizationId") REFERENCES "WhatsAppInstance"("name", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InboundFinancialEffect" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "claimId" UUID NOT NULL,
  "effectKey" VARCHAR(200) NOT NULL,
  "entityType" "InboundFinancialEntity" NOT NULL,
  "entityId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboundFinancialEffect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboundFinancialEffect_key_nonempty" CHECK (length(trim("effectKey")) > 0)
);
CREATE UNIQUE INDEX "InboundFinancialEffect_organizationId_effectKey_key"
  ON "InboundFinancialEffect" ("organizationId", "effectKey");
CREATE INDEX "InboundFinancialEffect_claimId_organizationId_idx" ON "InboundFinancialEffect" ("claimId", "organizationId");
CREATE INDEX "InboundFinancialEffect_organizationId_entityType_entityId_idx"
  ON "InboundFinancialEffect" ("organizationId", "entityType", "entityId");
ALTER TABLE "InboundFinancialEffect" ADD CONSTRAINT "InboundFinancialEffect_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundFinancialEffect" ADD CONSTRAINT "InboundFinancialEffect_claimId_organizationId_fkey"
  FOREIGN KEY ("claimId", "organizationId") REFERENCES "InboundMessageClaim"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
