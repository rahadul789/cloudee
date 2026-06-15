import { resolveCustomerRoute } from "@/src/lib/customer-routes";

export function resolvePostAuthRedirect(redirectTo?: string | null) {
  if (typeof redirectTo === "string" && redirectTo.trim()) {
    const target = redirectTo.trim();

    if (
      target === "profile" ||
      target === "/profile" ||
      target === "/(tabs)/profile"
    ) {
      return "/(tabs)";
    }

    if (target === "orders" || target === "/orders") {
      return "/(tabs)/orders";
    }

    if (target === "browse" || target === "/browse") {
      return "/(tabs)/browse";
    }

    return resolveCustomerRoute(target, "/(tabs)");
  }

  return "/(tabs)";
}
