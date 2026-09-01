import trucks from '../data/trucks.json';
import packing from '../data/packing.json';
import type { AccessFlag, Item } from './types';

interface TruckClass { label: string; feet: number; maxCubicFeet: number; crewSize: number }

const TRUCKS = trucks as TruckClass[];
const CUFT_PER_CREW_HOUR = 120;
const MIN_HOURS = 2;
const ACCESS_HOURS: Record<AccessFlag, number> = {
  stairs: 1.5,
  elevator: 1,
  long_carry: 1,
};

export interface TruckPlan {
  truckLabel: string;
  truckFeet: number;
  crewSize: number;
  estimatedHours: number;
  trips: number;
}

export function planTruckAndCrew(totalCubicFeet: number, accessFlags: AccessFlag[]): TruckPlan {
  const largest = TRUCKS[TRUCKS.length - 1];
  const fitting = TRUCKS.find((truck) => totalCubicFeet <= truck.maxCubicFeet) ?? largest;
  const trips = Math.max(1, Math.ceil(totalCubicFeet / largest.maxCubicFeet));

  const accessHours = Array.from(new Set(accessFlags))
    .reduce((sum, flag) => sum + (ACCESS_HOURS[flag] ?? 0), 0);

  const loadHours = totalCubicFeet > 0
    ? (totalCubicFeet / CUFT_PER_CREW_HOUR) * trips
    : 0;

  return {
    truckLabel: fitting.label,
    truckFeet: fitting.feet,
    crewSize: Math.max(2, fitting.crewSize),
    estimatedHours: Math.max(MIN_HOURS, Math.round((loadHours + accessHours) * 2) / 2),
    trips,
  };
}

export interface PackingItem { label: string; quantity: number; unit: string }

const BOX_CATEGORIES = new Set([
  'box_small', 'box_medium', 'box_large', 'wardrobe_box',
]);

export function planPackingMaterials(items: Item[]): PackingItem[] {
  if (!items.length) return [];

  const packableCuFt = items
    .filter((i) => !BOX_CATEGORIES.has(i.category))
    .reduce((sum, i) => sum + i.cubicFeet * i.count, 0);

  const per100 = packableCuFt / 100;
  const countOf = (category: string) =>
    items.filter((i) => i.category === category).reduce((sum, i) => sum + i.count, 0);

  const smallBoxes    = Math.ceil(per100 * packing.smallBoxesPer100CuFt);
  const mediumBoxes   = Math.ceil(per100 * packing.mediumBoxesPer100CuFt);
  const largeBoxes    = Math.ceil(per100 * packing.largeBoxesPer100CuFt);
  const wardrobeBoxes = Math.ceil(per100 * packing.wardrobeBoxesPer100CuFt);
  const totalBoxes    = smallBoxes + mediumBoxes + largeBoxes + wardrobeBoxes;

  const lines: PackingItem[] = [
    { label: 'Small boxes',    quantity: smallBoxes,    unit: 'boxes' },
    { label: 'Medium boxes',   quantity: mediumBoxes,   unit: 'boxes' },
    { label: 'Large boxes',    quantity: largeBoxes,    unit: 'boxes' },
    { label: 'Wardrobe boxes', quantity: wardrobeBoxes, unit: 'boxes' },
    { label: 'Packing paper',  quantity: Math.ceil(per100 * packing.packingPaperLbsPer100CuFt), unit: 'lbs' },
    { label: 'Bubble wrap',    quantity: Math.ceil(per100 * packing.bubbleWrapFeetPer100CuFt),  unit: 'ft' },
    { label: 'Tape rolls',     quantity: Math.ceil(totalBoxes / 20 * packing.tapeRollsPer20Boxes), unit: 'rolls' },
    { label: 'Mattress bags',  quantity: countOf('mattress') * packing.mattressBagsPerMattress, unit: 'bags' },
    { label: 'TV boxes',       quantity: countOf('tv') * packing.tvBoxesPerTv, unit: 'boxes' },
  ];

  return lines.filter((line) => line.quantity > 0);
}
