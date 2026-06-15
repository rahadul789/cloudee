export const RESTAURANT_OUT_OF_DELIVERY_AREA_MESSAGE =
  "This restaurant does not deliver to your selected location.";

export function isRestaurantOutOfDeliveryAreaError(message?: string | null) {
  return /does not deliver to your selected location|outside delivery area|service area|not available at this location|selected service area/i.test(
    message ?? "",
  );
}

export function getRestaurantOutOfDeliveryAreaCopy(restaurantName?: string | null) {
  const name = restaurantName?.trim() || "This restaurant";
  return `${name} does not deliver to your selected location. Change your delivery point or use your current location.`;
}
