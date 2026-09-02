import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getHandling } from './catalogue';
import type {
  AccessFlag,
  ImageInput,
  Item,
  ItemSource,
  Quote,
  QuoteBreakdown,
  QuoteStatus,
  QuoteSummary,
  Room,
  RoomType,
  SessionDetails,
  SessionStatus,
  SizeClass,
} from './types';

type ItemInput = Omit<Item, 'id' | 'roomId'>;
type ItemPatch = Partial<Pick<Item, 'name' | 'category' | 'count' | 'sizeClass' | 'cubicFeet' | 'confidence' | 'source' | 'ambiguousBetween'>>;
type Row = Record<string, unknown>;

export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function required<T>(value: T | null, operation: string): T {
  if (value === null) throw new Error(`${operation} returned no data`);
  return value;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function rowToItem(row: Row): Item {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    name: String(row.name),
    category: String(row.category),
    count: asNumber(row.count),
    sizeClass: row.size_class as SizeClass,
    cubicFeet: asNumber(row.cubic_feet),
    confidence: asNumber(row.confidence),
    source: row.source as ItemSource,
    editedByUser: Boolean(row.edited_by_user),
    ...(Array.isArray(row.ambiguous_between) && row.ambiguous_between.length
      ? { ambiguousBetween: row.ambiguous_between.map(String) }
      : {}),
    ...(typeof row.uncertainty_reason === 'string' && row.uncertainty_reason
      ? { uncertaintyReason: row.uncertainty_reason }
      : {}),
    ...(Array.isArray(row.seen_in_images) && row.seen_in_images.length
      ? { seenInImages: row.seen_in_images.map(asNumber) }
      : {}),
  };
}

function rowToQuote(row: Row): Quote {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    breakdown: row.breakdown as QuoteBreakdown,
    status: row.status as QuoteStatus,
    ...(typeof row.confirmed_cents === 'number' ? { confirmedCents: row.confirmed_cents } : {}),
    ...(typeof row.agent_notes === 'string' ? { agentNotes: row.agent_notes } : {}),
    ...(typeof row.created_at === 'string' ? { createdAt: row.created_at } : {}),
  };
}

function rowToRoom(row: Row, items: Item[], capturePaths: string[]): Room {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    roomType: row.room_type as RoomType,
    accessFlags: Array.isArray(row.access_flags) ? row.access_flags.map(String) as AccessFlag[] : [],
    items,
    capturePaths,
  };
}

export async function createSession(): Promise<string> {
  const { data, error } = await db().from('sessions').insert({}).select('id').single();
  if (error) throw new Error(`createSession failed: ${error.message}`);
  return String(required(data as Row | null, 'createSession').id);
}

export async function createRoom(sessionId: string, roomType: RoomType = 'other'): Promise<string> {
  const { data, error } = await db()
    .from('rooms')
    .insert({ session_id: sessionId, room_type: roomType })
    .select('id')
    .single();
  if (error) throw new Error(`createRoom failed: ${error.message}`);
  return String(required(data as Row | null, 'createRoom').id);
}

export async function updateRoomType(roomId: string, roomType: RoomType): Promise<void> {
  const { error } = await db().from('rooms').update({ room_type: roomType }).eq('id', roomId);
  if (error) throw new Error(`updateRoomType failed: ${error.message}`);
}

export async function saveCapture(roomId: string, file: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `${roomId}/${crypto.randomUUID()}.${extension}`;
  const client = db();
  const { error: uploadError } = await client.storage
    .from('captures')
    .upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(`saveCapture upload failed: ${uploadError.message}`);

  const { error: insertError } = await client
    .from('captures')
    .insert({ room_id: roomId, storage_path: storagePath });
  if (insertError) throw new Error(`saveCapture insert failed: ${insertError.message}`);
  return storagePath;
}

