const allowedOwnerNotificationPaths = new Set([
  "/(tabs)/today",
  "/(tabs)/orders",
  "/(tabs)/menu",
  "/(tabs)/payouts",
  "/(tabs)/account",
  "/notifications",
]);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOwnerPath(value: unknown) {
  const target = stringValue(value);
  if (!target) return "";

  if (/^foodbelaowner:\/\//i.test(target)) {
    const withoutScheme = target.replace(/^foodbelaowner:\/\//i, "");
    return withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`;
  }

  return target;
}

function routeSegment(value: unknown) {
  const segment = stringValue(value);
  return /^[A-Za-z0-9_-]{6,80}$/.test(segment) ? segment : "";
}

function queryValue(path: string, key: string) {
  const query = path.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  if (!query) return "";

  try {
    return new URLSearchParams(query).get(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function resolveOwnerNotificationPath(path?: unknown) {
  const value = normalizeOwnerPath(path);
  if (allowedOwnerNotificationPaths.has(value)) return value;

  const orderPathMatch = value.match(/^\/orders\/([A-Za-z0-9_-]{6,80})(?:[?#].*)?$/);
  const orderId =
    routeSegment(orderPathMatch?.[1]) ||
    routeSegment(queryValue(value, "order")) ||
    routeSegment(queryValue(value, "orderId"));

  return orderId ? `/orders/${orderId}` : "/(tabs)/today";
}

export function resolveOwnerNotificationTarget(data?: Record<string, unknown> | null) {
  const directOrderId =
    routeSegment(data?.orderId ?? data?.order_id) ||
    (stringValue(data?.entityType).toLowerCase() === "order"
      ? routeSegment(data?.entityId)
      : "");

  if (directOrderId) {
    return `/orders/${directOrderId}`;
  }

  return resolveOwnerNotificationPath(
    data?.url ?? data?.path ?? data?.actionPath ?? data?.deepLink ?? data?.route,
  );
}

export function getOwnerOrderIdFromPath(path?: string | null) {
  if (!path) return "";
  return path.match(/^\/orders\/([A-Za-z0-9_-]{6,80})(?:[?#].*)?$/)?.[1] ?? "";
}
