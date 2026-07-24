import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { OwnerListResponse, OwnerOrder, OwnerOrderStatus } from "@/src/hooks/use-owner-api";

type OwnerOrderQueryParams = {
  tab?: "live" | "history";
  status?: string;
  pageSize?: number;
};

const liveOrderStatuses: OwnerOrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
];

const historyOrderStatuses: OwnerOrderStatus[] = ["Delivered", "Cancelled", "Rejected"];

function getPlacedAt(order: OwnerOrder) {
  return new Date(
    order.timestamps?.createdAt ??
      order.timestamps?.placedAt ??
      order.timestamps?.New ??
      order.createdAt ??
      order.history?.[0]?.createdAt ??
      0,
  ).getTime();
}

function extractOwnerOrderQueryParams(queryKey: QueryKey) {
  if (!Array.isArray(queryKey) || queryKey.length < 3) return undefined;
  const params = queryKey[2];
  return params && typeof params === "object" ? (params as OwnerOrderQueryParams) : undefined;
}

function matchesOwnerOrderQuery(order: OwnerOrder, params?: OwnerOrderQueryParams) {
  if (params?.status) return order.status === params.status;
  if (params?.tab === "live") return liveOrderStatuses.includes(order.status);
  if (params?.tab === "history") return historyOrderStatuses.includes(order.status);
  return true;
}

function sortOrders(orders: OwnerOrder[]) {
  return [...orders].sort((left, right) => getPlacedAt(right) - getPlacedAt(left));
}

function patchOwnerOrderListCache(
  current: unknown,
  payload: OwnerOrder,
  params?: OwnerOrderQueryParams,
) {
  if (
    !current ||
    typeof current !== "object" ||
    !("items" in (current as Record<string, unknown>))
  ) {
    return current;
  }

  const result = current as OwnerListResponse<OwnerOrder>;
  const items = Array.isArray(result.items) ? result.items : [];
  const exists = items.some((item) => item._id === payload._id);
  const matches = matchesOwnerOrderQuery(payload, params);
  const pageSize = Math.max(1, params?.pageSize ?? (items.length || 1));
  let nextItems = items;

  if (exists) {
    nextItems = matches
      ? items.map((item) => (item._id === payload._id ? payload : item))
      : items.filter((item) => item._id !== payload._id);
  } else if (matches) {
    nextItems = [payload, ...items];
  }

  nextItems = sortOrders(nextItems);
  if (nextItems.length > pageSize) {
    nextItems = nextItems.slice(0, pageSize);
  }

  const currentTotal = result.total ?? items.length;
  let nextTotal = currentTotal;
  if (!exists && matches) nextTotal += 1;
  if (exists && !matches) nextTotal = Math.max(0, currentTotal - 1);

  return {
    ...result,
    items: nextItems,
    total: nextTotal,
  } satisfies OwnerListResponse<OwnerOrder>;
}

export function patchOwnerOrderQueryCaches(queryClient: QueryClient, payload: OwnerOrder) {
  const queryCache = queryClient.getQueryCache();

  queryCache.findAll({ queryKey: ["owner", "orders"] }).forEach((query) => {
    const params = extractOwnerOrderQueryParams(query.queryKey);
    queryClient.setQueryData(query.queryKey, (current: unknown) =>
      patchOwnerOrderListCache(current, payload, params),
    );
  });

  queryClient.setQueryData(["owner", "orders", "details", payload._id], payload);
}
