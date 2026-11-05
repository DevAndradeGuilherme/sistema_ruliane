import { NextResponse } from 'next/server';
export function GET() {
  // Somente liveness; não é readiness de banco, Redis, OpenAI ou Evolution.
  return NextResponse.json({ service: 'financeiro-web', alive: true, ready: false, integrationsChecked: false });
}
