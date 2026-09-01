import livingRoom from '../lib/fixtures/living_room.json';
import bedroom from '../lib/fixtures/bedroom.json';
import { resolveCubicFeet } from '../lib/catalogue';
import {
  createRoom,
  createSession,
  getSessionRooms,
  replaceItems,
  saveQuote,
  setAccessFlags,
  setSessionEmail,
} from '../lib/db';
import { priceQuote } from '../lib/pricing';
import rateCard from '../data/ratecard.json';
import type { AccessFlag, RateCard } from '../lib/types';

async function seed() {
  const sessionId = await createSession();
  const livingRoomId = await createRoom(sessionId, 'living_room');
  const bedroomId = await createRoom(sessionId, 'bedroom');
  await setAccessFlags(livingRoomId, ['stairs']);
  await setAccessFlags(bedroomId, []);

  await replaceItems(livingRoomId, livingRoom.items.map((item) => ({
    ...item,
    cubicFeet: resolveCubicFeet(item.category, item.sizeClass),
    source: 'ai' as const,
    editedByUser: false,
  })));
  await replaceItems(bedroomId, bedroom.items.map((item) => ({
    ...item,
    cubicFeet: resolveCubicFeet(item.category, item.sizeClass),
    source: 'ai' as const,
    editedByUser: false,
  })));

  const rooms = await getSessionRooms(sessionId);
  const accessFlags = [...new Set(rooms.flatMap((room) => room.accessFlags))] as AccessFlag[];
  const quote = await saveQuote(
    sessionId,
    priceQuote(rooms.flatMap((room) => room.items), accessFlags, rateCard as RateCard),
  );
  await setSessionEmail(sessionId, 'demo@meridianmoving.example');
  console.log(`Seeded session ${sessionId} with pending quote ${quote.id}`);
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
