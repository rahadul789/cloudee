// Last-resort client-side fallback for a SINGLE restaurant's delivery radius
// display (used only when the server did not send `restaurant.deliveryRadiusKm`).
//
// Do NOT use this as the discovery/nearby range. Listing queries must omit
// `radiusKm` so the backend can apply the resolved service zone or the
// admin-configured fallback (operations.serviceArea.radiusKm). Sending a
// hardcoded value here would let the server's min(appRadius, adminRadius) clamp
// silently cap whatever range the admin sets.
export const DELIVERY_RADIUS_KM = 3;
