'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HandlingFlag } from '@/lib/types';
import { formatWait, urgencyOf, type Urgency } from '@/lib/relative-time';
import { ThemeToggle } from '@/components/ThemeToggle';

/*
 * Dispatch console primitives.
 *
 * Direction: a dark ops board, not a light analytics dashboard. Panels lift off an
 * ink surface so hierarchy comes from depth rather than from card outlines floating
 * on pale grey. Colour encodes state only — amber waiting, rose overdue, teal
 * confirmed — and is never decorative. Numerics are mono because the artifact this
 * borrows from is a typed load sheet.
 */

const URGENCY_RAIL: Record<Urgency, string> = {
  fresh: 'bg-c-fresh',
  waiting: 'bg-c-waiting',
  overdue: 'bg-c-overdue',
};

const URGENCY_TEXT: Record<Urgency, string> = {
  fresh: 'text-c-fresh',
  waiting: 'text-c-waiting',
  overdue: 'text-c-overdue',
};

const HANDLING_LABEL: Record<HandlingFlag, string> = {
  heavy: 'Heavy',
  fragile: 'Fragile',
  high_value: 'High value',
  disassembly: 'Disassembly',
};

export function ConsoleShell({
  title,
  active,
  children,
}: {
  title: string;
  active: 'queue' | 'insights' | 'detail';
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-dvh bg-c-bg text-c-ink">
      <header className="sticky top-0 z-20 border-b border-c-border bg-c-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={18} height={18} className="rounded-sm" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-c-ink">
              Move<span className="text-c-accent">Scan</span>
            </span>
          </span>
          <nav className="flex gap-1" aria-label="Console views">
            <Tab href="/agent" label="Queue" current={active === 'queue'} />
            <Tab href="/agent/leads" label="Insights" current={active === 'insights'} />
          </nav>
          <h1 className="sr-only">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-7">{children}</div>
    </div>
  );
}

/**
 * Ends the console session. POST, so no page can trigger it with an <img> tag.
 * A full reload after sign-out lets middleware do the redirect rather than
 * duplicating the auth decision on the client.
 */
function SignOutButton() {
  return (
    <form
      action="/api/agent/logout"
      method="POST"
      onSubmit={(event) => {
        event.preventDefault();
        void fetch('/api/agent/logout', { method: 'POST' })
          .then(() => { window.location.href = '/agent/login'; });
      }}
    >
      <button
        type="submit"
        className="grid min-h-9 place-items-center rounded-lg border border-c-border px-3 text-sm font-semibold text-c-ink-2 transition hover:border-c-border-hi hover:text-c-ink"
      >
        Sign out
      </button>
    </form>
  );
}

function Tab({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        current
          ? 'bg-c-ink-3/10 text-c-ink'
          : 'text-c-ink-2 hover:bg-c-ink-3/5 hover:text-c-ink'
      }`}
    >
      {label}
    </Link>
  );
}

/** The hero is urgency, not volume — the first thing a dispatcher needs to know. */
export function QueueHeadline({
  waiting,
  oldestMinutes,
  medianCents,
  formatCents,
}: {
  waiting: number;
  oldestMinutes: number;
  medianCents: number;
  formatCents: (cents: number) => string;
}) {
  const urgency = urgencyOf(oldestMinutes);
  return (
    <section className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-c-ink-3">
          Awaiting confirmation
        </p>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-5xl font-bold leading-none tabular-nums text-c-ink">
            {waiting}
          </span>
          <span className="text-lg text-c-ink-2">
            {waiting === 1 ? 'quote' : 'quotes'}
          </span>
        </p>
      </div>
      <dl className="flex gap-8 font-mono text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-c-ink-3">Oldest</dt>
          <dd className={`mt-1 text-lg font-bold tabular-nums ${URGENCY_TEXT[urgency]}`}>
            {waiting ? formatWait(oldestMinutes) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-c-ink-3">Median</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-c-ink-2">
            {waiting ? formatCents(medianCents) : '—'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * The signature element. A left rail carries urgency, mono columns carry the numbers,
 * and handling chips answer the question that changes dispatch: what is awkward about
 * this job? A piano changes the truck and the crew, so it belongs on the row, not
 * buried in a detail view.
 */
export function TicketRow({
  href,
  reference,
  waitMinutes,
  rooms,
  items,
  cubicFeet,
  lowCents,
  highCents,
  truckLabel,
  crewSize,
  handling,
  customerEmail,
  formatCents,
}: {
  href: string;
  reference: string;
  waitMinutes: number;
  rooms: number;
  items: number;
  cubicFeet: number;
  lowCents: number;
  highCents: number;
  truckLabel: string;
  crewSize: number;
  handling: HandlingFlag[];
  customerEmail?: string;
  formatCents: (cents: number) => string;
}) {
  const urgency = urgencyOf(waitMinutes);

  return (
    <Link
      href={href}
      className="group relative flex gap-4 overflow-hidden rounded-xl border border-c-border bg-c-panel pl-0 transition hover:border-c-border-hi hover:bg-c-panel-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-accent"
    >
      <span aria-hidden className={`w-1 shrink-0 ${URGENCY_RAIL[urgency]}`} />

      <div className="flex min-w-0 flex-1 flex-col gap-y-3 py-4 pr-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
        <div className="min-w-[9rem]">
          <p className={`font-mono text-base font-bold tabular-nums ${URGENCY_TEXT[urgency]}`}>
            {formatWait(waitMinutes)}
          </p>
          <p className="mt-0.5 truncate text-xs text-c-ink-3">
            {customerEmail ?? `ref ${reference}`}
          </p>
        </div>

        {/* No column labels: "cu ft", "rooms" and the truck name are self-describing,
            and repeating three headings on every row is noise, not structure. */}
        <p className="min-w-0 flex-1 font-mono text-sm tabular-nums text-c-ink-2">
          <span className="font-bold text-c-ink">{cubicFeet}</span> cu ft
          <Sep />
          {rooms} {rooms === 1 ? 'room' : 'rooms'} · {items} {items === 1 ? 'item' : 'items'}
          <Sep />
          {truckLabel} · {crewSize} crew
        </p>

        <div className="flex items-center gap-4 lg:ml-auto">
          <p className="font-mono text-base font-bold tabular-nums text-c-ink">
            {formatCents(lowCents)}–{formatCents(highCents)}
          </p>
          <span aria-hidden className="text-c-ink-3 transition group-hover:translate-x-0.5 group-hover:text-c-accent">
            →
          </span>
        </div>

        {handling.length > 0 && (
          <ul className="flex w-full flex-wrap gap-1.5">
            {handling.map((flag) => (
              <li
                key={flag}
                className="rounded border border-c-waiting/30 bg-c-waiting/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-c-waiting"
              >
                {HANDLING_LABEL[flag]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

function Sep() {
  return <span aria-hidden className="mx-3 text-c-ink-3">|</span>;
}

/** Metrics demoted to a quiet strip. They are context, not the job. */
export function MetricStrip({ metrics }: { metrics: { label: string; value: string; hint?: string }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 border-y border-c-border py-5 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-c-ink-3">
            {metric.label}
          </dt>
          <dd className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-c-ink">
            {metric.value}
          </dd>
          {metric.hint && <p className="mt-1 text-xs text-c-ink-3">{metric.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-dashed border-c-border-hi bg-c-ink/5 px-6 py-14 text-center">
      <h2 className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-c-ink-2">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm text-c-ink-3">{children}</p>
    </section>
  );
}
