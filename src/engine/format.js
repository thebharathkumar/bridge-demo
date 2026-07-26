/** Small formatting helpers, shared by the engine and the API responses. */

export function money(amount) {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/** 0.685 -> "68.5%" ; 0.7 -> "70%" */
export function pct(fraction, maxDecimals = 1) {
  const rounded = Number((fraction * 100).toFixed(maxDecimals));
  return `${rounded}%`;
}

/**
 * Percentage-point gap between two fractions: (0.70, 0.685) -> 1.5
 * Rounded to 4 decimal places to keep float noise out of cited numbers.
 */
export function points(a, b) {
  return Number((Math.abs(a - b) * 100).toFixed(4));
}
