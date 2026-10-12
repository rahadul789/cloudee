import type { LocationObject } from "expo-location";

export type RiderLocationPayload = {
  latitude: number;
  longitude: number;
  heading?: number;
  accuracyMeters?: number;
  speedKmph?: number;
};

export function getRiderLocationPayload(position: LocationObject): RiderLocationPayload {
  const { latitude, longitude, heading, accuracy, speed } = position.coords;
  return {
    latitude,
    longitude,
    // Native APIs use -1 when heading/accuracy/speed are unavailable. Optional
    // metadata must not turn otherwise valid coordinates into a rejected PATCH.
    heading: typeof heading === "number" && Number.isFinite(heading) && heading >= 0 && heading <= 360
      ? heading : undefined,
    accuracyMeters: typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0
      ? accuracy : undefined,
    speedKmph: typeof speed === "number" && Number.isFinite(speed) && speed > 0
      ? speed * 3.6 : undefined,
  };
}
