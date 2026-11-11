// Customer-app link targets for admin pickers (CTA buttons, banners, push…).
// Produces paths the app already understands; old paths are recognised too.

export type LinkKind =
  | "home"
  | "search"
  | "restaurant"
  | "offers"
  | "hype"
  | "featured"
  | "offer_restaurants"
  | "popular"
  | "favorites"
  | "cart"
  | "orders"
  | "website"
  | "custom"

export const APP_LINK_KINDS: Array<{ value: LinkKind; label: string; helper: string }> = [
  { value: "home", label: "Home screen", helper: "Opens the app's home with all restaurants." },
  { value: "search", label: "Search for a food", helper: "Opens search with your keyword filled in (e.g. biryani)." },
  { value: "restaurant", label: "A specific restaurant", helper: "Opens that restaurant's menu." },
  { value: "offers", label: "Offers & vouchers", helper: "Opens the customer's offers & vouchers." },
  { value: "hype", label: "Hype tab", helper: "Opens the Hype tab (drops, events, videos)." },
  { value: "featured", label: "All featured restaurants", helper: "Opens the full Featured list (\"See all\")." },
  { value: "offer_restaurants", label: "All restaurants with offers", helper: "Opens every restaurant that has a deal now." },
  { value: "popular", label: "Popular near you", helper: "Opens the top-rated restaurants list." },
  { value: "favorites", label: "Favourites", helper: "Opens the customer's saved restaurants." },
  { value: "cart", label: "Cart", helper: "Opens the cart." },
  { value: "orders", label: "Orders", helper: "Opens order history / live order." },
  { value: "website", label: "Outside website (link)", helper: "Opens any website in the phone's browser — Facebook page, form, news…" },
  { value: "custom", label: "Other app screen", helper: "Pick from the suggestions or type an app route." },
]

const FIXED_PATH: Partial<Record<LinkKind, string>> = {
  home: "/(tabs)",
  offers: "/offers",
  hype: "/(tabs)/hype",
  featured: "/collection/featured",
  offer_restaurants: "/collection/offers",
  popular: "/collection/popular",
  favorites: "/favorite-restaurants",
  cart: "/(tabs)/cart",
  orders: "/(tabs)/orders",
}

/** Every customer-app screen an admin can link to (suggestions for "Other app screen"). */
export const APP_ROUTE_SUGGESTIONS: Array<{ path: string; label: string }> = [
  { path: "/(tabs)", label: "Home" },
  { path: "/(tabs)/hype", label: "Hype tab" },
  { path: "/(tabs)/cart", label: "Cart" },
  { path: "/(tabs)/orders", label: "Orders" },
  { path: "/(tabs)/profile", label: "Account" },
  { path: "/search", label: "Search" },
  { path: "/offers", label: "Offers & vouchers" },
  { path: "/collection/featured", label: "All featured restaurants" },
  { path: "/collection/offers", label: "All restaurants with offers" },
  { path: "/collection/popular", label: "Popular near you" },
  { path: "/favorite-restaurants", label: "Favourites" },
  { path: "/notifications", label: "Notifications" },
  { path: "/referrals", label: "Refer & earn" },
  { path: "/support", label: "Help center" },
  { path: "/support-chat", label: "Support chat" },
  { path: "/voucher-help", label: "Voucher help" },
  { path: "/order-help", label: "Order help" },
  { path: "/payment-refunds", label: "Payment & refunds" },
  { path: "/profile-edit", label: "Edit profile" },
  { path: "/location-picker", label: "Change delivery location" },
]

export function isWebsiteLink(path?: string | null) {
  return /^https?:\/\//i.test(String(path ?? "").trim())
}

/** Adds https:// to a bare domain; returns "" for anything that isn't a usable web link. */
export function normalizeWebsiteLink(value: string) {
  const raw = value.trim()
  if (!raw) return ""
  const url = isWebsiteLink(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(url)
    return parsed.hostname.includes(".") ? parsed.toString() : ""
  } catch {
    return ""
  }
}

export function parseAppLink(path?: string | null): { kind: LinkKind; restaurantId: string; query: string } {
  const target = path?.trim() ?? ""
  if (isWebsiteLink(target)) return { kind: "website", restaurantId: "", query: "" }
  const restaurant = target.match(/^\/restaurants\/([A-Za-z0-9_-]+)(?:[?#].*)?$/)
  if (restaurant) return { kind: "restaurant", restaurantId: restaurant[1], query: "" }
  if (target.startsWith("/search")) {
    const query = new URLSearchParams(target.split("?")[1] ?? "").get("query") ?? ""
    return { kind: "search", restaurantId: "", query }
  }
  // The retired Browse tab now redirects to search; the old Favourites tab to its screen.
  if (target === "/(tabs)/browse") return { kind: "search", restaurantId: "", query: "" }
  if (target === "/(tabs)/favorites") return { kind: "favorites", restaurantId: "", query: "" }
  if (target === "" || target === "/" || target === "/(tabs)" || target === "/(tabs)/index") {
    return { kind: "home", restaurantId: "", query: "" }
  }
  const fixed = (Object.entries(FIXED_PATH) as Array<[LinkKind, string]>).find(([, p]) => p === target)
  if (fixed) return { kind: fixed[0], restaurantId: "", query: "" }
  return { kind: "custom", restaurantId: "", query: "" }
}

export function buildAppLink(
  kind: LinkKind,
  options: { restaurantId?: string; query?: string; custom?: string; website?: string },
) {
  if (kind === "restaurant") return options.restaurantId ? `/restaurants/${options.restaurantId}` : ""
  if (kind === "search") {
    const q = options.query?.trim()
    return q ? `/search?query=${encodeURIComponent(q)}` : "/search"
  }
  if (kind === "website") return options.website ?? "https://"
  if (kind === "custom") return options.custom ?? ""
  return FIXED_PATH[kind] ?? "/(tabs)"
}
