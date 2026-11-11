// Preset-only review feedback: customers pick chips instead of typing free text (keeps
// reviews clean, fast and moderation-free). The chip set follows the star rating — praise
// for 4–5 stars, "what went wrong" for 1–3 — and the picks become the review comment.

export const FOOD_PRAISE = [
  "Tasty food",
  "Hot & fresh",
  "Good portion",
  "Well packaged",
  "Good value",
  "Will order again",
] as const;

export const FOOD_ISSUES = [
  "Food was cold",
  "Late delivery",
  "Missing or wrong item",
  "Poor packaging",
  "Small portion",
  "Too expensive",
] as const;

export const RIDER_PRAISE = [
  "Polite & friendly",
  "Fast delivery",
  "Handled food with care",
  "Found me easily",
] as const;

export const RIDER_ISSUES = [
  "Arrived late",
  "Rude behaviour",
  "Food was spilled",
  "Hard to reach",
] as const;

export function isPositiveRating(rating: number) {
  return rating >= 4;
}

export function getFoodPresets(rating: number): readonly string[] {
  if (rating <= 0) return [];
  return isPositiveRating(rating) ? FOOD_PRAISE : FOOD_ISSUES;
}

export function getRiderPresets(rating: number): readonly string[] {
  if (rating <= 0) return [];
  return isPositiveRating(rating) ? RIDER_PRAISE : RIDER_ISSUES;
}

/** Selected chips → review comment ("Tasty food, Good value"), or undefined if none. */
export function composePresetComment(selected: readonly string[]): string | undefined {
  const text = selected.map((chip) => chip.trim()).filter(Boolean).join(", ");
  return text || undefined;
}

/** Keep only picks that still belong to the current chip set (rating may have flipped). */
export function keepValidPicks(selected: readonly string[], presets: readonly string[]) {
  return selected.filter((chip) => presets.includes(chip));
}

export const RATING_EMOJI = ["", "😞", "😕", "😐", "🙂", "😍"] as const;
