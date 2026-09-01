import { createSession } from '@/lib/db';

export async function POST() {
  try {
    const sessionId = await createSession();
    return Response.json({ sessionId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/session failed', error);
    return Response.json({ error: 'Unable to create a scan session.' }, { status: 500 });
  }
}
