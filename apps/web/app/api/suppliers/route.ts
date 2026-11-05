import { NextResponse } from 'next/server';
import { prisma } from '@financeiro/db';
import { z } from 'zod';
import { actor, responseError } from '@/src/api';
const input = z.object({ name: z.string().trim().min(2).max(200), taxId: z.string().trim().max(30).optional() });
export async function GET() { try { const a = await actor(); return NextResponse.json({ items: await prisma.supplier.findMany({ where: { organizationId: a.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 }) }); } catch(e) { return responseError(e); } }
export async function POST(req: Request) { try { const a = await actor(true); const x = input.parse(await req.json()); return NextResponse.json(await prisma.$transaction(async tx => { const s = await tx.supplier.create({ data: { ...x, organizationId: a.organizationId } }); await tx.auditLog.create({ data: { organizationId: a.organizationId, actorUserId: a.id, action: 'CREATE', entityName: 'Supplier', entityId: s.id, after: x, channel: 'WEB' } }); return { id: s.id, name: s.name }; }), { status: 201 }); } catch(e) { return responseError(e); } }
