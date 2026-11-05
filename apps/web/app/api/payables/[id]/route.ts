import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError, ApiError } from '@/src/api';
import { editPayable, cancelPayable } from '@/src/finance';
import { pendingPayableBalance } from '@financeiro/domain';
type C = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: C) { try {
  const a = await actor(); const { id } = await ctx.params; z.uuid().parse(id);
  const p = await prisma.payable.findFirst({ where: { id, organizationId: a.organizationId }, include: { supplier: true, payments: { where: { voidedAt: null }, orderBy: { paidAt: 'asc' } } } });
  if (!p) throw new ApiError(404, 'Conta não encontrada');
  const installments = p.installmentGroupId ? await prisma.payable.findMany({ where: { organizationId: a.organizationId, installmentGroupId: p.installmentGroupId }, select: { id: true, installmentNumber: true, dueDate: true, amountExpected: true, status: true, payments: { where: { voidedAt: null }, select: { amount: true } } }, orderBy: { installmentNumber: 'asc' } }) : [];
  return NextResponse.json({ id: p.id, description: p.description, supplier: p.supplier?.name ?? null, amountExpected: p.amountExpected.toFixed(2), balance: pendingPayableBalance(p.amountExpected.toFixed(2), p.payments.map(x => x.amount.toFixed(2))), dueDate: p.dueDate.toISOString().slice(0,10), status: p.status, plannedMethod: p.plannedMethod, notes: p.notes, installmentNumber: p.installmentNumber, installments: installments.map(x => ({ id: x.id, installmentNumber: x.installmentNumber, dueDate: x.dueDate.toISOString().slice(0,10), amountExpected: x.amountExpected.toFixed(2), balance: pendingPayableBalance(x.amountExpected.toFixed(2), x.payments.map(y => y.amount.toFixed(2))), status: x.status })), payments: p.payments.map(x => ({ id: x.id, amount: x.amount.toFixed(2), paidAt: x.paidAt.toISOString(), method: x.method, externalRef: x.externalRef, cashMovementId: x.cashMovementId })) });
} catch(e) { return responseError(e); } }
export async function PATCH(req: Request, ctx: C) { try { return NextResponse.json(await editPayable(await actor(true), (await ctx.params).id, await req.json())); } catch(e) { return responseError(e); } }
export async function DELETE(_req: Request, ctx: C) { try { return NextResponse.json(await cancelPayable(await actor(true), (await ctx.params).id)); } catch(e) { return responseError(e); } }
