import type { RngState } from "./types";

const UINT32_RANGE = 0x100000000;

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32Uint(a: number): number {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function randomUint32(rng: RngState): [number, RngState] {
  const value = mulberry32Uint(hash(`${rng.seed}:${rng.counter}`));
  return [value, { ...rng, counter: rng.counter + 1 }];
}

export function random(rng: RngState): [number, RngState] {
  const [value, next] = randomUint32(rng);
  return [value / UINT32_RANGE, next];
}

export function randomInt(rng: RngState, maxExclusive: number): [number, RngState] {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new RangeError("maxExclusive must be a positive integer no larger than 2^32.");
  }

  const bucketSize = Math.floor(UINT32_RANGE / maxExclusive);
  const acceptedRange = bucketSize * maxExclusive;
  let nextRng = rng;

  while (true) {
    const [value, candidateRng] = randomUint32(nextRng);
    nextRng = candidateRng;
    if (value < acceptedRange) {
      return [Math.floor(value / bucketSize), nextRng];
    }
  }
}

export function shuffle<T>(items: T[], rng: RngState): [T[], RngState] {
  const nextItems = [...items];
  let nextRng = rng;
  for (let i = nextItems.length - 1; i > 0; i -= 1) {
    const [j, r] = randomInt(nextRng, i + 1);
    nextRng = r;
    [nextItems[i], nextItems[j]] = [nextItems[j], nextItems[i]];
  }
  return [nextItems, nextRng];
}
