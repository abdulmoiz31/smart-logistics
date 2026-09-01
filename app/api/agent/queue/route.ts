import { isAgentAuthenticated } from '@/lib/agent-auth';
import { listPendingQuotes } from '@/lib/db';

export async function GET() {
  if (!await isAgentAuthenticated()) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    return Response.json({ quotes: await listPendingQuotes() });
  } catch (error) {
    console.error('GET /api/agent/queue failed', error);
    return Response.json({ error: 'Unable to load the quote queue.' }, { status: 500 });
  }
}
