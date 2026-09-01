'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/pricing';
import type { LeadsSummary } from '@/lib/db';

export default function AgentLeadsPage() {
  const [summary, setSummary] = useState<LeadsSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/agent/leads');
        const data = await response.json() as { summary?: LeadsSummary; error?: string };
        if (!response.ok || !data.summary) throw new Error(data.error ?? 'Unable to load lead summary.');
        setSummary(data.summary);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load lead summary.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-slate-600">Loading lead dashboard...</main>;
  if (!summary) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6"><p className="font-semibold text-rose-700">{error}</p></main>;

  const { totalScans, estimatedScans, confirmedScans, medianEstimateCents, totalCubicFeet, meanEditRate, pendingCount } = summary;
  const empty = totalScans === 0;

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">Meridian Moving Co.</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Lead dashboard</h1>
          </div>
          <Link href="/agent" className="text-sm font-bold text-cyan-700">Quote queue</Link>
        </header>

        {empty ? (
          <section className="mt-10 rounded-3xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-black text-slate-950">No scans yet</h2>
            <p className="mt-2 text-slate-600">Run <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">npm run seed-demo</code> to populate the dashboard.</p>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Scans started" value={String(totalScans)} />
              <StatTile label="Reached estimate" value={String(estimatedScans)} />
              <StatTile label="Confirmed" value={String(confirmedScans)} />
              <StatTile label="Pending review" value={String(pendingCount)} />
            </section>

            <section className="mt-6 grid gap-4 sm:grid-cols-3">
              <StatTile label="Median estimate" value={formatCents(Math.round(medianEstimateCents))} />
              <StatTile label="Total volume quoted" value={`${Math.round(totalCubicFeet * 10) / 10} cu ft`} />
              <StatTile label="Mean edit rate" value={`${Math.round(meanEditRate * 100)}%`} />
            </section>

            <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="font-black text-slate-950">Conversion funnel</h2>
              <div className="mt-4 space-y-3">
                <FunnelBar label="Scans" count={totalScans} total={totalScans} />
                <FunnelBar label="Estimates" count={estimatedScans} total={totalScans} />
                <FunnelBar label="Confirmed" count={confirmedScans} total={totalScans} />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function FunnelBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500">{count} ({pct}%)</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-cyan-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
