import { auth } from './auth.ts';
import { prisma } from '@financeiro/db';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, type Actor } from './errors.ts';
export { ApiError } from './errors.ts';

export async function actor(write = false): Promise<Actor> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new ApiError(401, 'Autenticação necessária');
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, organizationId: true, role: true, active: true } });
  if (!user?.active || user.organizationId !== session.user.organizationId) throw new ApiError(401, 'Sessão inválida');
  if (write && user.role !== 'FINANCEIRO') throw new ApiError(403, 'Acesso somente leitura');
  return user;
}
export function responseError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: 'Entrada inválida', issues: error.issues }, { status: 400 });
  console.error('API failure', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
}
