// Builds the home "Order again" rail from the customer's order history (pure; unit-tested).

export type OrderAgainSourceOrder = {
  _id: string;
  restaurantId?: string;
  orderNumber?: string;
  status: string;
  createdAt?: string;
  pricing?: { total?: number };
  itemsSnapshot?: { itemId?: string; name?: string; quantity?: number; unitPrice?: number }[];
  restaurantCard?: { name: string; imageUrl: string | null } | null;
};

export type OrderAgainEntry = {
  order: OrderAgainSourceOrder;
  restaurantId: string;
  restaurantName: string;
  imageUrl: string | null;
  itemsLabel: string;
  itemCount: number;
  total: number;
};

export const ORDER_AGAIN_MAX = 6;

/** "Chicken Biryani" / "Chicken Biryani + 2 more" */
export function formatOrderItemsLabel(items: OrderAgainSourceOrder["itemsSnapshot"]) {
  const names = (items ?? []).map((item) => item.name?.trim()).filter(Boolean) as string[];
  if (!names.length) return "Your last order";
  return names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1} more`;
}

/**
 * Latest DELIVERED order per restaurant, newest first, max 6 (admin: maxItems/maxAgeDays). Orders without a restaurant
 * name (older backend) or without items are skipped — there's nothing to show / reorder.
 */
export function buildOrderAgainEntries(
  orders: OrderAgainSourceOrder[],
  max = ORDER_AGAIN_MAX,
  /** Only orders from the last N days (admin setting); 0/undefined = no limit. */
  maxAgeDays?: number,
  now = Date.now(),
) {
  const oldest = maxAgeDays && maxAgeDays > 0 ? now - maxAgeDays * 24 * 60 * 60 * 1000 : -Infinity;
  const sorted = [...orders]
    .filter((order) => order.status === "Delivered")
    .filter((order) => new Date(order.createdAt ?? 0).getTime() >= oldest)
    .sort(
      (left, right) =>
        new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime(),
    );
  const seen = new Set<string>();
  const entries: OrderAgainEntry[] = [];
  for (const order of sorted) {
    const restaurantId = order.restaurantId ?? "";
    const restaurantName = order.restaurantCard?.name?.trim() ?? "";
    const items = order.itemsSnapshot ?? [];
    if (!restaurantId || !restaurantName || !items.length || seen.has(restaurantId)) continue;
    seen.add(restaurantId);
    entries.push({
      order,
      restaurantId,
      restaurantName,
      imageUrl: order.restaurantCard?.imageUrl ?? null,
      itemsLabel: formatOrderItemsLabel(items),
      itemCount: items.reduce((sum, item) => sum + Math.max(0, item.quantity ?? 0), 0),
      total: Math.max(0, order.pricing?.total ?? 0),
    });
    if (entries.length >= max) break;
  }
  return entries;
}
