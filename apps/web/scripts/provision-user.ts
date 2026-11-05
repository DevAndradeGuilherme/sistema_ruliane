import argon2 from 'argon2';
import { prisma } from '@financeiro/db';
import { z } from 'zod';

const input = z.object({
  organizationId: z.uuid(),
  name: z.string().trim().min(2),
  email: z.email(),
  password: z.string().min(12),
  role: z.enum(['FINANCEIRO', 'PROPRIETARIA']),
}).parse({ organizationId: process.env.PROVISION_ORGANIZATION_ID, name: process.env.PROVISION_NAME,
  email: process.env.PROVISION_EMAIL, password: process.env.PROVISION_PASSWORD, role: process.env.PROVISION_ROLE });
try {
  const organization = await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!organization) throw new Error('Organização não encontrada');
  const user = await prisma.user.create({ data: { organizationId: input.organizationId, name: input.name, loginEmail: input.email.toLowerCase(),
    passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }), role: input.role } });
  console.log(`Usuário provisionado: ${user.id}`);
} finally { await prisma.$disconnect(); }
