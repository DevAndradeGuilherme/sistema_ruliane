import { NextResponse } from 'next/server';
import { actor, responseError } from '@/src/api';
import { classifySangria } from '@/src/finance';
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) { try { return NextResponse.json(await classifySangria(await actor(true), (await ctx.params).id, await req.json())); } catch(e) { return responseError(e); } }
