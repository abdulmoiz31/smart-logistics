'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCents } from '@/lib/pricing';
import { planTruckAndCrew } from '@/lib/moving-plan';
import { minutesSince } from '@/lib/relative-time';
import { ConsoleShell, QueueHeadline, TicketRow, EmptyState } from '@/components/agent/console';
import type { QuoteSummary } from '@/lib/types';

export default function AgentQueuePage() {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Captured once on mount so every row measures against the same instant.
  const [now, setNow] = useState<number>();

  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/agent/queue');
        const data = await response.json() as { quotes?: QuoteSummary[]; error?: string };
        if (!response.ok || !data.quotes) throw new Error(data.error ?? 'Unable to load the queue.');
        setQuotes(data.quotes);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load the queue.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Oldest first: a dispatch queue is ordered by who has waited longest.
  const ordered = useMemo(() => {
    if (!now) return [];
    return [...quotes]
      .map((quote) => ({ quote, waitMinutes: minutesSince(quote.createdAt, now) }))
      .sort((a, b) => b.waitMinutes - a.waitMinutes);
  }, [quotes, now]);

  const medianCents = useMemo(() => {
    if (!quotes.length) return 0;
    const values = quotes.map((q) => q.breakdown.subtotalCents).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
  }, [quotes]);

  return (
    <ConsoleShell title="Quote queue" active="queue">
      {loading || !now ? (
        <p className="py-16 text-center font-mono text-sm text-c-ink-3">Loading queue…</p>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-c-overdue/30 bg-c-overdue/10 p-4 text-sm font-semibold text-c-overdue">
          {error}
        </p>
      ) : (
        <>
          <QueueHeadline
            waiting={ordered.length}
            oldestMinutes={ordered[0]?.waitMinutes ?? 0}
            medianCents={medianCents}
            formatCents={formatCents}
          />

          <div className="mt-8 space-y-2">
            {ordered.length === 0 ? (
              <EmptyState title="Queue clear">
                Nothing is waiting on a specialist. New scans appear here the moment a
                customer requests confirmation.
              </EmptyState>
            ) : (
              ordered.map(({ quote, waitMinutes }) => {
                const plan = planTruckAndCrew(quote.totalCubicFeet, []);
                return (
                  <TicketRow
                    key={quote.id}
                    href={`/agent/${quote.id}`}
                    reference={quote.sessionId.slice(0, 8)}
                    waitMinutes={waitMinutes}
                    rooms={quote.roomCount}
                    items={quote.itemCount}
                    cubicFeet={quote.totalCubicFeet}
                    lowCents={quote.breakdown.lowCents}
                    highCents={quote.breakdown.highCents}
                    truckLabel={plan.truckLabel}
                    crewSize={plan.crewSize}
                    handling={quote.handling}
                    customerEmail={quote.customerEmail}
                    formatCents={formatCents}
                  />
                );
              })
            )}
          </div>
        </>
      )}
    </ConsoleShell>
  );
}
