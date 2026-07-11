'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Header account menu — Settings / password / plan / admin / sign out.
 * Avoids "I logged in and can't find X" dead ends.
 */
export function AccountMenu({ inverted = false }: { inverted?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) return;
        setEmail(d.user.email || null);
        setPlatformAdmin(Boolean(d.user.platformAdmin));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const btnClass = inverted
    ? 'btn btn-ghost btn-sm !text-white/90 hover:!bg-white/10'
    : 'btn btn-ghost btn-sm';

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className={btnClass}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        Account
        <span className="ml-1 opacity-60" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-56 rounded-md border border-[var(--line)] bg-white py-1 shadow-lg"
        >
          {email && (
            <div className="border-b border-[var(--hairline)] px-3 py-2 text-xs text-[var(--muted)]">
              {email}
            </div>
          )}
          <Link
            href="/settings"
            role="menuitem"
            className="block px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            Settings &amp; password
          </Link>
          <Link
            href="/billing"
            role="menuitem"
            className="block px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            Plan &amp; trial
          </Link>
          <Link
            href="/reports"
            role="menuitem"
            className="block px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--surface-2)]"
            onClick={() => setOpen(false)}
          >
            Reports
          </Link>
          {platformAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              className="block px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--surface-2)]"
              onClick={() => setOpen(false)}
            >
              Platform admin
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--surface-2)]"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
