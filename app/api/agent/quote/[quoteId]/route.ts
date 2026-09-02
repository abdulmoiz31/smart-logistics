import { isAgentAuthenticated } from '@/lib/agent-auth';
import { getCaptureSignedUrls, getQuote, getSessionRooms } from '@/lib/db';
import { isUuid } from '@/lib/validation';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  if (!await isAgentAuthenticated(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const { quoteId } = await params;
    if (!isUuid(quoteId)) return Response.json({ error: 'Invalid quote ID.' }, { status: 400 });
    const quote = await getQuote(quoteId);
    if (!quote) return Response.json({ error: 'Quote not found.' }, { status: 404 });
    const rooms = await getSessionRooms(quote.sessionId);
    const roomsWithCaptures = await Promise.all(rooms.map(async (room) => ({
      ...room,
      captureUrls: await getCaptureSignedUrls(room.id),
    })));
    return Response.json({ quote, rooms: roomsWithCaptures });
  } catch (error) {
    console.error('GET /api/agent/quote/[quoteId] failed', error);
    return Response.json({ error: 'Unable to load this quote.' }, { status: 500 });
  }
}
