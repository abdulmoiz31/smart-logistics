import { isAgentAuthenticated } from '@/lib/agent-auth';
import { getCaptureSignedUrls, getQuote, getSessionRooms } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  if (!await isAgentAuthenticated()) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const { quoteId } = await params;
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