export async function getCaptureBase64(roomId: string): Promise<ImageInput[]> {
  const client = db();
  const { data, error } = await client
    .from('captures')
    .select('storage_path')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(`getCaptureBase64 failed: ${error.message}`);

  return Promise.all(((data ?? []) as Row[]).map(async (capture) => {
    const storagePath = String(capture.storage_path);
    const { data: blob, error: downloadError } = await client.storage.from('captures').download(storagePath);
    if (downloadError) throw new Error(`getCaptureBase64 download failed: ${downloadError.message}`);
    const bytes = Buffer.from(await blob.arrayBuffer());
    return { base64: bytes.toString('base64'), mimeType: blob.type || 'image/jpeg' };
  }));
}

export async function getCaptureSignedUrls(roomId: string): Promise<string[]> {
  const client = db();
  const { data, error } = await client
    .from('captures')
    .select('storage_path')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getCaptureSignedUrls failed: ${error.message}`);

  const paths = ((data ?? []) as Row[]).map((capture) => String(capture.storage_path));
  if (!paths.length) return [];
  const { data: signed, error: signedError } = await client.storage
    .from('captures')
    .createSignedUrls(paths, 60 * 60);
  if (signedError) throw new Error(`getCaptureSignedUrls failed: ${signedError.message}`);
  return signed.map((entry) => entry.signedUrl).filter((url): url is string => Boolean(url));
}

export async function replaceItems(roomId: string, items: ItemInput[]): Promise<Item[]> {
  const client = db();
  const { error: deleteError } = await client.from('items').delete().eq('room_id', roomId);
  if (deleteError) throw new Error(`replaceItems delete failed: ${deleteError.message}`);
  if (!items.length) return [];

  const rows = items.map((item) => ({
    room_id: roomId,
    name: item.name,
    category: item.category,
    count: item.count,
    size_class: item.sizeClass,
    cubic_feet: item.cubicFeet,
    confidence: item.confidence,
    source: item.source,
    edited_by_user: item.editedByUser,
    ambiguous_between: item.ambiguousBetween ?? null,
    uncertainty_reason: item.uncertaintyReason ?? null,
    seen_in_images: item.seenInImages ?? null,
  }));
  const { data, error } = await client.from('items').insert(rows).select();
  if (error) throw new Error(`replaceItems insert failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToItem);
}

export async function updateItem(itemId: string, patch: ItemPatch, markEdited = true): Promise<Item> {
  const update = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.category === undefined ? {} : { category: patch.category }),
    ...(patch.count === undefined ? {} : { count: patch.count }),
    ...(patch.sizeClass === undefined ? {} : { size_class: patch.sizeClass }),
    ...(patch.cubicFeet === undefined ? {} : { cubic_feet: patch.cubicFeet }),
    ...(patch.confidence === undefined ? {} : { confidence: patch.confidence }),
    ...(patch.source === undefined ? {} : { source: patch.source }),
    ...(patch.ambiguousBetween === undefined ? {} : { ambiguous_between: patch.ambiguousBetween }),
    ...(markEdited ? { edited_by_user: true } : {}),
  };
  const { data, error } = await db().from('items').update(update).eq('id', itemId).select().single();
  if (error) throw new Error(`updateItem failed: ${error.message}`);
  return rowToItem(required(data as Row | null, 'updateItem'));
}

export async function createItem(roomId: string, item: ItemInput): Promise<Item> {
  const { data, error } = await db().from('items').insert({
    room_id: roomId,
    name: item.name,
    category: item.category,
    count: item.count,
    size_class: item.sizeClass,
    cubic_feet: item.cubicFeet,
    confidence: item.confidence,
    source: item.source,
    edited_by_user: item.editedByUser,
    ambiguous_between: item.ambiguousBetween ?? null,
  }).select().single();
  if (error) throw new Error(`createItem failed: ${error.message}`);
  return rowToItem(required(data as Row | null, 'createItem'));
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await db().from('items').delete().eq('id', itemId);
  if (error) throw new Error(`deleteItem failed: ${error.message}`);
}

export async function getItem(itemId: string): Promise<Item | null> {
  const { data, error } = await db().from('items').select().eq('id', itemId).maybeSingle();
  if (error) throw new Error(`getItem failed: ${error.message}`);
  return data ? rowToItem(data as Row) : null;
}

export async function setAccessFlags(roomId: string, flags: AccessFlag[]): Promise<void> {
  const { error } = await db().from('rooms').update({ access_flags: [...new Set(flags)] }).eq('id', roomId);
  if (error) throw new Error(`setAccessFlags failed: ${error.message}`);
}

