import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

const connectionString = process.env.TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : null;
if (target && (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || target.pathname !== '/financeiro')) {
  throw new Error('Teste integrado aceita somente banco financeiro em loopback');
}

test('integridade financeira e isolamento em transação com rollback', { skip: !connectionString }, async () => {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query('BEGIN');
  const q = (sql: string, values: unknown[] = []) => client.query(sql, values);
  async function rejects(sql: string, values: unknown[], code: string) {
    await q('SAVEPOINT expected_failure');
    let actual: string | undefined;
    try { await q(sql, values); }
    catch (error) { actual = (error as { code?: string }).code; }
    finally { await q('ROLLBACK TO SAVEPOINT expected_failure'); await q('RELEASE SAVEPOINT expected_failure'); }
    assert.equal(actual, code);
  }
  try {
    const a = randomUUID(), b = randomUUID();
    await q('INSERT INTO "Organization" (id,name,"updatedAt") VALUES ($1,$2,now()),($3,$4,now())', [a, 'Teste A', b, 'Teste B']);
    const supplierA = randomUUID();
    await q('INSERT INTO "Supplier" (id,"organizationId",name,"updatedAt") VALUES ($1,$2,$3,now())', [supplierA, a, 'Fornecedor teste']);
    await rejects('INSERT INTO "Payable" (id,"organizationId","supplierId",description,"amountExpected","dueDate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())',
      [randomUUID(), b, supplierA, 'Vínculo cruzado', '1.00', '2026-11-05'], '23503');

    const payable = randomUUID();
    await q('INSERT INTO "Payable" (id,"organizationId",description,"amountExpected","dueDate","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
      [payable, a, 'Conta teste', '100.00', '2026-11-05']);
    await rejects('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method) VALUES ($1,$2,$3,$4,now(),$5)',
      [randomUUID(), b, payable, '1.00', 'PIX'], '23503');
    await q('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method,"idempotencyKey") VALUES ($1,$2,$3,$4,now(),$5,$6)',
      [randomUUID(), a, payable, '60.00', 'PIX', 'pagamento-1']);
    await rejects('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method,"idempotencyKey") VALUES ($1,$2,$3,$4,now(),$5,$6)',
      [randomUUID(), a, payable, '40.00', 'PIX', 'pagamento-1'], '23505');
    await q('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method,"idempotencyKey") VALUES ($1,$2,$3,$4,now(),$5,$6)',
      [randomUUID(), a, payable, '40.00', 'PIX', 'pagamento-2']);
    await rejects('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method) VALUES ($1,$2,$3,$4,now(),$5)',
      [randomUUID(), a, payable, '0.01', 'PIX'], '23514');

    const hash = 'a'.repeat(64), documentA = randomUUID(), documentB = randomUUID();
    await q('INSERT INTO "Document" (id,"organizationId",kind,filename,"mimeType",sha256,"storageKey") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [documentA, a, 'FECHAMENTO_CAIXA', 'teste-a.pdf', 'application/pdf', hash, `test/${documentA}`]);
    await q('INSERT INTO "Document" (id,"organizationId",kind,filename,"mimeType",sha256,"storageKey") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [documentB, b, 'FECHAMENTO_CAIXA', 'teste-b.pdf', 'application/pdf', hash, `test/${documentB}`]);
    await rejects('INSERT INTO "Document" (id,"organizationId",kind,filename,"mimeType",sha256,"storageKey") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), a, 'FECHAMENTO_CAIXA', 'reenvio.pdf', 'application/pdf', hash, `test/${randomUUID()}`], '23505');
    const closure = randomUUID();
    await q('INSERT INTO "CashClosure" (id,"organizationId","documentId","closureNumber",terminal,"businessDate","closedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
      [closure, a, documentA, 'N1', 'T1', '2026-11-05']);
    const another = randomUUID();
    await q('INSERT INTO "Document" (id,"organizationId",kind,filename,"mimeType",sha256,"storageKey") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [another, a, 'FECHAMENTO_CAIXA', 'outra-versao.pdf', 'application/pdf', 'b'.repeat(64), `test/${another}`]);
    await rejects('INSERT INTO "CashClosure" (id,"organizationId","documentId","closureNumber",terminal,"businessDate","closedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
      [randomUUID(), b, another, 'N2', 'T1', '2026-11-05'], '23503');
    await rejects('INSERT INTO "CashClosure" (id,"organizationId","documentId","closureNumber",terminal,"businessDate","closedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())',
      [randomUUID(), a, another, 'N1', 'T1', '2026-11-05'], '23505');

    const movement = randomUUID();
    await q('INSERT INTO "CashMovement" (id,"organizationId","closureId",kind,"sourceOrdinal","descriptionRaw",amount) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [movement, a, closure, 'SANGRIA', 1, 'Pagamento teste', '10.00']);
    await rejects('INSERT INTO "CashMovement" (id,"organizationId","closureId",kind,"sourceOrdinal","descriptionRaw",amount) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), a, closure, 'SANGRIA', 1, 'Reimportação', '10.00'], '23505');
    const payableCash = randomUUID(), paymentCash = randomUUID();
    await q('INSERT INTO "Payable" (id,"organizationId",description,"amountExpected","dueDate","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
      [payableCash, a, 'Conta em dinheiro', '10.00', '2026-11-05']);
    await q('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method,"cashMovementId") VALUES ($1,$2,$3,$4,now(),$5,$6)',
      [paymentCash, a, payableCash, '10.00', 'DINHEIRO', movement]);
    await rejects('INSERT INTO "Expense" (id,"organizationId",description,amount,"occurredAt",origin,"cashMovementId") VALUES ($1,$2,$3,$4,now(),$5,$6)',
      [randomUUID(), a, 'Duplicada', '10.00', 'SANGRIA', movement], '23514');
    await q('INSERT INTO "Expense" (id,"organizationId",description,amount,"occurredAt",origin,"paymentId") VALUES ($1,$2,$3,$4,now(),$5,$6)',
      [randomUUID(), a, 'Despesa da conta', '10.00', 'PAGAMENTO_CONTA', paymentCash]);
    await rejects('INSERT INTO "Expense" (id,"organizationId",description,amount,"occurredAt",origin,"paymentId") VALUES ($1,$2,$3,$4,now(),$5,$6)',
      [randomUUID(), a, 'Duplicada por pagamento', '10.00', 'PAGAMENTO_CONTA', paymentCash], '23505');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('pagamentos concorrentes não ultrapassam o saldo', { skip: !connectionString }, async () => {
  const admin = new pg.Client({ connectionString });
  const first = new pg.Client({ connectionString });
  const second = new pg.Client({ connectionString });
  const organizationId = randomUUID(), payableId = randomUUID();
  await Promise.all([admin.connect(), first.connect(), second.connect()]);
  try {
    await admin.query('INSERT INTO "Organization" (id,name,"updatedAt") VALUES ($1,$2,now())', [organizationId, 'Teste concorrência']);
    await admin.query('INSERT INTO "Payable" (id,"organizationId",description,"amountExpected","dueDate","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
      [payableId, organizationId, 'Conta concorrente', '100.00', '2026-11-05']);
    await first.query('BEGIN');
    await second.query('BEGIN');
    await first.query('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method) VALUES ($1,$2,$3,$4,now(),$5)',
      [randomUUID(), organizationId, payableId, '60.00', 'PIX']);
    const competing = second.query('INSERT INTO "PayablePayment" (id,"organizationId","payableId",amount,"paidAt",method) VALUES ($1,$2,$3,$4,now(),$5)',
      [randomUUID(), organizationId, payableId, '60.00', 'PIX']);
    await first.query('COMMIT');
    await assert.rejects(competing, (error: unknown) => (error as { code?: string }).code === '23514');
  } finally {
    await first.query('ROLLBACK').catch(() => undefined);
    await second.query('ROLLBACK').catch(() => undefined);
    await admin.query('DELETE FROM "PayablePayment" WHERE "payableId"=$1', [payableId]);
    await admin.query('DELETE FROM "Payable" WHERE id=$1', [payableId]);
    await admin.query('DELETE FROM "Organization" WHERE id=$1', [organizationId]);
    await Promise.all([admin.end(), first.end(), second.end()]);
  }
});
