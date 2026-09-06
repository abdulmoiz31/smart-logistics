import Link from 'next/link';
import { listUserSessions, type UserScanSummary } from '@/lib/db';
import { requireUser } from '@/lib/require-user';

export const dynamic = 'force-dynamic';

function scanStatus(scan: UserScanSummary): { text: string; className: string } {
  if (scan.status === 'confirmed') return { text: 'Confirmed', className: 'bg-c-fresh/15 text-c-fresh' };
  if (scan.hasQuote || scan.status === 'pending_review') return { text: 'Estimate requested', className: 'bg-c-waiting/15 text-c-waiting' };
  return { text: 'In progress', className: 'bg-u-border/60 text-u-ink-2' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function ScansPage() {
  const user = await requireUser('/scans');
  const scans = await listUserSessions(user.id);

  return (
    <main className="min-h-screen bg-u-bg px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mt-2 text-3xl font-black tracking-tight text-u-ink">My scans</h1>
        <p className="mt-2 text-u-ink-2">Every room scan saved to your account.</p>

        {scans.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-u-border bg-u-panel p-8 text-center shadow-sm">
            <p className="font-bold text-u-ink">No saved scans yet.</p>
            <p className="mt-1 text-sm text-u-ink-2">Photograph a few rooms and they&apos;ll show up here.</p>
            <Link href="/" className="mt-5 inline-grid min-h-11 place-items-center rounded-xl bg-c-accent px-5 font-bold text-c-accent-ink transition hover:opacity-90">
              Start a scan
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {scans.map((scan) => {
              const status = scanStatus(scan);
              return (
                <li key={scan.id}>
                  <Link
                    href={`/scans/${scan.id}`}
                    className="block rounded-2xl border border-u-border bg-u-panel p-4 shadow-sm transition hover:border-c-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-u-ink">{scan.label ?? `Scan from ${formatDate(scan.createdAt)}`}</p>
                        <p className="mt-0.5 text-sm text-u-ink-2">
                          <span className="font-mono tabular-nums">{scan.roomCount}</span> room{scan.roomCount === 1 ? '' : 's'}
                          {' · '}<span className="font-mono tabular-nums">{scan.itemCount}</span> item{scan.itemCount === 1 ? '' : 's'}
                          {scan.totalCubicFeet > 0 && <> {' · '}<span className="font-mono tabular-nums">{scan.totalCubicFeet}</span> cu ft</>}
                        </p>
                        {scan.label && <p className="mt-0.5 text-xs text-u-ink-3">{formatDate(scan.createdAt)}</p>}
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
