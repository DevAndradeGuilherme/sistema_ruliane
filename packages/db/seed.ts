import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

const url = process.env.DATABASE_URL;
const id = process.env.DEV_ORGANIZATION_ID;
const name = process.env.DEV_ORGANIZATION_NAME?.trim();

if (process.env.NODE_ENV === 'production' || process.env.DEV_SEED_CONFIRM !== 'local-disposable') {
  throw new Error('Seed exige DEV_SEED_CONFIRM=local-disposable e ambiente não produtivo');
}
if (!url || !id || !name || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  throw new Error('Informe DATABASE_URL, DEV_ORGANIZATION_ID (UUID) e DEV_ORGANIZATION_NAME');
}
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('Seed DEV aceita somente banco em loopback');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (existing && existing.name !== name) {
    throw new Error('Organização existente com outro nome; seed não altera dados');
  }
  if (!existing) await prisma.organization.create({ data: { id, name } });
  console.info(existing ? 'Organização DEV já existe' : 'Organização DEV criada');
} finally {
  await prisma.$disconnect();
}
