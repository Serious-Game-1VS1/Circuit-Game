/** Percentil por rango más cercano (nearest-rank): el valor de la muestra, sin interpolar. NaN si no hay datos. */
export const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] ?? NaN;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/** n, p50, p95, p99, máx y % de muestras por encima de cada meta (ms). */
export function summarize(xs: number[], goals: readonly number[]) {
  return {
    n: xs.length,
    p50: r2(pct(xs, 50)),
    p95: r2(pct(xs, 95)),
    p99: r2(pct(xs, 99)),
    max: r2(xs.length ? Math.max(...xs) : NaN),
    overGoalPct: Object.fromEntries(goals.map((g) => [`${g}ms`, xs.length ? r2((100 * xs.filter((x) => x > g).length) / xs.length) : NaN])),
  };
}
