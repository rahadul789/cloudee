export type StartupStatus =
  | "loading_location"
  | "ready"
  | "permission_denied"
  | "location_unavailable";

export type SavedLocationServiceArea = {
  districtId?: string;
  districtName?: string;
  zoneId?: string;
  zoneSlug?: string;
  zoneName?: string;
  radiusKm?: number | null;
};

export type SavedLocation = {
  id: string;
  label: string;
  address: string;
  addressDetails?: string;
  latitude: number;
  longitude: number;
  source: "gps" | "manual" | "saved";
  isDefault?: boolean;
  serviceArea?: SavedLocationServiceArea | null;
  lastUsedAt?: string | null;
};
