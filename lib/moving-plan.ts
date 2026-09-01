import trucks from '../data/trucks.json';
import type { AccessFlag } from './types';

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
