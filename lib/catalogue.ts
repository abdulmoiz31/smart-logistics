import rawCatalogue from '../data/catalogue.json';
import type { CatalogueEntry, RoomType, SizeClass } from './types';

const entries = rawCatalogue as CatalogueEntry[];
const byCategory = new Map(entries.map((entry) => [entry.category, entry]));
const fallback = byCategory.get('unknown_item');

if (!fallback) {
  throw new Error('catalogue.json must contain an unknown_item entry');
}

const defaultEntry: CatalogueEntry = fallback;

export const CATEGORY_IDS = entries.map((entry) => entry.category);

export function getEntry(category: string): CatalogueEntry {
  return byCategory.get(category) ?? defaultEntry;
}

export function resolveCubicFeet(category: string, sizeClass: SizeClass): number {
  return getEntry(category).cubicFeet[sizeClass];
}

export function listCategories(): CatalogueEntry[] {
  return entries;
}

export function suggestForRoom(roomType: RoomType): CatalogueEntry[] {
  const relevant = entries.filter((entry) => entry.commonIn.includes(roomType));
  const remaining = entries.filter((entry) => !entry.commonIn.includes(roomType));
  return [...relevant, ...remaining];
}
