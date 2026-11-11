import type { CustomerVoucherOffer } from "@/src/types/restaurant";

// Short offer label ("CODE - 20% off") per restaurant; shared by Home and section lists.
export function getOfferLabel(offer: CustomerVoucherOffer) {
  let value = "Offer available";

  if (offer.type === "free_delivery") {
    value = "Free delivery";
  } else if (
    offer.type === "percentage" &&
    typeof offer.discountValue === "number"
  ) {
    value = `${offer.discountValue}% off`;
  } else if (typeof offer.discountValue === "number") {
    value = `Tk ${offer.discountValue} off`;
  }

  return offer.code ? `${offer.code} - ${value}` : value;
}

export function buildRestaurantOfferMap(offers: CustomerVoucherOffer[]) {
  const next = new Map<string, string>();

  for (const offer of offers) {
    const restaurantIds = [
      ...(offer.restaurantIds ?? []),
      offer.restaurantId ?? "",
    ].filter(Boolean);

    for (const restaurantId of restaurantIds) {
      if (!next.has(restaurantId)) {
        next.set(restaurantId, getOfferLabel(offer));
      }
    }
  }

  return next;
}
