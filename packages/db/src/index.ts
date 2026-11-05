import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

const globalDb = globalThis as typeof globalThis & { financeiroPrisma?: PrismaClient };
export const prisma = globalDb.financeiroPrisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});
if (process.env.NODE_ENV !== 'production') globalDb.financeiroPrisma = prisma;
export { Prisma } from '../generated/prisma/client.ts';
