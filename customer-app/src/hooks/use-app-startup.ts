import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import {
  buildCustomerAddressFromGeocode,
  buildCustomerLabelFromGeocode,
} from "@/src/lib/location-address";
import { useLocationStore } from "@/src/store/location-store";

// Time-bounds a location promise so a device that can't lock GPS (services off, poor
// signal, indoors) never leaves startup hanging — we fall back instead of dead-ending.
function withLocationTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("location-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function useAppStartup() {
  const hasStartedRef = useRef(false);
  const isLocationHydrated = useLocationStore((state) => state.isHydrated);
  const setStartupStatus = useLocationStore((state) => state.setStartupStatus);
  const setPermissionGranted = useLocationStore(
    (state) => state.setPermissionGranted
  );
  const setCurrentCoordinates = useLocationStore(
    (state) => state.setCurrentCoordinates
  );
  const setSelectedLocation = useLocationStore(
    (state) => state.setSelectedLocation
  );

  useEffect(() => {
    if (!isLocationHydrated) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    let isMounted = true;

    const clearStaleGpsLocation = () => {
      const state = useLocationStore.getState();
      const selectedLocation = state.selectedLocation;
      setCurrentCoordinates(null);
      if (selectedLocation?.source === "gps") {
        const fallbackLocation =
          state.savedLocations.find((location) => location.source !== "gps") ??
          null;
        setSelectedLocation(fallbackLocation);
        return fallbackLocation;
      }
      return selectedLocation;
    };

    async function bootstrapLocation() {
      try {
        setStartupStatus("loading_location");

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;

        if (status !== "granted") {
          setPermissionGranted(false);
          const selectedLocation = clearStaleGpsLocation();
          setStartupStatus(selectedLocation ? "ready" : "permission_denied");
          return;
        }

        setPermissionGranted(true);

        const applyGpsCoordinates = (
          coords: { latitude: number; longitude: number },
          details?: { label: string; address: string },
        ) => {
          setCurrentCoordinates(coords);
          const existing = useLocationStore.getState().selectedLocation;
          // Never override a delivery point the user set by hand (source !== "gps").
          if (!existing || existing.source === "gps") {
            setSelectedLocation({
              id: "current-location",
              label: details?.label ?? "Current location",
              address: details?.address ?? "Current precise location",
              latitude: coords.latitude,
              longitude: coords.longitude,
              source: "gps" as const,
            });
          }
          setStartupStatus("ready");
        };

        // Is device location actually switched on? If OFF, getCurrentPositionAsync only
        // fails/hangs — skip the wait and go straight to the fallback chain.
        let servicesEnabled = true;
        try {
          servicesEnabled = await Location.hasServicesEnabledAsync();
        } catch {
          servicesEnabled = true;
        }
        if (!isMounted) return;

        // Permission is granted but device location (GPS) is OFF. We ONLY pop the system
        // "Turn on location" dialog when there is genuinely nothing to open the app with —
        // i.e. a fresh install with no persisted delivery point. If a prior session already
        // saved a location, we must NOT nag on every launch: we fall through and reuse that
        // saved pin (see FALLBACK 2) so the app opens directly, exactly like before this
        // feature existed. Android only — iOS has no programmatic switch. On decline we
        // continue to the graceful fallback chain either way.
        const hasUsableSavedLocation =
          useLocationStore.getState().selectedLocation != null;
        if (
          !servicesEnabled &&
          Platform.OS === "android" &&
          !hasUsableSavedLocation
        ) {
          try {
            await Location.enableNetworkProviderAsync();
            servicesEnabled = true;
          } catch {
            // Declined or unavailable — leave servicesEnabled false and fall through.
          }
          if (!isMounted) return;
        }

        // FRESH-FIRST: the accurate current position is the PRIMARY source, so a user
        // who has moved (e.g. 1.5km) always lands on their REAL location — never a stale
        // pin. It is time-bounded (10s) so a device that can't lock GPS falls back
        // instead of hanging or dead-ending on "Choose your location first".
        let position: Location.LocationObject | null = null;
        if (servicesEnabled) {
          try {
            position = await withLocationTimeout(
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              }),
              10_000,
            );
          } catch {
            position = null;
          }
          if (!isMounted) return;
        }

        if (position) {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          let addressLabel = "Current location";
          let addressText = "Current precise location";

          try {
            const reverse = await Location.reverseGeocodeAsync(coords);
            if (!isMounted) return;

            const first = reverse[0];
            addressText = buildCustomerAddressFromGeocode(
              first,
              "Netrokona service area",
            );
            addressLabel = buildCustomerLabelFromGeocode(first, "Current location");
          } catch {
            addressText = "Current precise location";
          }

          applyGpsCoordinates(coords, { label: addressLabel, address: addressText });
          return;
        }

        // FALLBACK 1: a cached fix (any age). An approximate pin beats a dead-end — and
        // serviceability is still checked downstream against these REAL coordinates, so
        // an out-of-area user still correctly sees "not in this area", never fake places.
        const lastKnownPosition = await Location.getLastKnownPositionAsync({
          maxAge: 24 * 60 * 60 * 1000,
        });
        if (!isMounted) return;
        if (lastKnownPosition) {
          applyGpsCoordinates({
            latitude: lastKnownPosition.coords.latitude,
            longitude: lastKnownPosition.coords.longitude,
          });
          return;
        }

        // FALLBACK 2: whatever was already selected (persisted from a prior session).
        // Only when there is truly nothing to go on do we surface the manual state.
        const existing = useLocationStore.getState().selectedLocation;
        setStartupStatus(existing ? "ready" : "location_unavailable");
      } catch {
        if (!isMounted) return;

        // Keep any location we already have instead of wiping it — a stale pin near
        // where the user last was beats an empty "choose location" wall on reopen.
        const existing = useLocationStore.getState().selectedLocation;
        setStartupStatus(existing ? "ready" : "location_unavailable");
      }
    }

    void bootstrapLocation();

    return () => {
      isMounted = false;
    };
  }, [
    isLocationHydrated,
    setCurrentCoordinates,
    setPermissionGranted,
    setSelectedLocation,
    setStartupStatus,
  ]);
}
