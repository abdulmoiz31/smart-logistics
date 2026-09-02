import { getQuote, getSessionOwnerForQuote} from '@/lib/db';
import { isUuid } from '@/lib/validation';
import { assertSessionAccess } from '@/lib/session-access';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  try {
    const { quoteId } = await params;
    if (!isUuid(quoteId)) return Response.json({ error: 'Invalid quote ID.' }, { status: 400 });
    try {
      // Ownership failure and "does not exist" answer identically on purpose:
      // a 403 would confirm the id is real.
      await assertSessionAccess(await getSessionOwnerForQuote(quoteId));
    } catch {
      return Response.json({ error: 'Quote not found.' }, { status: 404 });
    }
    const quote = await getQuote(quoteId);
    if (!quote) return Response.json({ error: 'Quote not found.' }, { status: 404 });
    return Response.json({ quote });
  } catch (error) {
    console.error('GET /api/quote/[quoteId] failed', error);
    return Response.json({ error: 'Unable to load this quote.' }, { status: 500 });
  }
}
