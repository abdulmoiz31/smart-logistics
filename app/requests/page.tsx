import Link from 'next/link';
import { listUserQuotes, type UserRequestSummary } from '@/lib/db';
import { formatCents } from '@/lib/pricing';
import { requireUser } from '@/lib/require-user';

export const dynamic = 'force-dynamic';

function requestStatus(request: UserRequestSummary): { text: string; className: string } {
  if (request.status === 'confirmed') return { text: 'Confirmed', className: 'bg-c-fresh/15 text-c-fresh' };
  return { text: 'Awaiting confirmation', className: 'bg-c-waiting/15 text-c-waiting' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function RequestsPage() {
  const user = await requireUser('/requests');
  const requests = await listUserQuotes(user.id);

  return (
    <main className="min-h-screen bg-u-bg px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mt-2 text-3xl font-black tracking-tight text-u-ink">My requests</h1>
        <p className="mt-2 text-u-ink-2">Estimates you&apos;ve requested, and their confirmed prices.</p>

        {requests.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-u-border bg-u-panel p-8 text-center shadow-sm">
            <p className="font-bold text-u-ink">No estimate requests yet.</p>
            <p className="mt-1 text-sm text-u-ink-2">Finish a scan and request an estimate — it&apos;ll show up here.</p>
            <Link href="/scans" className="mt-5 inline-grid min-h-11 place-items-center rounded-xl bg-c-accent px-5 font-bold text-c-accent-ink transition hover:opacity-90">
              My scans
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {requests.map((request) => {
              const status = requestStatus(request);
              const price = request.confirmedCents !== null
                ? formatCents(request.confirmedCents)
                : `${formatCents(request.lowCents)} – ${formatCents(request.highCents)}`;
              return (
                <li key={request.quoteId}>
                  <Link
                    href={`/estimate/${request.sessionId}`}
                    className="block rounded-2xl border border-u-border bg-u-panel p-4 shadow-sm transition hover:border-c-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-u-ink">{request.label ?? `Request from ${formatDate(request.createdAt)}`}</p>
                        <p className="mt-0.5 text-sm text-u-ink-2">
                          <span className="font-mono tabular-nums">{price}</span>
                          {request.confirmedCents === null && ' estimate'}
                        </p>
                        {request.label && <p className="mt-0.5 text-xs text-u-ink-3">{formatDate(request.createdAt)}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.text}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
