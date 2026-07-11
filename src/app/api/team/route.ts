import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';
import { sendStaffInviteEmail } from '@/lib/email';

const inviteSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(['staff', 'owner']).default('staff'),
  /** Email invite credentials via Resend (default true) */
  sendEmail: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const session = await requireSession();
    const users = await prisma.user.findMany({
      where: { businessId: session.businessId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return jsonOk({ users });
  } catch (e) {
    return errorFromException(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== 'owner') {
      return jsonError('Only owners can invite team members', 403);
    }
    const body = inviteSchema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    const exists = await prisma.user.findFirst({
      where: { businessId: session.businessId, email },
    });
    if (exists) return jsonError('That email is already on this workspace', 409);

    const globalEmail = await prisma.user.findFirst({ where: { email } });
    if (globalEmail) {
      return jsonError('Email already registered — use a different email', 409);
    }

    const user = await prisma.user.create({
      data: {
        businessId: session.businessId,
        email,
        name: body.name.trim(),
        passwordHash: await bcrypt.hash(body.password, 12),
        role: body.role,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    let emailResult: { sent: boolean; reason?: string; message?: string } | undefined;
    if (body.sendEmail !== false) {
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: session.businessId },
        select: { name: true },
      });
      const r = await sendStaffInviteEmail({
        to: email,
        name: body.name.trim(),
        businessName: business.name,
        tempPassword: body.password,
      });
      emailResult = r.sent
        ? { sent: true }
        : { sent: false, reason: r.reason, message: r.message };
    }

    return jsonOk({ user, email: emailResult }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
