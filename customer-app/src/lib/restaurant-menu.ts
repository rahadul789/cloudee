import type {
  CustomerMenuItemMarkdown,
  CustomerRestaurantMenuItem,
} from "@/src/types/restaurant";

function pickPreferredOption<
  TOption extends { label: string; price?: number; priceDelta?: number },
>(options: TOption[] | undefined, priceKey: "price" | "priceDelta") {
  const availableOptions = options ?? [];
  if (!availableOptions.length) {
    return null;
  }

  return (
    availableOptions.find((option) => (option[priceKey] ?? 0) <= 0) ??
    availableOptions[0]
  );
}

export function buildDefaultSelections(item: CustomerRestaurantMenuItem) {
  const defaultVariants: Record<string, string[]> = {};
  const defaultAddOns: Record<string, string[]> = {};

  // A variant is always a "pick one" choice (size, flavour, …), so default to a
  // sensible option even when the backend leaves minSelect unset. This guarantees a
  // required variant is never empty and keeps the "Add" action valid on first press.
  for (const group of item.variants ?? []) {
    const preferred = pickPreferredOption(group.options, "priceDelta");
    if (preferred) {
      defaultVariants[group.name] = [preferred.label];
    }
  }

  for (const group of item.addOnGroups ?? []) {
    if ((group.minSelect ?? 0) > 0) {
      const preferred = pickPreferredOption(group.options, "price");
      if (preferred) {
        defaultAddOns[group.name] = [preferred.label];
      }
    }
  }

  return { defaultVariants, defaultAddOns };
}

export function buildStartingPrice(item: CustomerRestaurantMenuItem) {
  const lowestVariantDelta =
    item.variants
      ?.flatMap((group) => group.options ?? [])
      .reduce((lowest, option) => {
        if (typeof lowest !== "number") return option.priceDelta;
        return Math.min(lowest, option.priceDelta);
      }, undefined as number | undefined) ?? 0;

  return item.basePrice + Math.max(lowestVariantDelta, 0);
}

export function hasCustomizations(item: CustomerRestaurantMenuItem) {
  return Boolean(
    (item.variants?.length ?? 0) || (item.addOnGroups?.length ?? 0),
  );
}

/**
 * Client mirror of the backend markdown maths. Computes the platform-funded discount for an
 * exact (base + variant) price — add-ons excluded by the caller. Returns 0 below threshold;
 * never exceeds the price. Used for previews only; the backend quote remains authoritative.
 */
export function computeItemMarkdownAmount(
  basePlusVariant: number,
  markdown: CustomerMenuItemMarkdown | null | undefined,
): number {
  if (!markdown) return 0;
  const price = Number.isFinite(basePlusVariant) ? basePlusVariant : 0;
  if (price <= 0) return 0;
  if (markdown.minItemPrice > 0 && price < markdown.minItemPrice) return 0;

  let raw =
    markdown.discountType === "percentage"
      ? (price * markdown.discountValue) / 100
      : markdown.discountValue;
  if (markdown.maxDiscountAmount > 0) raw = Math.min(raw, markdown.maxDiscountAmount);
  raw = Math.min(raw, price);
  return Math.max(0, Math.round(raw));
}

export function isSelectionValid(
  selectedCount: number,
  group: { minSelect?: number; maxSelect?: number },
) {
  const minSelect = group.minSelect ?? 0;
  const maxSelect = group.maxSelect ?? 99;
  return selectedCount >= minSelect && selectedCount <= maxSelect;
}
