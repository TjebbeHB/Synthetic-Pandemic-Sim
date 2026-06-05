export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.next() * (maxInclusive - min + 1)) + min;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pickWeighted<T extends string>(weights: Record<T, number>): T {
    const entries = Object.entries(weights) as Array<[T, number]>;
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    let threshold = this.next() * total;
    for (const [key, value] of entries) {
      threshold -= value;
      if (threshold <= 0) {
        return key;
      }
    }
    return entries[entries.length - 1][0];
  }

  pickFromLinks<T extends { share: number }>(links: T[]): T {
    const total = links.reduce((sum, link) => sum + link.share, 0);
    let threshold = this.next() * total;
    for (const link of links) {
      threshold -= link.share;
      if (threshold <= 0) {
        return link;
      }
    }
    return links[links.length - 1];
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function jitterCoordinate(value: number, spread: number, rng: Random): number {
  return value + rng.range(-spread, spread);
}
