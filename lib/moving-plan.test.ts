import { describe, it, expect } from 'vitest';
import { planTruckAndCrew, planPackingMaterials } from './moving-plan';
import type { Item } from './types';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i', roomId: 'r', name: 'thing', category: 'sofa_3seat',
    count: 1, sizeClass: 'm', cubicFeet: 50, confidence: 0.9,
    source: 'ai', editedByUser: false, ...over,
  };
}

describe('planTruckAndCrew', () => {
  it('picks the smallest truck that fits the load', () => {
    expect(planTruckAndCrew(600, []).truckLabel).toBe('16ft box truck');
  });

  it('scales crew with truck class', () => {
    expect(planTruckAndCrew(1500, []).crewSize).toBe(4);
  });

  it('requires multiple trips when volume exceeds the largest truck', () => {
    const plan = planTruckAndCrew(3000, []);
    expect(plan.truckFeet).toBe(26);
    expect(plan.trips).toBe(2);
  });

  it('uses one trip for any load that fits', () => {
    expect(planTruckAndCrew(100, []).trips).toBe(1);
  });

  it('adds time for stairs and long carry', () => {
    const flat = planTruckAndCrew(600, []);
    const hard = planTruckAndCrew(600, ['stairs', 'long_carry']);
    expect(hard.estimatedHours).toBeGreaterThan(flat.estimatedHours);
  });

  it('counts each access flag once', () => {
    const a = planTruckAndCrew(600, ['stairs']);
    const b = planTruckAndCrew(600, ['stairs', 'stairs']);
    expect(a.estimatedHours).toBe(b.estimatedHours);
  });

  it('never returns fewer than 2 crew or less than 2 hours', () => {
    const plan = planTruckAndCrew(5, []);
    expect(plan.crewSize).toBeGreaterThanOrEqual(2);
    expect(plan.estimatedHours).toBeGreaterThanOrEqual(2);
  });

  it('returns a zero-ish plan for an empty inventory without NaN', () => {
    const plan = planTruckAndCrew(0, []);
    expect(Number.isNaN(plan.estimatedHours)).toBe(false);
    expect(plan.trips).toBe(1);
  });
});

describe('planPackingMaterials', () => {
  it('returns an empty list for an empty inventory', () => {
    expect(planPackingMaterials([])).toEqual([]);
  });

  it('scales boxes with non-box volume', () => {
    const out = planPackingMaterials([item({ cubicFeet: 100, count: 1 })]);
    const medium = out.find((entry) => entry.label.includes('Medium'));
    expect(medium?.quantity).toBe(3);
  });

  it('excludes existing boxes from the volume that generates new boxes', () => {
    const withBoxes = planPackingMaterials([
      item({ cubicFeet: 100, count: 1 }),
      item({ category: 'box_medium', cubicFeet: 3, count: 20 }),
    ]);
    const onlyFurniture = planPackingMaterials([item({ cubicFeet: 100, count: 1 })]);
    const qty = (list: ReturnType<typeof planPackingMaterials>) =>
      list.find((entry) => entry.label.includes('Medium'))?.quantity;
    expect(qty(withBoxes)).toBe(qty(onlyFurniture));
  });

  it('adds one mattress bag per mattress', () => {
    const out = planPackingMaterials([item({ category: 'mattress', count: 3 })]);
    expect(out.find((entry) => entry.label.includes('Mattress'))?.quantity).toBe(3);
  });

  it('adds a TV box per television', () => {
    const out = planPackingMaterials([item({ category: 'tv', count: 2 })]);
    expect(out.find((entry) => entry.label.includes('TV'))?.quantity).toBe(2);
  });

  it('returns whole units only', () => {
    const out = planPackingMaterials([item({ cubicFeet: 137, count: 1 })]);
    for (const entry of out) expect(Number.isInteger(entry.quantity)).toBe(true);
  });

  it('never returns a zero-quantity line', () => {
    const out = planPackingMaterials([item({ cubicFeet: 400, count: 1 })]);
    for (const entry of out) expect(entry.quantity).toBeGreaterThan(0);
  });
});
