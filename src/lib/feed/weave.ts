export function weave<T>(buckets: readonly (readonly T[])[]): T[] {
  const woven: T[] = [];
  const depth = buckets.reduce((max, bucket) => Math.max(max, bucket.length), 0);
  for (let index = 0; index < depth; index += 1) {
    for (const bucket of buckets) {
      const item = bucket[index];
      if (item !== undefined) woven.push(item);
    }
  }
  return woven;
}
