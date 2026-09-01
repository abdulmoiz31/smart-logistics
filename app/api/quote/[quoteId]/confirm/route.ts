import { isAgentAuthenticated } from '@/lib/agent-auth';
import { confirmQuote } from '@/lib/db';
import { isUuid } from '@/lib/validation';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  try {
    if (!await isAgentAuthenticated()) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const { quoteId } = await params;
    if (!isUuid(quoteId)) return Response.json({ error: 'Invalid quote ID.' }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    if (!Number.isInteger(body.cents) || (body.cents as number) <= 0 || typeof body.notes !== 'string') {
      return Response.json({ error: 'A positive whole-cent price and notes are required.' }, { status: 400 });
    }
    const quote = await confirmQuote(quoteId, body.cents as number, body.notes);
    return Response.json({ quote });
  } catch (error) {
    console.error('POST /api/quote/[quoteId]/confirm failed', error);
    return Response.json({ error: 'Unable to confirm this quote.' }, { status: 500 });
  }
}
