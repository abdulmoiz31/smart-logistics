'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HandlingFlag } from '@/lib/types';
import { formatWait, urgencyOf, type Urgency } from '@/lib/relative-time';

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
  fresh: 'bg-teal-400',
  waiting: 'bg-amber-400',
  overdue: 'bg-rose-400',
};

const URGENCY_TEXT: Record<Urgency, string> = {
  fresh: 'text-teal-300',
  waiting: 'text-amber-300',
  overdue: 'text-rose-300',
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
  active: 'queue' | 'insights';
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-dvh text-slate-100">
      {/* globals.css paints html/body #f8fafc for the customer-facing pages. A fixed
          layer covers the whole viewport so overscroll and short pages stay dark,
          without changing the global background the light pages depend on. */}
      <div aria-hidden className="fixed inset-0 bg-[#080C16]" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#080C16]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal-300">
            Meridian Dispatch
          </span>
          <nav className="flex gap-1" aria-label="Console views">
            <Tab href="/agent" label="Queue" current={active === 'queue'} />
            <Tab href="/agent/leads" label="Insights" current={active === 'insights'} />
          </nav>
          <h1 className="sr-only">{title}</h1>
        </div>
      </header>
      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-7">{children}</div>
    </div>
  );
}

function Tab({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        current
          ? 'bg-white/10 text-white'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
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
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Awaiting confirmation
        </p>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-5xl font-bold leading-none tabular-nums text-white">
            {waiting}
          </span>
          <span className="text-lg text-slate-400">
            {waiting === 1 ? 'quote' : 'quotes'}
          </span>
        </p>
      </div>
      <dl className="flex gap-8 font-mono text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Oldest</dt>
          <dd className={`mt-1 text-lg font-bold tabular-nums ${URGENCY_TEXT[urgency]}`}>
            {waiting ? formatWait(oldestMinutes) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Median</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-slate-200">
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
      className="group relative flex gap-4 overflow-hidden rounded-xl border border-white/10 bg-[#111827] pl-0 transition hover:border-white/25 hover:bg-[#151F31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
    >
      <span aria-hidden className={`w-1 shrink-0 ${URGENCY_RAIL[urgency]}`} />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-3 py-4 pr-4">
        <div className="min-w-[9rem]">
          <p className={`font-mono text-base font-bold tabular-nums ${URGENCY_TEXT[urgency]}`}>
            {formatWait(waitMinutes)}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {customerEmail ?? `ref ${reference}`}
          </p>
        </div>

        {/* No column labels: "cu ft", "rooms" and the truck name are self-describing,
            and repeating three headings on every row is noise, not structure. */}
        <p className="min-w-0 flex-1 truncate font-mono text-sm tabular-nums text-slate-300">
          <span className="font-bold text-slate-100">{cubicFeet}</span> cu ft
          <Sep />
          {rooms} {rooms === 1 ? 'room' : 'rooms'} · {items} {items === 1 ? 'item' : 'items'}
          <Sep />
          {truckLabel} · {crewSize} crew
        </p>

        <div className="flex items-center gap-4">
          <p className="font-mono text-base font-bold tabular-nums text-white">
            {formatCents(lowCents)}–{formatCents(highCents)}
          </p>
          <span aria-hidden className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-teal-300">
            →
          </span>
        </div>

        {handling.length > 0 && (
          <ul className="flex w-full flex-wrap gap-1.5">
            {handling.map((flag) => (
              <li
                key={flag}
                className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-200"
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
  return <span aria-hidden className="mx-3 text-slate-600">|</span>;
}

/** Metrics demoted to a quiet strip. They are context, not the job. */
export function MetricStrip({ metrics }: { metrics: { label: string; value: string; hint?: string }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 border-y border-white/10 py-5 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {metric.label}
          </dt>
          <dd className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-white">
            {metric.value}
          </dd>
          {metric.hint && <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
      <h2 className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-slate-300">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm text-slate-500">{children}</p>
    </section>
  );
}
