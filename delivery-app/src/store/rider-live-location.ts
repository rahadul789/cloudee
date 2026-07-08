import { create } from "zustand";

// Single, app-wide source of truth for the rider's own live position on every map.
//
// Why this exists: react-native-maps' `showsUserLocation` (the native blue dot) starts
// its OWN location client on every MapView, redraws/blinks on each map re-render, and
// its native clients pile up across screen mounts (which is why the app got heavier the
// longer it ran and only a full restart cleared it). We removed showsUserLocation and
// instead draw a plain marker fed from this store, which is updated by the ONE location
// producer in the app (RiderLocationBridge / the background task). No native location
// client per map, no blink, no accumulation.

export type RiderLiveCoordinate = { latitude: number; longitude: number };

type RiderLiveLocationState = {
  coordinate: RiderLiveCoordinate | null;
  heading: number | null;
  updatedAt: number;
  setFix: (coordinate: RiderLiveCoordinate, heading: number | null) => void;
  clear: () => void;
};

// Moves below this don't push a new object, so subscribed maps only re-render on real
// movement (GPS jitter while stationary won't churn the UI).
const MIN_STORE_MOVE_METERS = 6;

function distanceMeters(a: RiderLiveCoordinate, b: RiderLiveCoordinate) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const useRiderLiveLocationStore = create<RiderLiveLocationState>((set, get) => ({
  coordinate: null,
  heading: null,
  updatedAt: 0,
  setFix: (coordinate, heading) => {
    const current = get().coordinate;
    const headingChanged = heading !== null && heading !== get().heading;
    if (
      current &&
      !headingChanged &&
      distanceMeters(current, coordinate) < MIN_STORE_MOVE_METERS
    ) {
      return;
    }
    set({ coordinate, heading, updatedAt: Date.now() });
  },
  clear: () => set({ coordinate: null, heading: null, updatedAt: 0 }),
}));

// Module-level setters so non-React code (the background TaskManager task, which runs in
// the app's JS context while it is alive) can publish fixes into the same store.
export function setRiderLiveFix(coordinate: RiderLiveCoordinate, heading: number | null) {
  useRiderLiveLocationStore.getState().setFix(coordinate, heading);
}

export function clearRiderLiveFix() {
  useRiderLiveLocationStore.getState().clear();
}
