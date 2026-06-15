import type { CustomerRestaurantMenuItem } from "@/src/types/restaurant";

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

  for (const group of item.variants ?? []) {
    if ((group.minSelect ?? 0) > 0) {
      const preferred = pickPreferredOption(group.options, "priceDelta");
      if (preferred) {
        defaultVariants[group.name] = [preferred.label];
      }
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

export function isSelectionValid(
  selectedCount: number,
  group: { minSelect?: number; maxSelect?: number },
) {
  const minSelect = group.minSelect ?? 0;
  const maxSelect = group.maxSelect ?? 99;
  return selectedCount >= minSelect && selectedCount <= maxSelect;
}
