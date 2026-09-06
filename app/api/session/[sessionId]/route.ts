import { getSession, getSessionOwner, setSessionLabel } from '@/lib/db';
import { isUuid } from '@/lib/validation';
import { assertSessionAccess, callerOwnsAccount } from '@/lib/session-access';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    if (!isUuid(sessionId)) return Response.json({ error: 'Invalid session ID.' }, { status: 400 });

    const owner = await getSessionOwner(sessionId);
    try {
      // Ownership failure and "does not exist" answer identically on purpose:
      // a 403 would confirm the id is real.
      await assertSessionAccess(owner);
    } catch {
      return Response.json({ error: 'Session not found.' }, { status: 404 });
    }

    const session = await getSession(sessionId);
    if (!session) return Response.json({ error: 'Session not found.' }, { status: 404 });

    // The email is the one field here worth anything to an attacker, and a shared
    // device should not surface someone else's address. Account owners only.
    if (!(await callerOwnsAccount(owner))) {
      const { customerEmail: _withheld, ...withoutEmail } = session;
      return Response.json({ session: withoutEmail });
    }
    return Response.json({ session });
  } catch (error) {
    console.error('GET /api/session/[sessionId] failed', error);
    return Response.json({ error: 'Unable to load this scan session.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
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

    const body = await request.json() as Record<string, unknown>;
    if (body.label !== undefined && typeof body.label !== 'string') {
      return Response.json({ error: 'label must be a string.' }, { status: 400 });
    }
    if (body.label !== undefined) {
      await setSessionLabel(sessionId, body.label as string);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/session/[sessionId] failed', error);
    return Response.json({ error: 'Unable to update this scan session.' }, { status: 500 });
  }
}
