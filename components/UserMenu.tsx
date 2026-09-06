'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SignOutButton } from './SignOutButton';

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initial = email.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid h-9 w-9 place-items-center rounded-full bg-c-accent text-sm font-black text-c-accent-ink shadow-sm transition hover:opacity-90"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-u-border bg-u-panel shadow-lg"
        >
          <div className="truncate border-b border-u-border px-4 py-3 text-sm text-u-ink-3">{email}</div>
          <Link
            role="menuitem"
            href="/scans"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-semibold text-u-ink transition hover:bg-u-bg"
          >
            My scans
          </Link>
          <Link
            role="menuitem"
            href="/requests"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-semibold text-u-ink transition hover:bg-u-bg"
          >
            My requests
          </Link>
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className="block border-t border-u-border px-4 py-2.5 text-sm font-semibold text-u-ink transition hover:bg-u-bg"
          >
            Profile
          </Link>
          <SignOutButton
            onBeforeSignOut={() => setOpen(false)}
            className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-u-ink transition hover:bg-u-bg disabled:opacity-60"
          />
        </div>
      )}
    </div>
  );
}
