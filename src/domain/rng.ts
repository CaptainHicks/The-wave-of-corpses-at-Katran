import type { RngState } from "./types";

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): number {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function random(rng: RngState): [number, RngState] {
  const value = mulberry32(hash(`${rng.seed}:${rng.counter}`));
  return [value, { ...rng, counter: rng.counter + 1 }];
}

export function randomInt(rng: RngState, maxExclusive: number): [number, RngState] {
  const [value, next] = random(rng);
  return [Math.floor(value * maxExclusive), next];
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