export async function getSessionRooms(sessionId: string): Promise<Room[]> {
  const client = db();
  const { data: roomRows, error: roomsError } = await client
    .from('rooms')
    .select()
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (roomsError) throw new Error(`getSessionRooms failed: ${roomsError.message}`);
  const rooms = (roomRows ?? []) as Row[];
  if (!rooms.length) return [];
  const roomIds = rooms.map((room) => String(room.id));
  const [{ data: itemRows, error: itemsError }, { data: captureRows, error: capturesError }] = await Promise.all([
    client.from('items').select().in('room_id', roomIds),
    client.from('captures').select('room_id, storage_path').in('room_id', roomIds),
  ]);
  if (itemsError) throw new Error(`getSessionRooms items failed: ${itemsError.message}`);
  if (capturesError) throw new Error(`getSessionRooms captures failed: ${capturesError.message}`);

  const itemsByRoom = new Map<string, Item[]>();
  for (const row of (itemRows ?? []) as Row[]) {
    const item = rowToItem(row);
    const current = itemsByRoom.get(item.roomId) ?? [];
    current.push(item);
    itemsByRoom.set(item.roomId, current);
  }
  const capturesByRoom = new Map<string, string[]>();
  for (const capture of (captureRows ?? []) as Row[]) {
    const roomId = String(capture.room_id);
    const current = capturesByRoom.get(roomId) ?? [];
    current.push(String(capture.storage_path));
    capturesByRoom.set(roomId, current);
  }

  return rooms.map((room) => {
    const roomId = String(room.id);
    return rowToRoom(room, itemsByRoom.get(roomId) ?? [], capturesByRoom.get(roomId) ?? []);
  });
}

export async function getSession(sessionId: string): Promise<SessionDetails | null> {
  const client = db();
  const { data, error } = await client.from('sessions').select().eq('id', sessionId).maybeSingle();
  if (error) throw new Error(`getSession failed: ${error.message}`);
  if (!data) return null;
  const rooms = await getSessionRooms(sessionId);
  const latestQuote = await getLatestQuoteForSession(sessionId);
  const row = data as Row;
  return {
    id: String(row.id),
    ...(typeof row.customer_email === 'string' ? { customerEmail: row.customer_email } : {}),
    status: row.status as SessionStatus,
    rooms,
    ...(latestQuote ? { latestQuote } : {}),
  };
}

async function getLatestQuoteForSession(sessionId: string): Promise<Quote | null> {
  const { data, error } = await db()
    .from('quotes')
    .select()
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestQuoteForSession failed: ${error.message}`);
  return data ? rowToQuote(data as Row) : null;
}

export async function saveQuote(sessionId: string, breakdown: QuoteBreakdown): Promise<Quote> {
  const client = db();
  const { data: existing, error: existingError } = await client
    .from('quotes')
    .select()
    .eq('session_id', sessionId)
    .neq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`saveQuote lookup failed: ${existingError.message}`);

  if (existing) {
    const { data, error } = await client
      .from('quotes')
      .update({ breakdown, status: 'pending_review' })
      .eq('id', (existing as Row).id as string)
      .select()
      .single();
    if (error) throw new Error(`saveQuote update failed: ${error.message}`);
    return rowToQuote(required(data as Row | null, 'saveQuote'));
  }

  const { data, error } = await client
    .from('quotes')
    .insert({ session_id: sessionId, breakdown, status: 'pending_review' })
    .select()
    .single();
  if (error) throw new Error(`saveQuote insert failed: ${error.message}`);
  return rowToQuote(required(data as Row | null, 'saveQuote'));
}

export async function getQuote(quoteId: string): Promise<Quote | null> {
  const { data, error } = await db().from('quotes').select().eq('id', quoteId).maybeSingle();
  if (error) throw new Error(`getQuote failed: ${error.message}`);
  return data ? rowToQuote(data as Row) : null;
}

export async function listPendingQuotes(): Promise<QuoteSummary[]> {
  const client = db();
  const { data, error } = await client
    .from('quotes')
    .select()
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listPendingQuotes failed: ${error.message}`);
  const quotes = ((data ?? []) as Row[]).map(rowToQuote);
  return Promise.all(quotes.map(async (quote) => {
    const rooms = await getSessionRooms(quote.sessionId);
    const items = rooms.flatMap((room) => room.items);

    const { data: sessionRow } = await client
      .from('sessions')
      .select('customer_email')
      .eq('id', quote.sessionId)
      .maybeSingle();
    const email = (sessionRow as Row | null)?.customer_email;

    return {
      ...quote,
      roomCount: rooms.length,
      itemCount: items.length,
      totalCubicFeet: Math.round(items.reduce((sum, i) => sum + i.cubicFeet * i.count, 0) * 10) / 10,
      handling: [...new Set(items.flatMap((i) => getHandling(i.category)))],
      ...(typeof email === 'string' && email ? { customerEmail: email } : {}),
    };
  }));
}

