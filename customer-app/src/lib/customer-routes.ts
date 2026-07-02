const staticCustomerRoutes = new Set([
  "/(tabs)",
  "/(tabs)/browse",
  "/(tabs)/cart",
  "/(tabs)/orders",
  "/(tabs)/profile",
  "/checkout",
  "/favorite-restaurants",
  "/location-picker",
  "/notifications",
  "/offer-details",
  "/offers",
  "/order-help",
  "/payment-refunds",
  "/privacy-policy",
  "/promo-details",
  "/profile-edit",
  "/profile-password",
  "/rate-order",
  "/referrals",
  "/sign-in",
  "/support",
  "/support-chat",
  "/verify",
  "/voucher-help",
]);

const dynamicCustomerRoutes = [
  /^\/orders\/[A-Za-z0-9_-]+$/,
  /^\/orders\/[A-Za-z0-9_-]+\/tracking$/,
  /^\/orders\/[A-Za-z0-9_-]+\/review$/,
  /^\/restaurants\/[A-Za-z0-9_-]+$/,
  /^\/restaurants\/[A-Za-z0-9_-]+\/reviews$/,
];

function getPathWithoutQuery(route: string) {
  return route.split(/[?#]/, 1)[0] || route;
}

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRouteSegment(value: unknown) {
  const segment = getStringValue(value);
  return /^[A-Za-z0-9_-]+$/.test(segment) ? segment : "";
}

function getQueryParam(route: string, key: string) {
  const query = route.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  if (!query) return "";

  try {
    return new URLSearchParams(query).get(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function normalizePushPath(path: string) {
  const target = path.trim();
  if (!target) return "";

  if (/^foodbela:\/\//i.test(target)) {
    const withoutScheme = target.replace(/^foodbela:\/\//i, "");
    return withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`;
  }

  return target;
}

export function resolveCustomerRoute(
  route?: string | null,
  fallback: string | null = "/(tabs)",
) {
  if (typeof route !== "string") return fallback;

  const target = route.trim();
  if (
    !target ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return fallback;
  }

  const pathname = getPathWithoutQuery(target);
  if (staticCustomerRoutes.has(pathname)) return target;
  if (dynamicCustomerRoutes.some((pattern) => pattern.test(pathname))) {
    return target;
  }

  return fallback;
}

export function resolveCustomerPushRoute(data?: Record<string, unknown> | null) {
  const type = getStringValue(data?.type);
  const campaignId = getRouteSegment(data?.campaignId ?? data?.campaign_id);
  const explicitOrderId = getRouteSegment(data?.orderId ?? data?.order_id);
  const rawPath = normalizePushPath(
    getStringValue(
      data?.path ??
        data?.targetPath ??
        data?.actionPath ??
        data?.deepLink ??
        data?.route,
    ),
  );
  const pathOrderId =
    getRouteSegment(getQueryParam(rawPath, "orderId")) ||
    getRouteSegment(getQueryParam(rawPath, "order"));
  const orderPathMatch = rawPath.match(/^\/orders\/([A-Za-z0-9_-]+)(?:\/tracking)?(?:[?#].*)?$/);
  const orderId = explicitOrderId || pathOrderId || getRouteSegment(orderPathMatch?.[1]);

  if (type === "review_request") {
    return orderId ? `/rate-order?orderId=${orderId}` : "/(tabs)/orders";
  }

  if (orderId) {
    return `/orders/${orderId}/tracking`;
  }

  const safePath = resolveCustomerRoute(rawPath, null);
  if (safePath && safePath !== "/notifications") return safePath;

  if (type === "support_reply" || type === "support") {
    return "/support-chat";
  }

  if (type === "restaurant_status") {
    return "/(tabs)/orders";
  }

  if (type === "promotion" || type === "voucher" || type === "campaign") {
    return campaignId ? `/promo-details?campaignId=${campaignId}` : "/promo-details";
  }

  return "/(tabs)";
}
