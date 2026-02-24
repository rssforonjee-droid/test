export function getRandomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new TypeError('getRandomInt expects integer bounds');
  }

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);

  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
