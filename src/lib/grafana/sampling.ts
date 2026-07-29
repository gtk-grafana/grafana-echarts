/**
 * Sample an array at a fixed stride to visit at most ~`samples` evenly spaced
 * elements, always including the last element.
 *
 * Useful for cheaply estimating a property of a large array without scanning every element.
 *
 * @param items - The array to sample.
 * @param samples - Target number of samples. Defaults to 250.
 * @returns The sampled elements in index order (the last element is always included).
 */
export function sampleByStride<T>(items: T[], samples = 20): T[] {
  const len = items.length;
  if (len === 0) {
    return [];
  }
  const lastIdx = len - 1;
  const stride = Math.max(1, Math.floor(len / samples));
  const sampled: T[] = [];
  for (let i = 0; i < len; i += stride) {
    sampled.push(items[i]);
  }
  // The stride may skip the last element, so include it explicitly.
  if (lastIdx % stride !== 0) {
    sampled.push(items[lastIdx]);
  }
  return sampled;
}
