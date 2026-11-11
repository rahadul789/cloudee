// Short, fixed-width-ish counts for tight UI (review counts on cards):
// 999 → "999", 1250 → "1.2k", 12500 → "12k", 1_250_000 → "1.2M".
export function formatCompactCount(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "0";
  const n = Math.floor(value);
  if (n < 1000) return String(n);
  const [divisor, suffix] = n < 1_000_000 ? [1000, "k"] : [1_000_000, "M"];
  const scaled = n / divisor;
  // One decimal below 10 (1.2k), whole numbers above (12k); never round up past the unit.
  const text = scaled < 10 ? (Math.floor(scaled * 10) / 10).toFixed(1) : String(Math.floor(scaled));
  return `${text.replace(/\.0$/, "")}${suffix}`;
}
