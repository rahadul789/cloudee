import * as Location from "expo-location";

import {
  buildCustomerAddressFromGeocode,
  buildCustomerLabelFromGeocode,
} from "@/src/lib/location-address";
import { useLocationStore } from "@/src/store/location-store";
import type { SavedLocation } from "@/src/types/location";

function buildCurrentLocation(coords: { latitude: number; longitude: number }): SavedLocation {
  return {
    id: "current-location",
    label: "My location",
    address: "Current precise location",
    latitude: coords.latitude,
    longitude: coords.longitude,
    source: "gps",
    lastUsedAt: new Date().toISOString(),
  };
}

export async function applyCurrentLocation() {
  const store = useLocationStore.getState();

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    store.setPermissionGranted(false);
    store.setCurrentCoordinates(null);
    if (store.selectedLocation?.source === "gps") {
      const fallbackLocation =
        store.savedLocations.find((location) => location.source !== "gps") ?? null;
      store.setSelectedLocation(fallbackLocation);
    }
    throw new Error("Location permission is needed to use your current location.");
  }

  store.setPermissionGranted(true);
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const coords = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
  store.setCurrentCoordinates(coords);

  const nextLocation = buildCurrentLocation(coords);
  store.setSelectedLocation(nextLocation);

  void Location.reverseGeocodeAsync(coords)
    .then((addresses) => {
      const current = useLocationStore.getState().selectedLocation;
      if (
        current?.id !== nextLocation.id ||
        current.latitude !== nextLocation.latitude ||
        current.longitude !== nextLocation.longitude
      ) {
        return;
      }

      const first = addresses[0];
      useLocationStore.getState().setSelectedLocation({
        ...nextLocation,
        label: buildCustomerLabelFromGeocode(first, "My location"),
        address: buildCustomerAddressFromGeocode(first),
      });
    })
    .catch(() => undefined);

  return nextLocation;
}
