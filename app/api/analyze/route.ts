import { getCaptureBase64, replaceItems, saveCapture, updateRoomType } from '@/lib/db';
import { analyzeRoom } from '@/lib/gemini';
import { resolveCubicFeet } from '@/lib/catalogue';
import type { RoomType } from '@/lib/types';

const roomTypes: RoomType[] = [
  'living_room', 'bedroom', 'kitchen', 'dining_room', 'bathroom',
  'garage', 'basement', 'office', 'other',
];

export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      return Response.json({ error: 'Upload room images as multipart form data.' }, { status: 400 });
    }
    const formData = await request.formData();
    const roomId = formData.get('roomId');
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
    const roomTypeValue = formData.get('roomType');
    const hint = roomTypes.includes(roomTypeValue as RoomType) ? roomTypeValue as RoomType : undefined;

    if (typeof roomId !== 'string' || !roomId) {
      return Response.json({ error: 'roomId is required.' }, { status: 400 });
    }
    if (!files.length) return Response.json({ error: 'At least one image is required.' }, { status: 400 });
    if (files.length > 12) return Response.json({ error: 'Upload no more than 12 images.' }, { status: 400 });
    if (files.some((file) => !file.type.startsWith('image/') || file.size > 1 * 1024 * 1024)) {
      return Response.json({ error: 'Each upload must be an image no larger than 1 MB.' }, { status: 400 });
    }

    await Promise.all(files.map(async (file) => {
      await saveCapture(roomId, Buffer.from(await file.arrayBuffer()), file.type);
    }));
    const images = await getCaptureBase64(roomId);
    const result = await analyzeRoom(images, hint);
    const items = await replaceItems(roomId, result.analysis.items.map((item) => ({
      ...item,
      cubicFeet: resolveCubicFeet(item.category, item.sizeClass),
      source: 'ai' as const,
      editedByUser: false,
    })));
    await updateRoomType(roomId, result.analysis.roomType);
    return Response.json({ items, roomType: result.analysis.roomType, demoMode: result.demoMode, degraded: result.degraded });
  } catch (error) {
    console.error('POST /api/analyze failed', error);
    return Response.json({ error: 'Unable to analyse this room. Please try again.' }, { status: 500 });
  }
}
