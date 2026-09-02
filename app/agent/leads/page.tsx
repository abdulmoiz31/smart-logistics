'use client';

import { useEffect, useState } from 'react';
import { formatCents } from '@/lib/pricing';
import { ConsoleShell, MetricStrip, EmptyState } from '@/components/agent/console';
import type { LeadsSummary } from '@/lib/db';

export default function AgentInsightsPage() {
  const [summary, setSummary] = useState<LeadsSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/agent/leads');
        const data = await response.json() as { summary?: LeadsSummary; error?: string };
        if (!response.ok || !data.summary) throw new Error(data.error ?? 'Unable to load insights.');
        setSummary(data.summary);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load insights.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <ConsoleShell title="Insights" active="insights">
      {loading ? (
        <p className="py-16 text-center font-mono text-sm text-slate-500">Loading insights…</p>
      ) : !summary ? (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm font-semibold text-rose-200">
          {error}
        </p>
      ) : summary.totalScans === 0 ? (
        <EmptyState title="No scans yet">
          Run <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-slate-300">npm run seed-demo</code>{' '}
          to populate the console with a sample scan.
        </EmptyState>
      ) : (
        <Insights summary={summary} />
      )}
    </ConsoleShell>
  );
}

function Insights({ summary }: { summary: LeadsSummary }) {
  const {
    totalScans, estimatedScans, confirmedScans,
    medianEstimateCents, totalCubicFeet, meanEditRate, pendingCount,
  } = summary;

  const reachRate = totalScans ? Math.round((estimatedScans / totalScans) * 100) : 0;
  const closeRate = estimatedScans ? Math.round((confirmedScans / estimatedScans) * 100) : 0;

  return (
    <>
      {/* Accuracy leads, because it is the metric that says whether the AI is trustworthy. */}
      <section>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Inventory accuracy
        </p>
        <p className="mt-2 flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-5xl font-bold leading-none tabular-nums text-white">
            {100 - Math.round(meanEditRate * 100)}%
          </span>
          <span className="text-lg text-slate-400">of AI items accepted unchanged</span>
        </p>
        <p className="mt-2 max-w-xl text-sm text-slate-500">
          Measured across every confirmed quote. Each correction a specialist makes is
          recorded, so this figure is observed rather than claimed.
        </p>
      </section>

      <div className="mt-8">
        <MetricStrip
          metrics={[
            { label: 'Scans started', value: String(totalScans) },
            { label: 'Reached estimate', value: `${estimatedScans}`, hint: `${reachRate}% of scans` },
            { label: 'Confirmed', value: `${confirmedScans}`, hint: `${closeRate}% of estimates` },
            { label: 'Awaiting review', value: String(pendingCount) },
          ]}
        />
      </div>

      <div className="mt-1">
        <MetricStrip
          metrics={[
            { label: 'Median estimate', value: formatCents(Math.round(medianEstimateCents)) },
            { label: 'Volume quoted', value: `${Math.round(totalCubicFeet * 10) / 10} cu ft` },
            {
              label: 'Avg. per scan',
              value: estimatedScans
                ? `${Math.round(totalCubicFeet / estimatedScans)} cu ft`
                : '—',
            },
            { label: 'Corrections made', value: `${Math.round(meanEditRate * 100)}%` },
          ]}
        />
      </div>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Scan to booking
        </h2>
        <ol className="mt-4 space-y-3">
          <Stage label="Started a scan" count={totalScans} total={totalScans} tone="bg-slate-500" />
          <Stage label="Reached an estimate" count={estimatedScans} total={totalScans} tone="bg-amber-400" />
          <Stage label="Confirmed by a specialist" count={confirmedScans} total={totalScans} tone="bg-teal-400" />
        </ol>
      </section>
    </>
  );
}

function Stage({
  label, count, total, tone,
}: { label: string; count: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-4 font-mono text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="tabular-nums text-slate-400">
          <span className="font-bold text-white">{count}</span> · {pct}%
        </span>
      </div>
      {/* min-width keeps a zero stage visible as an empty track rather than nothing at all */}
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
