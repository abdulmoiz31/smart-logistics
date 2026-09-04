'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SignOutButtonProps {
  className?: string;
  onBeforeSignOut?: () => void;
}

export function SignOutButton({ className, onBeforeSignOut }: SignOutButtonProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    onBeforeSignOut?.();
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={() => void signOut()} disabled={signingOut} className={className}>
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
