import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let db: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'error';
  }

  const ok = db === 'ok';
  return NextResponse.json(
    {
      ok,
      service: 'handyquote',
      db,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
