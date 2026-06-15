import type { QueryClient } from "@tanstack/react-query";

import { apiProtectedGet } from "@/src/lib/api";

const ORDER_ROUTE_PATTERN = /^\/orders\/([A-Za-z0-9_-]+)(?:\/tracking)?(?:[?#].*)?$/;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getCustomerOrderIdFromPath(path?: string | null) {
  if (!path) return "";
  return path.match(ORDER_ROUTE_PATTERN)?.[1] ?? "";
}

export async function refreshCustomerOrderCacheForPath(
  queryClient: QueryClient,
  path?: string | null,
  waitForMs = 1400,
) {
  const orderId = getCustomerOrderIdFromPath(path);
  if (!orderId) return;

  const refreshPromise = queryClient
    .fetchQuery({
      queryKey: ["customer", "orders", orderId],
      queryFn: async () => {
        const response = await apiProtectedGet(`/customer/orders/${orderId}`);
        return response.data;
      },
      staleTime: 0,
    })
    .then(() =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", "live"] }),
        queryClient.invalidateQueries({ queryKey: ["customer", "orders", "active"] }),
      ]),
    )
    .catch(() => undefined);

  if (waitForMs <= 0) {
    void refreshPromise;
    return;
  }

  await Promise.race([refreshPromise, wait(waitForMs)]);
}
