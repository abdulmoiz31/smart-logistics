import { getQuote } from '@/lib/db';
import { isUuid } from '@/lib/validation';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  try {
    const { quoteId } = await params;
    if (!isUuid(quoteId)) return Response.json({ error: 'Invalid quote ID.' }, { status: 400 });
    const quote = await getQuote(quoteId);
    if (!quote) return Response.json({ error: 'Quote not found.' }, { status: 404 });
    return Response.json({ quote });
  } catch (error) {
    console.error('GET /api/quote/[quoteId] failed', error);
    return Response.json({ error: 'Unable to load this quote.' }, { status: 500 });
  }
}
