// In zone mode, membership is checked against the selected zone after lookup.
// A customer-centred radius would cut off restaurants at the far side of it.
export function buildRestaurantDiscoveryGeoNear(params: {
  latitude: number;
  longitude: number;
  query: Record<string, unknown>;
  zoneBased: boolean;
  fallbackRadiusKm: number;
  requestedRadiusKm?: number;
}) {
  return {
    near: {
      type: "Point" as const,
      coordinates: [params.longitude, params.latitude] as [number, number],
    },
    distanceField: "distanceMeters",
    ...(!params.zoneBased
      ? {
          maxDistance: Math.max(0, Math.min(
            params.requestedRadiusKm ?? params.fallbackRadiusKm,
            params.fallbackRadiusKm,
          )) * 1000,
        }
      : {}),
    spherical: true,
    query: params.query,
  };
}
