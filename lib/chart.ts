/** Pure chart geometry. No React, no DOM — unit-tested like lib/pricing.ts. */

export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  if (span <= 0) {
    const step = Math.max(1, Math.ceil(Math.abs(max) / count) || 1);
    return Array.from({ length: count + 1 }, (_, i) => min + i * step);
  }
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v < max + step; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function linearScale(d0: number, d1: number, r0: number, r1: number) {
  // A zero-width domain would divide by zero; centre it instead.
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (value: number) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

export function linePath(points: [number, number][]): string {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return rest.reduce(
    (d, [x, y]) => `${d} L ${x} ${y}`,
    `M ${first[0]} ${first[1]}`,
  );
}

export function stackLayout(values: number[]): { percent: number; offset: number }[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return [];
  let offset = 0;
  return values.map((value) => {
    const percent = (Math.max(0, value) / total) * 100;
    const slice = { percent, offset };
    offset += percent;
    return slice;
  });
}

export function bucketByDay(timestamps: string[], days: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const day of days) counts[day] = 0;
  for (const stamp of timestamps) {
    const day = stamp.slice(0, 10);
    if (day in counts) counts[day] += 1;
  }
  return counts;
}
