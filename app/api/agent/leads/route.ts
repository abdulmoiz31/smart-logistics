import { isAgentAuthenticated } from '@/lib/agent-auth';
import { getLeadsSummary } from '@/lib/db';

export async function GET() {
  if (!await isAgentAuthenticated()) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    return Response.json({ summary: await getLeadsSummary() });
  } catch (error) {
    console.error('GET /api/agent/leads failed', error);
    return Response.json({ error: 'Unable to load lead summary.' }, { status: 500 });
  }
}
