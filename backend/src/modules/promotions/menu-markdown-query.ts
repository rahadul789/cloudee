import mongoose from "mongoose"

/**
 * Build the MongoDB filter that selects the active platform-funded menu-markdown rules
 * targeting a specific restaurant. Shared by the customer menu-serve endpoint and the cart
 * quote so the set of rules considered for display and for pricing can never diverge.
 *
 * Targeting is fully expressible against the one restaurant we are serving: scope (this
 * restaurant / selected list / all), cuisine (rule has none, or intersects the restaurant's
 * cuisines) and zone/district (rule has none, or includes the restaurant's service zone).
 */
export function buildActiveMenuMarkdownFilter(
  restaurant: Record<string, any>,
): Record<string, unknown> {
  const now = new Date()
  const restaurantId =
    restaurant._id instanceof mongoose.Types.ObjectId
      ? restaurant._id
      : new mongoose.Types.ObjectId(String(restaurant._id))
  const cuisines = (restaurant.cuisineTypes ?? []).map((value: unknown) => String(value))
  const zoneId = restaurant.serviceArea?.zoneId
    ? String(restaurant.serviceArea.zoneId)
    : ""
  const districtId = restaurant.serviceArea?.districtId
    ? String(restaurant.serviceArea.districtId)
    : ""

  return {
    surface: "menu_markdown",
    status: "Active",
    archivedAt: null,
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    $and: [
      {
        $or: [
          { scopeType: "all_restaurants" },
          { scopeType: "restaurant", restaurantId },
          { scopeType: "selected_restaurants", selectedRestaurantIds: restaurantId },
        ],
      },
      {
        $or: [
          { cuisineTypes: { $size: 0 } },
          ...(cuisines.length ? [{ cuisineTypes: { $in: cuisines } }] : []),
        ],
      },
      {
        $or: [
          { zoneIds: { $size: 0 } },
          ...(zoneId ? [{ zoneIds: zoneId }] : []),
        ],
      },
      {
        $or: [
          { districtIds: { $size: 0 } },
          ...(districtId ? [{ districtIds: districtId }] : []),
        ],
      },
    ],
  }
}
