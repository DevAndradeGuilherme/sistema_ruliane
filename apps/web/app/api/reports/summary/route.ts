import { NextResponse } from 'next/server';
import { actor, responseError } from '@/src/api';
import { financeSummary } from '@/src/finance-summary';
export async function GET(req: Request) { try { return NextResponse.json(await financeSummary(await actor(), Object.fromEntries(new URL(req.url).searchParams))); } catch (error) { return responseError(error); } }
