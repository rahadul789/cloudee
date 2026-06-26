// Shared star-rating labels so the food rating, the rider rating, and every
// screen show the exact same text when a star is pressed.
export const RATING_LABELS = [
  "",
  "Poor",
  "Fair",
  "Good",
  "Very good",
  "Excellent",
] as const;

export const RATING_PROMPT = "Tap a star to rate";

export function getRatingLabel(value: number) {
  if (value <= 0) return RATING_PROMPT;
  return RATING_LABELS[Math.min(5, Math.max(1, Math.round(value)))];
}
