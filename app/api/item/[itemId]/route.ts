import { deleteItem, getItem, updateItem } from '@/lib/db';
import { getEntry, resolveCubicFeet } from '@/lib/catalogue';
import type { SizeClass } from '@/lib/types';
import { isUuid } from '@/lib/validation';

const sizeClasses: SizeClass[] = ['s', 'm', 'l'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await params;
    if (!isUuid(itemId)) return Response.json({ error: 'Invalid item ID.' }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const current = await getItem(itemId);
    if (!current) return Response.json({ error: 'Item not found.' }, { status: 404 });
    if (body.count !== undefined && (!Number.isInteger(body.count) || (body.count as number) < 1)) {
      return Response.json({ error: 'count must be a positive integer.' }, { status: 400 });
    }
    if (body.sizeClass !== undefined && !sizeClasses.includes(body.sizeClass as SizeClass)) {
      return Response.json({ error: 'Invalid size class.' }, { status: 400 });
    }
    if (body.category !== undefined && typeof body.category !== 'string') {
      return Response.json({ error: 'Invalid category.' }, { status: 400 });
    }

    const category = typeof body.category === 'string' ? getEntry(body.category).category : current.category;
    const sizeClass = body.sizeClass === undefined ? current.sizeClass : body.sizeClass as SizeClass;
    const item = await updateItem(itemId, {
      ...(body.count === undefined ? {} : { count: body.count as number }),
      category,
      sizeClass,
      cubicFeet: resolveCubicFeet(category, sizeClass),
    });
    return Response.json({ item });
  } catch (error) {
    console.error('PATCH /api/item/[itemId] failed', error);
    return Response.json({ error: 'Unable to update this item.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await params;
    if (!isUuid(itemId)) return Response.json({ error: 'Invalid item ID.' }, { status: 400 });
    await deleteItem(itemId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/item/[itemId] failed', error);
    return Response.json({ error: 'Unable to remove this item.' }, { status: 500 });
  }
}
