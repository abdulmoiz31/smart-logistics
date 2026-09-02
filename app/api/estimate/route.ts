import { getSessionRooms, saveQuote, setSessionEmail, getSessionOwner} from '@/lib/db';
import { priceQuote } from '@/lib/pricing';
import rateCard from '@/data/ratecard.json';
import type { AccessFlag, RateCard } from '@/lib/types';
import { isUuid } from '@/lib/validation';
import { assertSessionAccess } from '@/lib/session-access';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isUuid(body.sessionId)) {
      return Response.json({ error: 'A valid sessionId is required.' }, { status: 400 });
    }
    if (body.email !== undefined && (typeof body.email !== 'string' || !emailPattern.test(body.email))) {
      return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    try {
      // Authorize before doing any work: an unauthorized caller must not write
      // files or burn someone else's quota. 404 not 403 — see lib/session-access.ts.
      await assertSessionAccess(await getSessionOwner(body.sessionId));
    } catch {
      return Response.json({ error: 'Session not found.' }, { status: 404 });
    }
    const rooms = await getSessionRooms(body.sessionId);
    const items = rooms.flatMap((room) => room.items);
    if (!items.length) return Response.json({ error: 'Add at least one item before requesting an estimate.' }, { status: 400 });
    const accessFlags = [...new Set(rooms.flatMap((room) => room.accessFlags))] as AccessFlag[];
    const quote = await saveQuote(body.sessionId, priceQuote(items, accessFlags, rateCard as RateCard));
    if (typeof body.email === 'string') await setSessionEmail(body.sessionId, body.email);
    return Response.json({ quote });
  } catch (error) {
    console.error('POST /api/estimate failed', error);
    return Response.json({ error: 'Unable to calculate an estimate.' }, { status: 500 });
  }
}
