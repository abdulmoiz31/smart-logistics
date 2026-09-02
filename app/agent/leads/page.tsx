'use client';

import { useEffect, useState } from 'react';
import { formatCents } from '@/lib/pricing';
import { ConsoleShell, MetricStrip, EmptyState } from '@/components/agent/console';
import { FunnelChart } from '@/components/agent/charts/FunnelChart';
import { TrendChart } from '@/components/agent/charts/TrendChart';
import { CompositionChart } from '@/components/agent/charts/CompositionChart';
import type { LeadsSummary, TrendPoint, CompositionSlice } from '@/lib/db';

export default function AgentInsightsPage() {
  const [summary, setSummary] = useState<LeadsSummary>();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [composition, setComposition] = useState<CompositionSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/agent/leads');
        const data = await response.json() as {
          summary?: LeadsSummary;
          trend?: TrendPoint[];
          composition?: CompositionSlice[];
          error?: string;
        };
        if (!response.ok || !data.summary) throw new Error(data.error ?? 'Unable to load insights.');
        setSummary(data.summary);
        setTrend(data.trend ?? []);
        setComposition(data.composition ?? []);
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
        <p className="py-16 text-center font-mono text-sm text-c-ink-3">Loading insights…</p>
      ) : !summary ? (
        <p role="alert" className="rounded-xl border border-c-overdue/30 bg-c-overdue/10 p-4 text-sm font-semibold text-c-overdue">
          {error}
        </p>
      ) : summary.totalScans === 0 ? (
        <EmptyState title="No scans yet">
          Run <code className="rounded bg-c-ink/10 px-1.5 py-0.5 font-mono text-xs text-c-ink-2">npm run seed-demo</code>{' '}
          to populate the console with a sample scan.
        </EmptyState>
      ) : (
        <Insights summary={summary} trend={trend} composition={composition} />
      )}
    </ConsoleShell>
  );
}

function Insights({ summary, trend, composition }: { summary: LeadsSummary; trend: TrendPoint[]; composition: CompositionSlice[] }) {
  const {
    totalScans, estimatedScans, confirmedScans,
    medianEstimateCents, totalCubicFeet, meanEditRate, pendingCount,
  } = summary;

  const reachRate = totalScans ? Math.round((estimatedScans / totalScans) * 100) : 0;
  const closeRate = estimatedScans ? Math.round((confirmedScans / estimatedScans) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Accuracy leads, because it is the metric that says whether the AI is trustworthy. */}
      <section>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-c-ink-3">
          Inventory accuracy
        </p>
        <p className="mt-2 flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-5xl font-bold leading-none tabular-nums text-c-ink">
            {100 - Math.round(meanEditRate * 100)}%
          </span>
          <span className="text-lg text-c-ink-2">of AI items accepted unchanged</span>
        </p>
        <p className="mt-2 max-w-xl text-sm text-c-ink-3">
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

      <FunnelChart
        title="Scan to booking"
        description="How many scans become estimates, and how many estimates close."
        stages={[
          { label: 'Started a scan', count: totalScans },
          { label: 'Reached an estimate', count: estimatedScans },
          { label: 'Confirmed by a specialist', count: confirmedScans },
        ]}
        totalScans={totalScans}
      />

      <TrendChart
        title="Activity trend"
        description="Scans started and quotes confirmed over the last 14 days."
        data={trend}
      />

      <CompositionChart
        title="Volume by category"
        description="Share of total cubic feet across all inventory families."
        slices={composition}
      />
    </div>
  );
}
