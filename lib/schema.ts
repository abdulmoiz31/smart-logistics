import { CATEGORY_IDS } from './catalogue';
import type { DetectedItem, RoomAnalysis, RoomType, SizeClass } from './types';

export class SchemaError extends Error {}

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
const SIZE_CLASSES: SizeClass[] = ['s', 'm', 'l'];

export const ROOM_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    roomType: { type: 'string', enum: ROOM_TYPES },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: CATEGORY_IDS },
          count: { type: 'integer' },
          sizeClass: { type: 'string', enum: SIZE_CLASSES },
          confidence: { type: 'number' },
          ambiguousBetween: { type: 'array', items: { type: 'string' } },
          uncertaintyReason: { type: 'string' },
          seenInImages: { type: 'array', items: { type: 'integer' } },
        },
        required: ['name', 'category', 'count', 'sizeClass', 'confidence'],
      },
    },
  },
  required: ['roomType', 'items'],
} as const;

export const REFINE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORY_IDS },
    sizeClass: { type: 'string', enum: SIZE_CLASSES },
    confidence: { type: 'number' },
  },
  required: ['category', 'sizeClass', 'confidence'],
} as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseItem(raw: unknown, imageCount: number): DetectedItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== 'string' || value.name.trim() === '') return null;

  const count = typeof value.count === 'number' && Number.isFinite(value.count)
    ? Math.max(1, Math.round(value.count))
    : 1;
  const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence)
    ? clamp01(value.confidence)
    : 0.5;
  const category = typeof value.category === 'string' && CATEGORY_IDS.includes(value.category)
    ? value.category
    : 'unknown_item';
  const sizeClass = SIZE_CLASSES.includes(value.sizeClass as SizeClass)
    ? (value.sizeClass as SizeClass)
    : 'm';
  const ambiguousBetween = Array.isArray(value.ambiguousBetween)
    ? value.ambiguousBetween.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
  const uncertaintyReason = typeof value.uncertaintyReason === 'string' && value.uncertaintyReason.trim()
    ? value.uncertaintyReason.trim().slice(0, 120)
    : undefined;
  const seenInImages = Array.isArray(value.seenInImages)
    ? value.seenInImages.filter(
        (n): n is number => Number.isInteger(n) && n >= 1 && n <= imageCount,
      )
    : undefined;

  return {
    name: value.name.trim(),
    category,
    count,
    sizeClass,
    confidence,
    ...(ambiguousBetween?.length ? { ambiguousBetween } : {}),
    ...(uncertaintyReason ? { uncertaintyReason } : {}),
    ...(seenInImages?.length ? { seenInImages } : {}),
  };
}

export function parseRoomAnalysis(raw: unknown, imageCount = 12): RoomAnalysis {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError('response is not an object');
  }
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.items)) {
    throw new SchemaError('items is not an array');
  }

  return {
    roomType: ROOM_TYPES.includes(value.roomType as RoomType)
      ? (value.roomType as RoomType)
      : 'other',
    items: value.items.map((item) => parseItem(item, imageCount)).filter((item): item is DetectedItem => item !== null),
  };
}

export function parseRefinement(raw: unknown): Pick<DetectedItem, 'category' | 'sizeClass' | 'confidence'> {
  if (typeof raw !== 'object' || raw === null) {
    throw new SchemaError('refinement is not an object');
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.category !== 'string' || typeof value.sizeClass !== 'string') {
    throw new SchemaError('refinement is missing category or sizeClass');
  }

  return {
    category: CATEGORY_IDS.includes(value.category) ? value.category : 'unknown_item',
    sizeClass: SIZE_CLASSES.includes(value.sizeClass as SizeClass)
      ? (value.sizeClass as SizeClass)
      : 'm',
    confidence: typeof value.confidence === 'number' && Number.isFinite(value.confidence)
      ? clamp01(value.confidence)
      : 0.5,
  };
}
