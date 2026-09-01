import { describe, it, expect } from 'vitest';
import { planTruckAndCrew } from './moving-plan';

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
