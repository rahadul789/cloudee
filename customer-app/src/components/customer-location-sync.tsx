import { useEffect } from "react";

import { useCustomerSavedLocationsQuery } from "@/src/hooks/use-customer-api";
import { formatCustomerAddressLine } from "@/src/lib/location-address";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";

export function CustomerLocationSync() {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));
  const hydrateSavedLocations = useLocationStore((state) => state.hydrateSavedLocations);

  const savedLocationsQuery = useCustomerSavedLocationsQuery(isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    const backendLocations = savedLocationsQuery.data;
    if (!backendLocations) return;

    hydrateSavedLocations(
      backendLocations.map((location) => ({
        id: location.id,
        label: location.label,
        address: formatCustomerAddressLine(location.address, "Selected location"),
        addressDetails: location.addressDetails,
        latitude: location.latitude,
        longitude: location.longitude,
        source: location.source,
        isDefault: location.isDefault,
        serviceArea: location.serviceArea ?? null,
        lastUsedAt: location.lastUsedAt,
      }))
    );
  }, [hydrateSavedLocations, isAuthenticated, savedLocationsQuery.data]);

  return null;
}
