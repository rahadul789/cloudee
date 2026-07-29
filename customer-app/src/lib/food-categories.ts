export type FoodCategorySuggestion = {
  id: string;
  label: string;
  searchQuery: string;
  /** Optional category image; when absent the UI falls back to `icon` on `color`. */
  imageUrl?: string;
  icon: string;
  color: string;
};

export function normalizeFoodCategorySuggestions<
  T extends {
    id?: string;
    label: string;
    searchQuery?: string;
    imageUrl?: string;
    icon?: string;
    color?: string;
  },
>(items: T[]) {
  const seen = new Set<string>();
  const normalized: FoodCategorySuggestion[] = [];

  for (const item of items) {
    const label = item.label.trim();
    if (!label) continue;

    const searchQuery = item.searchQuery?.trim() || label;
    const key = searchQuery.toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    normalized.push({
      id: item.id || label.toLowerCase().replace(/\s+/g, "-"),
      label,
      searchQuery,
      imageUrl: item.imageUrl?.trim() || undefined,
      icon: item.icon || "restaurant-outline",
      color: item.color || "#FFF0F6",
    });
  }

  return normalized;
}
