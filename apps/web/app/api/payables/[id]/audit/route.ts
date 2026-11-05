import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError, ApiError } from '@/src/api';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) { try { const a = await actor(); const id = z.uuid().parse((await ctx.params).id); const exists = await prisma.payable.count({ where: { id, organizationId: a.organizationId } }); if (!exists) throw new ApiError(404, 'Conta não encontrada'); const items = await prisma.auditLog.findMany({ where: { organizationId: a.organizationId, entityName: 'Payable', entityId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, actorUserId: true, channel: true, before: true, after: true, createdAt: true } }); return NextResponse.json({ items }); } catch(e) { return responseError(e); } }
