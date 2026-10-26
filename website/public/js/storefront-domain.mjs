export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
export function safeImage(value) {
  if (!String(value || "").trim() || String(value).trim() === "#") return "";
  try {
    const url = new URL(String(value || ""), "https://foodbela.com");
    return url.protocol === "https:" || (url.origin === "http://localhost" && url.pathname.startsWith("/images/")) ? url.href : "";
  } catch { return ""; }
}
export function cmsPath(value) {
  let path = String(value || "").trim();
  if (path.startsWith("foodbela://")) path = `/${path.slice("foodbela://".length).replace(/^\/+/, "")}`;
  if (path.startsWith("/(tabs)/browse")) return `/restaurants${path.slice("/(tabs)/browse".length)}`;
  if (["/(tabs)", "/(tabs)/", "/home"].includes(path)) return "/";
  if (path.startsWith("/(tabs)/cart") || path === "/cart") return "/checkout";
  if (path.startsWith("/(tabs)/orders")) return "/orders";
  if (path === "/offers" || path.startsWith("/offers?")) return "/restaurants?filter=offers";
  if (path === "/sign-in" || path === "/(tabs)/profile") return "/orders";
  if (path.startsWith("/promo-details") || path.startsWith("/offer-details")) return "/restaurants?filter=offers";
  if (path.startsWith("/location-picker")) return "/?location=1";
  if (/^\/restaurants\/[A-Za-z0-9_-]+(?:\?[^#]*)?$/.test(path)) return path;
  if (/^\/(?:restaurants|checkout|orders|download|about|contact|areas|privacy-policy|restaurant-partner|riders)(?:\?[^#]*)?$/.test(path)) return path;
  if (/^\/orders\/[A-Za-z0-9_-]+(?:\/tracking)?$/.test(path)) return path.replace(/\/tracking$/, "");
  if (path === "/") return path;
  try { const url = new URL(path); if (url.protocol === "https:" && url.hostname === "foodbela.com") return cmsPath(`${url.pathname}${url.search}`); } catch { /* Unrecognized CMS route stays within storefront. */ }
  return "/restaurants";
}
export function validLocation(location) {
  return Boolean(location && typeof location.latitude === "number" && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 && typeof location.longitude === "number" && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180 && typeof location.address === "string" && location.address.trim());
}
export function cartPayload(cart, location) {
  return {
    restaurantId: cart.restaurantId,
    items: cart.items.map(({ itemId, quantity, selectedVariantOptions, selectedAddOnOptions }) => ({ itemId, quantity, selectedVariantOptions, selectedAddOnOptions })),
    voucherCode: String(cart.voucherCode || "").trim(),
    ...(validLocation(location) ? { latitude: location.latitude, longitude: location.longitude } : {}),
    platformFeeOptedIn: cart.platformFeeOptedIn === true,
    urgentDeliveryOptedIn: cart.urgentDeliveryOptedIn === true,
  };
}
export function itemKey(item) {
  const selection = (list) => (list || []).map((s) => `${s.groupName}:${s.optionLabel}`).sort();
  return JSON.stringify([item.itemId, selection(item.selectedVariantOptions), selection(item.selectedAddOnOptions)]);
}
export function validateSelections(item, variants, addOns) {
  for (const [groups, selections] of [[item.variants || [], variants], [item.addOnGroups || [], addOns]]) {
    for (const group of groups) {
      const picked = selections.filter((s) => s.groupName === group.name);
      const min = Number(group.minSelect || 0);
      const max = Number(group.maxSelect ?? group.options.length);
      if (picked.length < min || picked.length > max) throw new Error(`${group.name}: ${min} থেকে ${max}টি অপশন বাছাই করুন।`);
      if (picked.some((s) => !group.options.some((option) => option.label === s.optionLabel))) throw new Error("অপশনটি পাওয়া যায়নি।");
    }
  }
}
export function money(value) { return `৳${Number(value || 0).toLocaleString("bn-BD", { maximumFractionDigits: 2 })}`; }
export const statusLabel = (status) => ({ New: "অর্ডার পাঠানো হয়েছে", Accepted: "রেস্টুরেন্ট গ্রহণ করেছে", Preparing: "খাবার তৈরি হচ্ছে", ReadyForPickup: "পিকআপের জন্য প্রস্তুত", PickedUp: "রাইডার খাবার নিয়ে আসছেন", Delivered: "ডেলিভারি সম্পন্ন", Rejected: "রেস্টুরেন্ট অর্ডারটি গ্রহণ করেনি", Cancelled: "অর্ডার বাতিল" })[status] || status;
