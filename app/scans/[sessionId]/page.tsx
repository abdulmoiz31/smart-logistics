import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCaptureSignedUrls, getSession, getSessionOwner } from '@/lib/db';
import { formatLabel } from '@/lib/format';
import { requireUser } from '@/lib/require-user';
import { isUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function ScanDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();

  const user = await requireUser(`/scans/${sessionId}`);
  const owner = await getSessionOwner(sessionId);
  if (!owner || owner.userId !== user.id) notFound();

  const session = await getSession(sessionId);
  if (!session) notFound();

  const rooms = await Promise.all(
    session.rooms.map(async (room) => ({ room, photoUrls: await getCaptureSignedUrls(room.id) })),
  );
  const totalItems = session.rooms.reduce((count, room) => count + room.items.reduce((n, i) => n + i.count, 0), 0);
  const totalCubicFeet = Math.round(
    session.rooms.reduce((total, room) => total + room.items.reduce((n, i) => n + i.cubicFeet * i.count, 0), 0) * 10,
  ) / 10;
  const hasItems = totalItems > 0;

  return (
    <main className="min-h-screen bg-u-bg px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/scans" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-u-ink-2 transition hover:text-c-accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          My scans
        </Link>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-u-ink">{session.label ?? 'Saved scan'}</h1>
        <p className="mt-2 text-u-ink-2">
          <span className="font-mono tabular-nums">{session.rooms.length}</span> room{session.rooms.length === 1 ? '' : 's'}
          {' · '}<span className="font-mono tabular-nums">{totalItems}</span> item{totalItems === 1 ? '' : 's'}
          {totalCubicFeet > 0 && <> {' · '}<span className="font-mono tabular-nums">{totalCubicFeet}</span> cu ft</>}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/scan/${session.id}`} className="grid min-h-10 place-items-center rounded-xl border border-u-border bg-u-panel px-4 text-sm font-bold text-u-ink-2 transition hover:border-c-accent hover:text-c-accent">
            Continue this scan
          </Link>
          {hasItems && (
            <Link href={`/estimate/${session.id}`} className="grid min-h-10 place-items-center rounded-xl bg-c-accent px-4 text-sm font-bold text-c-accent-ink transition hover:opacity-90">
              View estimate
            </Link>
          )}
        </div>

        <div className="mt-8 space-y-6">
          {rooms.map(({ room, photoUrls }) => (
            <section key={room.id} className="rounded-2xl border border-u-border bg-u-panel p-5 shadow-sm">
              <h2 className="font-black text-u-ink">{formatLabel(room.roomType)}</h2>

              {photoUrls.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {photoUrls.map((url, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt={`${formatLabel(room.roomType)} photo ${index + 1}`} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                  ))}
                </div>
              )}

              {room.items.length > 0 ? (
                <ul className="mt-4 divide-y divide-u-border/60">
                  {room.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-semibold text-u-ink">{formatLabel(item.name)}</p>
                        <p className="text-xs text-u-ink-3">
                          {item.count > 1 && <>×<span className="font-mono tabular-nums">{item.count}</span> · </>}
                          {item.sizeClass === 's' ? 'Small' : item.sizeClass === 'l' ? 'Large' : 'Medium'}
                          {' · '}<span className="font-mono tabular-nums">{Math.round(item.confidence * 100)}</span>% confidence
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-u-ink-2"><span className="font-mono tabular-nums">{Math.round(item.cubicFeet * item.count * 10) / 10}</span> cu ft</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-u-ink-3">No items detected for this room yet.</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
