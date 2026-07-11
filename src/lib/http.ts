import { NextResponse } from 'next/server';

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function errorFromException(e: unknown) {
  if (e && typeof e === 'object' && 'status' in e) {
    const status = Number((e as { status: number }).status) || 500;
    const message = e instanceof Error ? e.message : 'Error';
    return jsonError(message, status);
  }
  if (e instanceof Error) {
    return jsonError(e.message, 400);
  }
  return jsonError('Unexpected error', 500);
}