export async function confirmQuote(quoteId: string, cents: number, notes: string): Promise<Quote> {
  const { data, error } = await db().from('quotes').update({
    status: 'confirmed',
    confirmed_cents: cents,
    agent_notes: notes,
  }).eq('id', quoteId).select().single();
  if (error) throw new Error(`confirmQuote failed: ${error.message}`);
  const quote = rowToQuote(required(data as Row | null, 'confirmQuote'));
  const { error: sessionError } = await db()
    .from('sessions')
    .update({ status: 'confirmed' })
    .eq('id', quote.sessionId);
  if (sessionError) throw new Error(`confirmQuote session update failed: ${sessionError.message}`);
  return quote;
}

export async function setSessionEmail(sessionId: string, email: string): Promise<void> {
  const { error } = await db()
    .from('sessions')
    .update({ customer_email: email, status: 'pending_review' })
    .eq('id', sessionId);
  if (error) throw new Error(`setSessionEmail failed: ${error.message}`);
}

export interface LeadsSummary {
  totalScans: number;
  estimatedScans: number;
  confirmedScans: number;
  medianEstimateCents: number;
  totalCubicFeet: number;
  meanEditRate: number;
  pendingCount: number;
}

export async function getLeadsSummary(): Promise<LeadsSummary> {
  const client = db();

  const { data: sessions, error: sessionError } = await client.from('sessions').select('id');
  if (sessionError) throw new Error(`getLeadsSummary sessions failed: ${sessionError.message}`);
  const totalScans = (sessions ?? []).length;

  const { data: quotes, error: quoteError } = await client.from('quotes').select();
  if (quoteError) throw new Error(`getLeadsSummary quotes failed: ${quoteError.message}`);
  const allQuotes = ((quotes ?? []) as Row[]).map(rowToQuote);

  const estimatedScans = new Set(allQuotes.map((q) => q.sessionId)).size;
  const confirmedQuotes = allQuotes.filter((q) => q.status === 'confirmed');
  const confirmedScans = confirmedQuotes.length;

  const subtotals = allQuotes.map((q) => q.breakdown.subtotalCents).sort((a, b) => a - b);
  const medianEstimateCents = subtotals.length
    ? subtotals.length % 2 === 0
      ? (subtotals[subtotals.length / 2 - 1] + subtotals[subtotals.length / 2]) / 2
      : subtotals[Math.floor(subtotals.length / 2)]
    : 0;

  const totalCubicFeet = allQuotes.reduce((sum, q) => sum + q.breakdown.totalCubicFeet, 0);

  const editRates: number[] = [];
  for (const quote of confirmedQuotes) {
    const rooms = await getSessionRooms(quote.sessionId);
    const items = rooms.flatMap((r) => r.items);
    if (items.length) {
      editRates.push(items.filter((i) => i.editedByUser).length / items.length);
    }
  }
  const meanEditRate = editRates.length
    ? editRates.reduce((a, b) => a + b, 0) / editRates.length
    : 0;

  const pendingCount = allQuotes.filter((q) => q.status === 'pending_review').length;

  return { totalScans, estimatedScans, confirmedScans, medianEstimateCents, totalCubicFeet, meanEditRate, pendingCount };
}
