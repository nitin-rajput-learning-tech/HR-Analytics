// Small, dependency-free descriptive statistics for the metrics layer.
// Means alone hide skew (a few long-tenured staff drag the average up); median
// and quartiles describe the actual distribution.

// Linear-interpolation quantile (numpy's default "linear" method). `q` in [0,1].
// Returns null for empty input; does not assume — or mutate — sorted input.
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length === 1) return xs[0];
  const pos = (xs.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

export function median(values: number[]): number | null {
  return quantile(values, 0.5);
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}
