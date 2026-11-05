import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '../generated/prisma/client.ts';

export type ClaimHandle = { id: string; organizationId: string; instanceName: string; providerMessageId: string; leaseOwner: string; leaseUntil: Date };
export type ClaimKey = { organizationId: string; instanceName: string; providerMessageId: string; receivedAt: Date };
export type FinancialEntity = 'PAYABLE' | 'PAYMENT' | 'EXPENSE';
export class InactiveWhatsAppInstance extends Error { constructor() { super('Instância WhatsApp inativa ou fora da organização'); } }
export class LostInboundLease extends Error { constructor() { super('Lease expirado ou pertencente a outro worker'); } }

/** Storage PostgreSQL compartilhado entre réplicas. Não conecta o webhook por si só. */
export class PostgresInboundClaims {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async claim(key: ClaimKey): Promise<ClaimHandle | null> {
    const active = await this.db.whatsAppInstance.findFirst({ where: { name: key.instanceName, organizationId: key.organizationId, active: true }, select: { name: true } });
    if (!active) throw new InactiveWhatsAppInstance();
    const owner = randomUUID();
    const rows = await this.db.$queryRaw<Array<{ id: string; leaseOwner: string; leaseUntil: Date }>>`
      INSERT INTO "InboundMessageClaim" ("id", "organizationId", "instanceName", "providerMessageId", "receivedAt", "state", "leaseOwner", "claimedAt", "leaseUntil", "attempts")
      VALUES (${randomUUID()}::uuid, ${key.organizationId}::uuid, ${key.instanceName}, ${key.providerMessageId}, ${key.receivedAt}, 'PROCESSING', ${owner}::uuid, statement_timestamp(), statement_timestamp() + INTERVAL '60 seconds', 1)
      ON CONFLICT ("organizationId", "instanceName", "providerMessageId")
      DO UPDATE SET "leaseOwner" = EXCLUDED."leaseOwner", "claimedAt" = statement_timestamp(),
        "leaseUntil" = statement_timestamp() + INTERVAL '60 seconds', "attempts" = "InboundMessageClaim"."attempts" + 1
      WHERE "InboundMessageClaim"."state" = 'PROCESSING' AND "InboundMessageClaim"."leaseUntil" <= statement_timestamp()
      RETURNING "id", "leaseOwner", "leaseUntil"`;
    const row = rows[0];
    return row ? { ...key, id: row.id, leaseOwner: row.leaseOwner, leaseUntil: row.leaseUntil } : null;
  }

  async renew(h: ClaimHandle): Promise<boolean> {
    const n = await this.db.$executeRaw`UPDATE "InboundMessageClaim" SET "leaseUntil" = statement_timestamp() + INTERVAL '60 seconds'
      WHERE "id"=${h.id}::uuid AND "organizationId"=${h.organizationId}::uuid AND "leaseOwner"=${h.leaseOwner}::uuid
      AND "state"='PROCESSING' AND "leaseUntil">statement_timestamp()`;
    return n === 1;
  }

  async complete(h: ClaimHandle): Promise<boolean> {
    const n = await this.db.$executeRaw`UPDATE "InboundMessageClaim"
      SET "state"='DONE', "completedAt"=statement_timestamp(), "expiresAt"=statement_timestamp() + INTERVAL '7 days'
      WHERE "id"=${h.id}::uuid AND "organizationId"=${h.organizationId}::uuid AND "leaseOwner"=${h.leaseOwner}::uuid
      AND "state"='PROCESSING' AND "leaseUntil">statement_timestamp()`;
    return n === 1;
  }

  async release(h: ClaimHandle): Promise<boolean> {
    const n = await this.db.$executeRaw`DELETE FROM "InboundMessageClaim" AS c
      WHERE c."id"=${h.id}::uuid AND c."organizationId"=${h.organizationId}::uuid AND c."leaseOwner"=${h.leaseOwner}::uuid
      AND c."state"='PROCESSING' AND c."leaseUntil">statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM "InboundFinancialEffect" AS e WHERE e."claimId"=c."id" AND e."organizationId"=c."organizationId")`;
    return n === 1;
  }

  async applyFinancialEffect(h: ClaimHandle, effectKey: string, entityType: FinancialEntity,
    write: (tx: Prisma.TransactionClient, entityId: string) => Promise<void>): Promise<{ entityId: string; repeated: boolean }> {
    if (!effectKey || effectKey.length > 200) throw new Error('effectKey inválida');
    try {
      return await this.db.$transaction(async tx => {
        const held = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT c."id" FROM "InboundMessageClaim" AS c
          JOIN "WhatsAppInstance" AS i ON i."name"=c."instanceName" AND i."organizationId"=c."organizationId"
          WHERE c."id"=${h.id}::uuid AND c."organizationId"=${h.organizationId}::uuid
            AND c."instanceName"=${h.instanceName} AND c."providerMessageId"=${h.providerMessageId}
            AND c."leaseOwner"=${h.leaseOwner}::uuid AND c."state"='PROCESSING'
            AND c."leaseUntil">statement_timestamp() AND i."active"=true FOR UPDATE OF c`;
        if (!held.length) throw new LostInboundLease();
        const existing = await tx.inboundFinancialEffect.findUnique({ where: { organizationId_effectKey: { organizationId: h.organizationId, effectKey } } });
        if (existing) {
          if (existing.entityType !== entityType) throw new Error('effectKey usada para outro tipo de efeito');
          return { entityId: existing.entityId, repeated: true };
        }
        const entityId = randomUUID();
        await tx.inboundFinancialEffect.create({ data: { organizationId: h.organizationId, claimId: h.id, effectKey, entityType, entityId } });
        await write(tx, entityId);
        return { entityId, repeated: false };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      // Uma corrida pelo UNIQUE pode encerrar com P2002/P2034; o caller deve obter novo claim e tentar novamente.
      throw error;
    }
  }

  async cleanupDone(): Promise<number> {
    return this.db.$executeRaw`WITH expired AS (
      SELECT c."id" FROM "InboundMessageClaim" AS c WHERE c."state"='DONE' AND c."expiresAt"<statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM "InboundFinancialEffect" AS e WHERE e."claimId"=c."id" AND e."organizationId"=c."organizationId")
      LIMIT 100 FOR UPDATE SKIP LOCKED
    ) DELETE FROM "InboundMessageClaim" AS c USING expired WHERE c."id"=expired."id"`;
  }
}
