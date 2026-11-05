import { NextResponse } from 'next/server';
import { actor, responseError } from '@/src/api';
import { recordPayment } from '@/src/finance';
export async function POST(req: Request) { try { return NextResponse.json(await recordPayment(await actor(true), await req.json()), { status: 201 }); } catch(e) { return responseError(e); } }
