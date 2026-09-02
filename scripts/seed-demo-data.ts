/**
 * Deterministic demo-data generator for MoveScan.
 *
 * Creates realistic sessions, rooms, items and quotes so the Insights charts and
 * agent queue have data worth showing. Every generated session is identifiable by
 * a `customer_email` ending in `@seed.movescan.test`; the `--reset` flag only
 * deletes rows with that marker, so real customer data is never touched.
 *
 * The script uses its own Supabase client so it can backdate `created_at` without
 * adding seed-only parameters to the app's production data helpers.
 *
 * Usage:
 *   npm run seed-demo-data
 *   npm run seed-demo-data -- --reset
 *   npm run seed-demo-data -- --sessions 60 --days 21
 */

import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import personas from '../data/demo-personas.json';
import catalogue from '../data/catalogue.json';
import rateCard from '../data/ratecard.json';
import { priceQuote } from '../lib/pricing';
import type { CatalogueEntry, Item, QuoteBreakdown, RateCard, RoomType, SizeClass } from '../lib/types';

const SEED_EMAIL_DOMAIN = '@seed.movescan.test';
const DEFAULT_SESSIONS = 45;
const DEFAULT_DAYS = 21;
const RNG_SEED = 20260902;

const ENTRIES = catalogue as CatalogueEntry[];

const ROOM_TYPES: RoomType[] = [
  'living_room',
  'bedroom',
  'kitchen',
  'dining_room',
  'bathroom',
  'garage',
  'basement',
  'office',
  'other',
];

const CATEGORIES_BY_ROOM: Record<RoomType, string[]> = {
  living_room: [
    'sofa_2seat', 'sofa_3seat', 'sofa_sectional', 'sleeper_sofa', 'armchair', 'recliner',
    'ottoman', 'coffee_table', 'side_table', 'console_table', 'tv', 'tv_stand',
    'floor_lamp', 'table_lamp', 'rug', 'mirror', 'artwork', 'bookcase',
    'piano_upright', 'piano_grand',
  ],
  bedroom: [
    'bed_frame', 'mattress', 'nightstand', 'dresser', 'wardrobe', 'vanity',
    'armchair', 'side_table', 'floor_lamp', 'table_lamp', 'rug', 'mirror',
    'artwork', 'bookcase', 'desk', 'office_chair', 'box_small', 'box_medium',
    'box_large', 'wardrobe_box', 'crib', 'changing_table', 'treadmill', 'exercise_bike',
  ],
  kitchen: [
    'fridge', 'freezer', 'oven', 'dishwasher', 'microwave', 'washer', 'dryer',
    'kitchen_island', 'dining_table', 'dining_chair', 'bar_stool', 'china_cabinet',
    'box_small', 'box_medium', 'box_large',
  ],
  dining_room: [
    'dining_table', 'dining_chair', 'china_cabinet', 'console_table', 'rug',
    'side_table', 'bar_stool', 'mirror', 'artwork', 'piano_upright', 'piano_grand',
  ],
  bathroom: ['vanity', 'mirror', 'rug', 'box_small', 'box_medium'],
  garage: [
    'bicycle', 'treadmill', 'exercise_bike', 'elliptical', 'patio_table', 'patio_chair',
    'grill', 'tool_chest', 'lawn_mower', 'storage_shelf', 'box_small', 'box_medium',
    'box_large', 'wardrobe_box', 'filing_cabinet', 'freezer', 'washer', 'dryer',
  ],
  basement: [
    'bicycle', 'treadmill', 'exercise_bike', 'elliptical', 'patio_table', 'patio_chair',
    'grill', 'tool_chest', 'storage_shelf', 'box_small', 'box_medium', 'box_large',
    'wardrobe_box', 'freezer', 'washer', 'dryer',
  ],
  office: [
    'desk', 'office_chair', 'bookcase', 'filing_cabinet', 'sofa_2seat', 'armchair',
    'side_table', 'floor_lamp', 'table_lamp', 'rug', 'mirror', 'artwork',
    'box_small', 'box_medium', 'box_large',
  ],
  other: ['patio_table', 'patio_chair', 'grill', 'box_small', 'box_medium', 'box_large', 'unknown_item'],
};

const SPECIAL_CATEGORIES = ['piano_upright', 'piano_grand', 'china_cabinet', 'artwork'];

const UNCERTAINTY_REASONS = [
  'partly hidden behind the sofa',
  'only visible from one angle',
  'could not tell the size',
  'partially blocked by a box',
  'glare on the object',
];

const AGENT_NOTES = [
  'Customer confirmed stairs at destination.',
  'Spoke with customer; inventory looks complete.',
  'Added long-carry fee after site notes.',
  'Confirmed piano will need craning.',
  'Adjusted for narrow staircase; customer aware.',
  '',
];

