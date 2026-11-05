import argon2 from 'argon2';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
const credentials = z.object({ email: z.email(), password: z.string().min(1) });
export async function verifyCredentials(raw: unknown) {
  const parsed = credentials.safeParse(raw);
  if (!parsed.success) return null;
  const user = await prisma.user.findUnique({ where: { loginEmail: parsed.data.email.toLowerCase() } });
  if (!user?.active || !user.passwordHash || !await argon2.verify(user.passwordHash, parsed.data.password)) return null;
  return { id: user.id, name: user.name, email: user.loginEmail, organizationId: user.organizationId, role: user.role };
}
