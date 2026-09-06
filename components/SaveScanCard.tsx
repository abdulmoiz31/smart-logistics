'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SaveScanCardProps {
  sessionId: string;
  authenticated: boolean;
  initialLabel: string | null;
  onSaved: (label: string | null) => void;
}

export function SaveScanCard({ sessionId, authenticated, initialLabel, onSaved }: SaveScanCardProps) {
  const [label, setLabel] = useState(initialLabel ?? '');
  const [savedLabel, setSavedLabel] = useState(initialLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!authenticated) {
    return (
      <section className="mt-5 rounded-3xl border border-c-accent/20 bg-c-accent/10 p-5">
        <h2 className="font-black text-u-ink">Save this scan</h2>
        <p className="mt-1 text-sm text-u-ink-2">
          Sign in to keep this scan in your account — you&apos;ll find it under <strong>My scans</strong> any time.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link href={`/login?next=/scan/${sessionId}`} className="grid min-h-11 place-items-center rounded-xl bg-c-accent px-4 font-bold text-c-accent-ink transition hover:opacity-90">
            Sign in to save
          </Link>
          <Link href={`/signup?next=/scan/${sessionId}`} className="grid min-h-11 place-items-center font-semibold text-c-accent">
            Create a free account
          </Link>
        </div>
      </section>
    );
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to save this scan.');
      const next = label.trim() || null;
      setSavedLabel(next);
      onSaved(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this scan.');
    } finally {
      setSaving(false);
    }
  }

  const dirty = (label.trim() || null) !== savedLabel;

  return (
    <section className="mt-5 rounded-3xl border border-c-fresh/20 bg-c-fresh/10 p-5">
      <h2 className="font-black text-u-ink">Save this scan</h2>
      <p className="mt-1 text-sm text-u-ink-2">
        Give it a name so it&apos;s easy to find in <Link href="/scans" className="font-bold text-c-accent underline">My scans</Link>.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={label}
          maxLength={120}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Apartment on 5th Ave"
          className="min-h-11 flex-1 rounded-xl border border-u-border bg-u-bg px-3 text-u-ink"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="min-h-11 rounded-xl bg-c-fresh px-4 font-bold text-c-accent-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-c-overdue">{error}</p>}
      <p className="mt-3 text-sm text-c-fresh">
        ✓ Saved to your account{savedLabel ? ` as “${savedLabel}”` : ''}.
      </p>
    </section>
  );
}
