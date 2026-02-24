export function getRandomNumber(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);

  return Math.random() * (hi - lo) + lo;
}