/** Mulberry32 — small, deterministic, good enough for demo shaping. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(RNG_SEED);
const pick = <T,>(items: T[]): T => items[Math.floor(rng() * items.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (p: number) => rng() < p;

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function generateEmail(first: string, last: string, neighborhood: string, index: number): string {
  return `${slugify(first)}.${slugify(last)}.${slugify(neighborhood)}${index}${SEED_EMAIL_DOMAIN}`;
}

function weightedDayIndexes(days: number): number[] {
  const weights: number[] = [];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const base = isWeekend ? 1 : 1.4;
    const jitter = 0.6 + rng() * 0.8; // 0.6–1.4
    weights.push(base * jitter);
  }

  const total = weights.reduce((a, b) => a + b, 0);
  const cumulative = weights.map((_, i) => weights.slice(0, i + 1).reduce((a, b) => a + b, 0) / total);

  return Array.from({ length: days }, () => {
    const r = rng();
    return cumulative.findIndex((c) => r <= c);
  });
}

function randomCreatedAt(dayIndex: number, days: number): string {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  const day = new Date(start);
  day.setUTCDate(day.getUTCDate() + dayIndex);
  const hour = between(8, 20);
  const minute = between(0, 59);
  const second = between(0, 59);
  day.setUTCHours(hour, minute, second, between(0, 999));
  return day.toISOString();
}

function randomSizeClass(): SizeClass {
  const r = rng();
  if (r < 0.2) return 's';
  if (r < 0.8) return 'm';
  return 'l';
}

function randomConfidence(): { confidence: number; uncertaintyReason?: string } {
  const r = rng();
  if (r < 0.8) {
    return { confidence: 0.86 + rng() * 0.14 };
  }
  if (r < 0.92) {
    return { confidence: 0.5 + rng() * 0.2 };
  }
  return {
    confidence: 0.2 + rng() * 0.3,
    uncertaintyReason: pick(UNCERTAINTY_REASONS),
  };
}

function getEntry(category: string): CatalogueEntry {
  return ENTRIES.find((e) => e.category === category) ?? ENTRIES.find((e) => e.category === 'unknown_item')!;
}

function generateItemsForRoom(roomType: RoomType, count: number, forceSpecial: boolean): Item[] {
  const pool = CATEGORIES_BY_ROOM[roomType];
  const chosen: Item[] = [];

  if (forceSpecial) {
    const special = pick(SPECIAL_CATEGORIES);
    const entry = getEntry(special);
    const sizeClass = randomSizeClass();
    const { confidence, uncertaintyReason } = randomConfidence();
    chosen.push({
      id: randomUUID(),
      roomId: '',
      name: entry.label,
      category: special,
      count: 1,
      sizeClass,
      cubicFeet: entry.cubicFeet[sizeClass],
      confidence,
      source: 'ai',
      editedByUser: false,
      ...(uncertaintyReason ? { uncertaintyReason } : {}),
    });
  }

  while (chosen.length < count) {
    const category = pick(pool);
    const entry = getEntry(category);
    const sizeClass = randomSizeClass();
    const { confidence, uncertaintyReason } = randomConfidence();
    chosen.push({
      id: randomUUID(),
      roomId: '',
      name: entry.label,
      category,
      count: 1,
      sizeClass,
      cubicFeet: entry.cubicFeet[sizeClass],
      confidence,
      source: 'ai',
      editedByUser: false,
      ...(uncertaintyReason ? { uncertaintyReason } : {}),
    });
  }

  return chosen;
}

function nudgeSizeClass(sizeClass: SizeClass): SizeClass {
  if (sizeClass === 's') return chance(0.7) ? 'm' : 's';
  if (sizeClass === 'l') return chance(0.7) ? 'm' : 'l';
  return chance(0.5) ? 's' : 'l';
}

interface GeneratedSession {
  id: string;
  customerEmail: string;
  createdAt: string;
  status: 'scanning' | 'reviewing' | 'pending_review' | 'confirmed';
  rooms: {
    id: string;
    roomType: RoomType;
    accessFlags: string[];
    items: Item[];
    createdAt: string;
  }[];
  quote?: {
    breakdown: QuoteBreakdown;
    status: 'pending_review' | 'confirmed';
    confirmedCents?: number;
    agentNotes?: string;
    createdAt: string;
  };
}

function generateSessions(sessionCount: number, days: number): GeneratedSession[] {
  const dayIndexes = weightedDayIndexes(days)
    .map((dayIndex, i) => ({ dayIndex, sortKey: rng() + i }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((d) => d.dayIndex);

  const estimatedCount = Math.round(sessionCount * 0.62);
  const targetPending = Math.min(6, Math.max(4, Math.round(estimatedCount * 0.45)));
  const confirmedCount = estimatedCount - targetPending;

  const statuses: GeneratedSession['status'][] = Array.from({ length: sessionCount }, (_, i) => {
    if (i >= estimatedCount) return 'scanning';
    if (i < confirmedCount) return 'confirmed';
    return 'pending_review';
  });

  const sessions: GeneratedSession[] = [];

  for (let i = 0; i < sessionCount; i++) {
    const first = pick(personas.firstNames);
    const last = pick(personas.lastNames);
    const neighborhood = pick(personas.neighborhoods);
    const customerEmail = generateEmail(first, last, neighborhood, i);
    const createdAt = randomCreatedAt(dayIndexes[i] ?? 0, days);
    const status = statuses[i];

    const roomCount = between(2, 5);
    const roomTypePool = ROOM_TYPES.filter((rt) => rt !== 'other');
    const roomTypes: RoomType[] = [];
    while (roomTypes.length < roomCount) {
      const candidate = roomTypes.length === roomCount - 1 && chance(0.15) ? 'other' : pick(roomTypePool);
      roomTypes.push(candidate);
    }

    const includeSpecial = chance(1 / 6);
    const specialRoomIndex = includeSpecial ? between(0, roomCount - 1) : -1;

    const rooms = roomTypes.map((roomType, roomIndex) => {
      const itemCount = between(4, 12);
      const items = generateItemsForRoom(roomType, itemCount, roomIndex === specialRoomIndex);
      const accessFlags: string[] = [];
      if (chance(0.2)) accessFlags.push('stairs');
      if (chance(0.1)) accessFlags.push('elevator');
      if (chance(0.08)) accessFlags.push('long_carry');

      return {
        id: randomUUID(),
        roomType,
        accessFlags: [...new Set(accessFlags)],
        items,
        createdAt,
      };
    });

    let quote: GeneratedSession['quote'] | undefined;
    if (status === 'confirmed' || status === 'pending_review') {
      const allItems = rooms.flatMap((r) => r.items);
      const allAccessFlags = rooms.flatMap((r) => r.accessFlags) as import('../lib/types').AccessFlag[];
      const breakdown = priceQuote(allItems, allAccessFlags, rateCard as RateCard);

      if (status === 'confirmed') {
        const editTarget = Math.max(1, Math.floor(allItems.length * (0.1 + rng() * 0.04)));
        let edited = 0;
        while (edited < editTarget) {
          const item = pick(allItems);
          if (!item.editedByUser) {
            item.editedByUser = true;
            item.sizeClass = nudgeSizeClass(item.sizeClass);
            item.cubicFeet = getEntry(item.category).cubicFeet[item.sizeClass];
            edited++;
          }
        }

        const confirmedBreakdown = priceQuote(allItems, allAccessFlags, rateCard as RateCard);
        const variance = 0.96 + rng() * 0.08;
        quote = {
          breakdown: confirmedBreakdown,
          status: 'confirmed',
          confirmedCents: Math.round(confirmedBreakdown.subtotalCents * variance),
          agentNotes: pick(AGENT_NOTES) || undefined,
          createdAt,
        };
      } else {
        quote = {
          breakdown,
          status: 'pending_review',
          createdAt,
        };
      }
    }

    sessions.push({
      id: randomUUID(),
      customerEmail,
      createdAt,
      status,
      rooms,
      quote,
    });
  }

  return sessions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function makeClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resetDemoData(client: ReturnType<typeof makeClient>) {
  const { data, error } = await client
    .from('sessions')
    .select('id')
    .like('customer_email', `%${SEED_EMAIL_DOMAIN}`);
  if (error) throw new Error(`reset select failed: ${error.message}`);

  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
  if (!ids.length) {
    console.log('No existing demo rows to reset.');
    return 0;
  }

  const { error: deleteError } = await client.from('sessions').delete().in('id', ids);
  if (deleteError) throw new Error(`reset delete failed: ${deleteError.message}`);
  console.log(`Reset removed ${ids.length} demo session(s).`);
  return ids.length;
}

async function insertSessions(client: ReturnType<typeof makeClient>, sessions: GeneratedSession[]) {
  const { error } = await client.from('sessions').insert(
    sessions.map((s) => ({
      id: s.id,
      customer_email: s.customerEmail,
      status: s.status,
      created_at: s.createdAt,
    })),
  );
  if (error) throw new Error(`insert sessions failed: ${error.message}`);
}

async function insertRooms(client: ReturnType<typeof makeClient>, sessions: GeneratedSession[]) {
  const rows = sessions.flatMap((s) =>
    s.rooms.map((r) => ({
      id: r.id,
      session_id: s.id,
      room_type: r.roomType,
      access_flags: r.accessFlags,
      created_at: r.createdAt,
    })),
  );
  const { error } = await client.from('rooms').insert(rows);
  if (error) throw new Error(`insert rooms failed: ${error.message}`);
}

async function insertItems(client: ReturnType<typeof makeClient>, sessions: GeneratedSession[]) {
  const rows = sessions.flatMap((s) =>
    s.rooms.flatMap((r) =>
      r.items.map((item) => ({
        id: item.id,
        room_id: r.id,
        name: item.name,
        category: item.category,
        count: item.count,
        size_class: item.sizeClass,
        cubic_feet: item.cubicFeet,
        confidence: Number(item.confidence.toFixed(2)),
        source: item.source,
        edited_by_user: item.editedByUser,
        uncertainty_reason: item.uncertaintyReason ?? null,
        seen_in_images: null,
        created_at: r.createdAt,
      })),
    ),
  );

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await client.from('items').insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`insert items failed: ${error.message}`);
  }
}

async function insertQuotes(client: ReturnType<typeof makeClient>, sessions: GeneratedSession[]) {
  const rows = sessions
    .filter((s): s is GeneratedSession & { quote: NonNullable<GeneratedSession['quote']> } => Boolean(s.quote))
    .map((s) => ({
      id: randomUUID(),
      session_id: s.id,
      breakdown: s.quote.breakdown,
      status: s.quote.status,
      confirmed_cents: s.quote.confirmedCents ?? null,
      agent_notes: s.quote.agentNotes ?? null,
      created_at: s.quote.createdAt,
    }));

  if (!rows.length) return;
  const { error } = await client.from('quotes').insert(rows);
  if (error) throw new Error(`insert quotes failed: ${error.message}`);
}

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function printSummary(sessions: GeneratedSession[]) {
  const total = sessions.length;
  const estimated = sessions.filter((s) => s.quote).length;
  const confirmed = sessions.filter((s) => s.status === 'confirmed').length;
  const pending = sessions.filter((s) => s.status === 'pending_review').length;
  const scanning = sessions.filter((s) => s.status === 'scanning').length;

  const dates = sessions.map((s) => new Date(s.createdAt));
  const firstDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const lastDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const subtotals = sessions
    .filter((s) => s.quote)
    .map((s) => s.quote!.breakdown.subtotalCents)
    .sort((a, b) => a - b);
  const medianCents = subtotals.length
    ? subtotals.length % 2 === 0
      ? Math.round((subtotals[subtotals.length / 2 - 1] + subtotals[subtotals.length / 2]) / 2)
      : subtotals[Math.floor(subtotals.length / 2)]
    : 0;

  const totalCuFt = sessions
    .filter((s) => s.quote)
    .reduce((sum, s) => sum + s.quote!.breakdown.totalCubicFeet, 0);

  const editRates = sessions
    .filter((s) => s.status === 'confirmed')
    .map((s) => {
      const items = s.rooms.flatMap((r) => r.items);
      return items.filter((i) => i.editedByUser).length / items.length;
    });
  const meanEditRate = editRates.length
    ? editRates.reduce((a, b) => a + b, 0) / editRates.length
    : 0;

  console.log('\nDemo data seeded.');
  console.log('');
  console.log('Funnel');
  console.log(`  Sessions created      ${total}`);
  console.log(`  Reached estimate      ${estimated}`);
  console.log(`  Confirmed by agent    ${confirmed}`);
  console.log(`  Pending review        ${pending}`);
  console.log(`  Abandoned (scanning)  ${scanning}`);
  console.log('');
  console.log(`Date span    ${firstDate.toISOString().slice(0, 10)} → ${lastDate.toISOString().slice(0, 10)}`);
  console.log(`Median estimate   ${formatCents(medianCents)}`);
  console.log(`Total cubic feet  ${Math.round(totalCuFt).toLocaleString('en-US')} cu ft`);
  console.log(`Mean edit rate    ${(meanEditRate * 100).toFixed(1)}%`);
  console.log('');
  console.log('Open /agent/leads and compare these numbers to the charts.');
}

function parseArgs(argv: string[]) {
  let reset = false;
  let sessions = DEFAULT_SESSIONS;
  let days = DEFAULT_DAYS;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--reset') reset = true;
    else if (arg === '--sessions') {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) sessions = value;
    } else if (arg === '--days') {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) days = value;
    }
  }

  return { reset, sessions, days };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = makeClient();

  if (args.reset) {
    await resetDemoData(client);
  }

  console.log(`Generating ${args.sessions} demo session(s) over ${args.days} day(s)...`);
  const sessions = generateSessions(args.sessions, args.days);

  await insertSessions(client, sessions);
  await insertRooms(client, sessions);
  await insertItems(client, sessions);
  await insertQuotes(client, sessions);

  printSummary(sessions);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
