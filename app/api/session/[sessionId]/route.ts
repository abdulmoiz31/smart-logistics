import { getSession } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const session = await getSession(sessionId);
    if (!session) return Response.json({ error: 'Session not found.' }, { status: 404 });
    return Response.json({ session });
  } catch (error) {
    console.error('GET /api/session/[sessionId] failed', error);
    return Response.json({ error: 'Unable to load this scan session.' }, { status: 500 });
  }
}
