import { getCaptureBase64, getItem, updateItem } from '@/lib/db';
import { refineItem } from '@/lib/gemini';
import { resolveCubicFeet } from '@/lib/catalogue';
import { isUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isUuid(body.itemId)) {
      return Response.json({ error: 'A valid itemId is required.' }, { status: 400 });
    }
    const item = await getItem(body.itemId);
    if (!item) return Response.json({ error: 'Item not found.' }, { status: 404 });
    if (item.confidence >= 0.7 && !item.ambiguousBetween?.length) {
      return Response.json({ item, demoMode: false });
    }

    const candidates = item.ambiguousBetween?.length ? item.ambiguousBetween : [item.category];
    const refinement = await refineItem(
      await getCaptureBase64(item.roomId),
      item.name,
      candidates,
    );

    if (refinement.demoMode) {
      return Response.json({ item, demoMode: true, degraded: refinement.degraded, refined: false });
    }

    const allowed = new Set(candidates);
    const category = allowed.has(refinement.category) ? refinement.category : item.category;
    const updated = await updateItem(item.id, {
      category,
      sizeClass: refinement.sizeClass,
      confidence: refinement.confidence,
      cubicFeet: resolveCubicFeet(category, refinement.sizeClass),
      source: 'refined',
      ambiguousBetween: [],
    }, false);
    return Response.json({ item: updated, demoMode: false, degraded: refinement.degraded, refined: true });
  } catch (error) {
    console.error('POST /api/refine failed', error);
    return Response.json({ error: 'Unable to refine this item.' }, { status: 500 });
  }
}
