import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { appStateStorage } from "@/src/lib/app-storage";
import type { SavedLocation, StartupStatus } from "@/src/types/location";

type LocationStore = {
  isHydrated: boolean;
  startupStatus: StartupStatus;
  permissionGranted: boolean | null;
  currentCoordinates: { latitude: number; longitude: number } | null;
  selectedLocation: SavedLocation | null;
  savedLocations: SavedLocation[];
  setStartupStatus: (status: StartupStatus) => void;
  setPermissionGranted: (value: boolean) => void;
  setCurrentCoordinates: (coords: { latitude: number; longitude: number } | null) => void;
  setSelectedLocation: (location: SavedLocation | null) => void;
  upsertSavedLocation: (location: SavedLocation) => void;
  removeSavedLocation: (locationId: string) => void;
  hydrateSavedLocations: (locations: SavedLocation[]) => void;
  clearLocations: () => void;
  setHydrated: (value: boolean) => void;
};

function serviceAreaKey(location?: SavedLocation | null) {
  const area = location?.serviceArea;
  return [
    area?.districtId ?? "",
    area?.zoneId ?? "",
    area?.zoneSlug ?? "",
    area?.zoneName ?? "",
    area?.radiusKm ?? "",
  ].join(":");
}

function areLocationsEqual(left: SavedLocation[], right: SavedLocation[]) {
  if (left.length !== right.length) return false;

  return left.every((location, index) => {
    const next = right[index];
    return (
      location.id === next?.id &&
      location.label === next?.label &&
      location.address === next?.address &&
      (location.addressDetails ?? "") === (next?.addressDetails ?? "") &&
      location.latitude === next?.latitude &&
      location.longitude === next?.longitude &&
      location.source === next?.source &&
      Boolean(location.isDefault) === Boolean(next?.isDefault) &&
      serviceAreaKey(location) === serviceAreaKey(next) &&
      (location.lastUsedAt ?? null) === (next?.lastUsedAt ?? null)
    );
  });
}

function sortLocations(locations: SavedLocation[]) {
  return [...locations].sort((left, right) => {
    if (left.isDefault && !right.isDefault) return -1;
    if (!left.isDefault && right.isDefault) return 1;

    const leftUsedAt = left.lastUsedAt ? new Date(left.lastUsedAt).getTime() : 0;
    const rightUsedAt = right.lastUsedAt ? new Date(right.lastUsedAt).getTime() : 0;
    return rightUsedAt - leftUsedAt;
  });
}

function normalizeSingleLocation(locations: SavedLocation[]) {
  return sortLocations(locations).slice(0, 1).map((location) => ({
    ...location,
    isDefault: true,
  }));
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      isHydrated: false,
      startupStatus: "loading_location",
      permissionGranted: null,
      currentCoordinates: null,
      selectedLocation: null,
      savedLocations: [],
      setHydrated: (isHydrated) => set({ isHydrated }),
      setStartupStatus: (startupStatus) => set({ startupStatus }),
      setPermissionGranted: (permissionGranted) => set({ permissionGranted }),
      setCurrentCoordinates: (currentCoordinates) => set({ currentCoordinates }),
      setSelectedLocation: (selectedLocation) => set({ selectedLocation }),
      upsertSavedLocation: (location) =>
        set((state) => {
          const nextLocations = normalizeSingleLocation([
            {
              ...location,
              isDefault: true,
              lastUsedAt: location.lastUsedAt ?? new Date().toISOString(),
            },
          ]);

          return {
            savedLocations: nextLocations,
          };
        }),
      removeSavedLocation: (locationId) =>
        set((state) => {
          const nextLocations = state.savedLocations.filter(
            (location) => location.id !== locationId
          );
          const selectedLocation =
            state.selectedLocation?.id === locationId ? nextLocations[0] ?? null : state.selectedLocation;

          return {
            selectedLocation,
            savedLocations: nextLocations,
          };
        }),
      hydrateSavedLocations: (locations) =>
        set((state) => {
          const nextLocations = normalizeSingleLocation(locations);
          const nextSelectedLocation =
            nextLocations.find((location) => location.id === state.selectedLocation?.id) ??
            state.selectedLocation ??
            nextLocations[0] ??
            null;

          const selectedLocationUnchanged =
            (state.selectedLocation?.id ?? null) === (nextSelectedLocation?.id ?? null) &&
            (state.selectedLocation?.address ?? null) === (nextSelectedLocation?.address ?? null) &&
            (state.selectedLocation?.addressDetails ?? null) === (nextSelectedLocation?.addressDetails ?? null) &&
            (state.selectedLocation?.label ?? null) === (nextSelectedLocation?.label ?? null) &&
            (state.selectedLocation?.latitude ?? null) === (nextSelectedLocation?.latitude ?? null) &&
            (state.selectedLocation?.longitude ?? null) === (nextSelectedLocation?.longitude ?? null) &&
            (state.selectedLocation?.source ?? null) === (nextSelectedLocation?.source ?? null) &&
            (state.selectedLocation?.lastUsedAt ?? null) === (nextSelectedLocation?.lastUsedAt ?? null) &&
            serviceAreaKey(state.selectedLocation) === serviceAreaKey(nextSelectedLocation) &&
            (state.selectedLocation?.isDefault ?? false) === (nextSelectedLocation?.isDefault ?? false);

          if (
            areLocationsEqual(state.savedLocations, nextLocations) &&
            selectedLocationUnchanged
          ) {
            return state;
          }

          return {
            selectedLocation: nextSelectedLocation,
            savedLocations: nextLocations,
          };
        }),
      clearLocations: () =>
        set({
          currentCoordinates: null,
          selectedLocation: null,
          savedLocations: [],
          startupStatus: "permission_denied",
        }),
    }),
    {
      name: "customer-location-state",
      storage: createJSONStorage(() => appStateStorage),
      partialize: (state) => ({
        permissionGranted: state.permissionGranted,
        currentCoordinates: state.currentCoordinates,
        selectedLocation: state.selectedLocation,
        savedLocations: state.savedLocations,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
