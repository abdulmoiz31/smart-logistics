import { createItem } from '@/lib/db';
import { getEntry, resolveCubicFeet } from '@/lib/catalogue';
import type { SizeClass } from '@/lib/types';

const sizeClasses: SizeClass[] = ['s', 'm', 'l'];

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.roomId !== 'string' || typeof body.category !== 'string' || !sizeClasses.includes(body.sizeClass as SizeClass)) {
      return Response.json({ error: 'roomId, category, and a valid sizeClass are required.' }, { status: 400 });
    }
    const entry = getEntry(body.category);
    const item = await createItem(body.roomId, {
      name: entry.label,
      category: entry.category,
      count: 1,
      sizeClass: body.sizeClass as SizeClass,
      cubicFeet: resolveCubicFeet(entry.category, body.sizeClass as SizeClass),
      confidence: 1,
      source: 'user_added',
      editedByUser: true,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    console.error('POST /api/item failed', error);
    return Response.json({ error: 'Unable to add this item.' }, { status: 500 });
  }
}
