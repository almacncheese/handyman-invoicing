import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getAuthSecret } from './config';
import type { SessionUser } from './authz';
import { prisma } from './db';

export const SESSION_COOKIE = 'hq_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

function secretKey() {
  return new TextEncoder().encode(getAuthSecret());
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    businessId: user.businessId,
    role: user.role,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.businessId !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      return null;
    }
    const role = payload.role === 'staff' ? 'staff' : 'owner';
    return {
      userId: payload.userId,
      businessId: payload.businessId,
      email: payload.email,
      role,
    };
  } catch {
    return null;
  }
}

/**
 * Fail-closed session read.
 * JWT is verified AND the user/business must still exist (handles reseed / deleted accounts).
 */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) {
    await clearSessionCookieSafe();
    return null;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        businessId: payload.businessId,
        active: true,
      },
      select: {
        id: true,
        businessId: true,
        email: true,
        role: true,
        business: { select: { id: true } },
      },
    });

    if (!user || !user.business) {
      await clearSessionCookieSafe();
      return null;
    }

    return {
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      role: user.role === 'staff' ? 'staff' : 'owner',
    };
  } catch {
    // DB blip — fail closed rather than forge session
    return null;
  }
}

async function clearSessionCookieSafe() {
  try {
    await clearSessionCookie();
  } catch {
    // Cookie mutation can fail in some edge contexts — ignore
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    const err = new Error('Unauthorized');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return session;
}
