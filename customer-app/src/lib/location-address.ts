import type * as Location from "expo-location";

import type { SavedLocation } from "@/src/types/location";

function cleanAddressPart(part?: string | null) {
  return part?.trim().replace(/\s+/g, " ") ?? "";
}

function shouldHideAddressPart(part: string) {
  const normalized = part.toLowerCase();
  return normalized === "bangladesh" || /\bdivision\b/i.test(part);
}

export function formatCustomerAddressLine(
  address?: string | null,
  fallback = "",
) {
  const seen = new Set<string>();
  const formatted = (address ?? "")
    .split(",")
    .map(cleanAddressPart)
    .filter((part) => {
      if (!part || shouldHideAddressPart(part)) return false;

      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");

  return formatted || fallback;
}

export function buildCustomerAddressFromGeocode(
  address?: Partial<Location.LocationGeocodedAddress> | null,
  fallback = "Current precise location",
) {
  if (!address) return fallback;

  return formatCustomerAddressLine(
    [address.name, address.street, address.district, address.city]
      .map(cleanAddressPart)
      .filter(Boolean)
      .join(", "),
    fallback,
  );
}

export function buildCustomerLabelFromGeocode(
  address?: Partial<Location.LocationGeocodedAddress> | null,
  fallback = "",
) {
  if (!address) return fallback;

  return (
    cleanAddressPart(address.name) ||
    cleanAddressPart(address.street) ||
    cleanAddressPart(address.district) ||
    cleanAddressPart(address.city) ||
    fallback
  );
}

export function formatDeliveryAddress(
  location?: SavedLocation | null,
  fallback = "",
) {
  if (!location) return fallback;

  return [formatCustomerAddressLine(location.address), location.addressDetails]
    .map(cleanAddressPart)
    .filter(Boolean)
    .join(", ") || fallback;
}
