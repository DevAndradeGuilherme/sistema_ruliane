import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError, ApiError } from '@/src/api';
import { editPayable, cancelPayable } from '@/src/finance';
type C = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: C) { try {
  const a = await actor(); const { id } = await ctx.params; z.uuid().parse(id);
  const p = await prisma.payable.findFirst({ where: { id, organizationId: a.organizationId }, include: { supplier: true, payments: { where: { voidedAt: null }, orderBy: { paidAt: 'asc' } } } });
  if (!p) throw new ApiError(404, 'Conta não encontrada');
  return NextResponse.json({ id: p.id, description: p.description, supplier: p.supplier?.name ?? null, amountExpected: p.amountExpected.toFixed(2), dueDate: p.dueDate.toISOString().slice(0,10), status: p.status, plannedMethod: p.plannedMethod, notes: p.notes, installmentNumber: p.installmentNumber, payments: p.payments.map(x => ({ id: x.id, amount: x.amount.toFixed(2), paidAt: x.paidAt.toISOString(), method: x.method, externalRef: x.externalRef, cashMovementId: x.cashMovementId })) });
} catch(e) { return responseError(e); } }
export async function PATCH(req: Request, ctx: C) { try { return NextResponse.json(await editPayable(await actor(true), (await ctx.params).id, await req.json())); } catch(e) { return responseError(e); } }
export async function DELETE(_req: Request, ctx: C) { try { return NextResponse.json(await cancelPayable(await actor(true), (await ctx.params).id)); } catch(e) { return responseError(e); } }
