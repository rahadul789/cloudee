type EtaContent = {
  operations?: { dispatch?: {
    riderEtaSpeedKmph?: unknown;
    riderEtaRouteFactor?: unknown;
    riderEtaHandoverBufferMinutes?: unknown;
  } };
};

function setting(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback;
}

export function getRiderEtaSettings(content: EtaContent) {
  const dispatch = content.operations?.dispatch;
  return {
    speedKmph: setting(dispatch?.riderEtaSpeedKmph, 24, 6, 45),
    routeFactor: setting(dispatch?.riderEtaRouteFactor, 1.4, 1, 2),
    handoverBufferMinutes: Math.round(setting(dispatch?.riderEtaHandoverBufferMinutes, 10, 0, 30)),
  };
}

export function applyEtaHandoverBuffer(baseMinutes: number, directDistanceKm: number, bufferMinutes: number) {
  if (bufferMinutes <= 0) return baseMinutes;
  const taper = Math.min(1, Math.max(0, directDistanceKm / 0.5));
  return baseMinutes + Math.round(bufferMinutes * taper);
}

// Legacy Play Store clients read this field as arrival time. Adapt only the
// customer-facing payload; never mutate the routing provider's cached travel time.
export function customerDeliveryRoute<T extends { durationMinutes: number }>(
  route: T | null,
  deliveryMinutes: number | null | undefined,
) {
  if (!route) return null;
  return {
    ...route,
    travelDurationMinutes: route.durationMinutes,
    durationMinutes: typeof deliveryMinutes === "number" && Number.isFinite(deliveryMinutes)
      ? Math.max(1, Math.round(deliveryMinutes)) : route.durationMinutes,
  };
}
