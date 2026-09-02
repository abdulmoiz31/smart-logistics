import { isAgentAuthenticated } from '@/lib/agent-auth';
import { getLeadsSummary, getLeadsTrend, getVolumeComposition } from '@/lib/db';

export async function GET(request: Request) {
  if (!await isAgentAuthenticated(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const [summary, trend, composition] = await Promise.all([
      getLeadsSummary(),
      getLeadsTrend(),
      getVolumeComposition(),
    ]);
    return Response.json({ summary, trend, composition });
  } catch (error) {
    console.error('GET /api/agent/leads failed', error);
    return Response.json({ error: 'Unable to load lead summary.' }, { status: 500 });
  }
}
