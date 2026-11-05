import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@financeiro/db';
import { actor, responseError } from '@/src/api';
import { createPayable } from '@/src/finance';
import { pendingPayableBalance } from '@financeiro/domain';
const filters = z.object({ status: z.enum(['ABERTA','PARCIALMENTE_PAGA','PAGA','CANCELADA']).optional(), supplier: z.string().max(100).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), page: z.coerce.number().int().min(1).default(1) });
export async function GET(req: Request) { try {
  const a = await actor(); const f = filters.parse(Object.fromEntries(new URL(req.url).searchParams));
  const where = { organizationId: a.organizationId, status: f.status, supplier: f.supplier ? { name: { contains: f.supplier, mode: 'insensitive' as const } } : undefined,
    dueDate: f.from || f.to ? { gte: f.from ? new Date(`${f.from}T00:00:00Z`) : undefined, lte: f.to ? new Date(`${f.to}T00:00:00Z`) : undefined } : undefined };
  const [items, total] = await prisma.$transaction([prisma.payable.findMany({ where, include: { supplier: true, payments: { where: { voidedAt: null } } }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], skip: (f.page - 1) * 50, take: 50 }), prisma.payable.count({ where })]);
  return NextResponse.json({ items: items.map(p => ({ id: p.id, description: p.description, supplier: p.supplier?.name ?? null, dueDate: p.dueDate.toISOString().slice(0,10), amountExpected: p.amountExpected.toFixed(2), balance: pendingPayableBalance(p.amountExpected.toFixed(2), p.payments.map(x => x.amount.toFixed(2))), status: p.status, installmentNumber: p.installmentNumber })), total, page: f.page, pageSize: 50 });
} catch(e) { return responseError(e); } }
export async function POST(req: Request) { try { const a = await actor(true); return NextResponse.json(await createPayable(a, await req.json()), { status: 201 }); } catch(e) { return responseError(e); } }
