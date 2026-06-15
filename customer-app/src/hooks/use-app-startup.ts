import * as Location from "expo-location";
import { useEffect, useRef } from "react";

import {
  buildCustomerAddressFromGeocode,
  buildCustomerLabelFromGeocode,
} from "@/src/lib/location-address";
import { useLocationStore } from "@/src/store/location-store";

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

        const lastKnownPosition = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60 * 1000,
          requiredAccuracy: 1500,
        });

        if (lastKnownPosition && isMounted) {
          const coords = {
            latitude: lastKnownPosition.coords.latitude,
            longitude: lastKnownPosition.coords.longitude,
          };
          setCurrentCoordinates(coords);

          const selectedLocation = useLocationStore.getState().selectedLocation;
          if (!selectedLocation || selectedLocation.source === "gps") {
            setSelectedLocation({
              id: "current-location",
              label: "Current location",
              address: "Current precise location",
              latitude: coords.latitude,
              longitude: coords.longitude,
              source: "gps" as const,
            });
          }
          setStartupStatus("ready");
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!isMounted) return;

        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentCoordinates(coords);

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

        const location = {
          id: "current-location",
          label: addressLabel,
          address: addressText,
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: "gps" as const,
        };

        const selectedLocation = useLocationStore.getState().selectedLocation;
        if (!selectedLocation || selectedLocation.source === "gps") {
          setSelectedLocation(location);
        }
        setStartupStatus("ready");
      } catch {
        if (!isMounted) return;

        const selectedLocation = clearStaleGpsLocation();
        setStartupStatus(
          selectedLocation ? "ready" : "location_unavailable",
        );
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
