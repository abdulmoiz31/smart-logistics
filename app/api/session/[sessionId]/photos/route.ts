import { getSessionCaptureUrls, getSessionOwner } from '@/lib/db';
import { assertSessionAccess } from '@/lib/session-access';
import { isUuid } from '@/lib/validation';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    if (!isUuid(sessionId)) return Response.json({ error: 'Invalid session ID.' }, { status: 400 });

    try {
      await assertSessionAccess(await getSessionOwner(sessionId));
    } catch {
      return Response.json({ error: 'Session not found.' }, { status: 404 });
    }

    const photos = await getSessionCaptureUrls(sessionId);
    return Response.json({ photos });
  } catch (error) {
    console.error('GET /api/session/[sessionId]/photos failed', error);
    return Response.json({ error: 'Unable to load room photos.' }, { status: 500 });
  }
}
