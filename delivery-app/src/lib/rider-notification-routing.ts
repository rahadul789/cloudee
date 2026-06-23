const allowedRiderNotificationPaths = new Set([
  "/(app)/available",
  "/(app)/active",
  "/(app)/map",
  "/(app)/history",
  "/(app)/profile",
  "/notifications",
]);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRiderPath(value: unknown) {
  const target = stringValue(value);
  if (!target) return "";

  if (/^deliveryapp:\/\//i.test(target)) {
    const withoutScheme = target.replace(/^deliveryapp:\/\//i, "");
    return withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`;
  }

  return target;
}

function routeSegment(value: unknown) {
  const segment = stringValue(value);
  return /^[A-Za-z0-9_-]{6,80}$/.test(segment) ? segment : "";
}

export function resolveRiderNotificationPath(path?: unknown) {
  const value = normalizeRiderPath(path);
  if (allowedRiderNotificationPaths.has(value)) return value;

  const orderPathMatch = value.match(/^\/orders\/([A-Za-z0-9_-]{6,80})(?:[?#].*)?$/);
  return orderPathMatch?.[1] ? `/orders/${orderPathMatch[1]}` : "/(app)/available";
}

export function resolveRiderNotificationTarget(data?: Record<string, unknown> | null) {
  const directOrderId =
    routeSegment(data?.orderId ?? data?.order_id) ||
    (stringValue(data?.entityType).toLowerCase() === "order"
      ? routeSegment(data?.entityId)
      : "");

  if (directOrderId) {
    return `/orders/${directOrderId}`;
  }

  return resolveRiderNotificationPath(
    data?.url ?? data?.path ?? data?.actionPath ?? data?.deepLink ?? data?.route,
  );
}

export function getRiderOrderIdFromPath(path?: string | null) {
  if (!path) return "";
  return path.match(/^\/orders\/([A-Za-z0-9_-]{6,80})(?:[?#].*)?$/)?.[1] ?? "";
}
