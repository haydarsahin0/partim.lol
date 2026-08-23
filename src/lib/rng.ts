import { hashString } from "./avatar";

/** mulberry32 — küçük, hızlı, deterministik PRNG */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seededRng = (key: string) => mulberry32(hashString(key));

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}
