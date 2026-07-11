import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { jsonOk, errorFromException } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const existing = await prisma.lineTemplate.findUnique({ where: { id } });
    assertSameBusiness(session, existing);
    await prisma.lineTemplate.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return errorFromException(e);
  }
}
