import type { AccessFlag, Item, QuoteBreakdown, RateCard } from './types';

const TOLERANCE_FLOOR = 0.08;
const TOLERANCE_CEILING = 0.3;

export function totalCubicFeet(items: Item[]): number {
  const total = items.reduce((sum, item) => sum + item.cubicFeet * item.count, 0);
  return Math.round(total * 10) / 10;
}

export function computeTolerance(items: Item[]): number {
  const tolerance = items.reduce((value, item) => {
    let next = value;
    if (item.confidence < 0.7) next += 0.02;
    if (item.source === 'user_added') next += 0.01;
    return next;
  }, TOLERANCE_FLOOR);

  return Math.min(TOLERANCE_CEILING, Math.max(TOLERANCE_FLOOR, tolerance));
}

export function priceQuote(
  items: Item[],
  accessFlags: AccessFlag[],
  card: RateCard,
): QuoteBreakdown {
  const totalCubicFeetValue = totalCubicFeet(items);
  const baseCents = Math.round(totalCubicFeetValue * card.perCubicFootCents);
  const laborHours = totalCubicFeetValue === 0
    ? 0
    : Math.ceil(totalCubicFeetValue / card.cuftPerCrewHour);
  const laborCents = laborHours * card.crewHourlyCents;
  const accessCents = [...new Set(accessFlags)].reduce(
    (sum, flag) => sum + card.accessAdderCents[flag],
    0,
  );
  const rawSubtotalCents = baseCents + laborCents + accessCents;
  const subtotalCents = totalCubicFeetValue === 0
    ? 0
    : Math.max(rawSubtotalCents, card.minimumCents);
  const tolerance = computeTolerance(items);

  return {
    totalCubicFeet: totalCubicFeetValue,
    baseCents,
    laborCents,
    accessCents,
    subtotalCents,
    tolerance,
    lowCents: Math.round(subtotalCents * (1 - tolerance)),
    highCents: Math.round(subtotalCents * (1 + tolerance)),
  };
}

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
