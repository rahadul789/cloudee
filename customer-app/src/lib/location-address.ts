import type * as Location from "expo-location";

import type { SavedLocation } from "@/src/types/location";

function cleanAddressPart(part?: string | null) {
  return part?.trim().replace(/\s+/g, " ") ?? "";
}

/** Google "Plus codes" (e.g. 8RQ2+X5, 7MJC8RQ2+X5) — meaningless to customers. */
export function isPlusCode(part: string) {
  return /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3}$/i.test(part.trim());
}

function shouldHideAddressPart(part: string) {
  const normalized = part.toLowerCase();
  return (
    normalized === "bangladesh" ||
    normalized === "unnamed road" ||
    /\bdivision\b/i.test(part) ||
    isPlusCode(part)
  );
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

  const name = cleanAddressPart(address.name);
  return (
    (name && !isPlusCode(name) ? name : "") ||
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

const GENERIC_LABELS = new Set([
  "selected location",
  "delivery point",
  "current precise location",
  "current location",
]);

/**
 * Home header line: "Area, District" — never a Plus code. Uses a meaningful label
 * (Home/Work or a real place name) first, then the address parts; the LAST address part
 * (city/district) is appended so the customer always sees which district.
 */
export function formatDeliverToLine(
  location?: Pick<SavedLocation, "label" | "address"> | null,
  fallback = "Choose your location",
) {
  if (!location) return fallback;
  const parts = formatCustomerAddressLine(location.address)
    .split(",")
    .map(cleanAddressPart)
    .filter(Boolean);
  const label = cleanAddressPart(location.label);
  const usableLabel =
    label && !isPlusCode(label) && !GENERIC_LABELS.has(label.toLowerCase()) ? label : "";
  const district = parts.length > 1 ? parts[parts.length - 1] : "";
  if (usableLabel === "Home" || usableLabel === "Work") {
    const place = parts.find((part) => part !== district) ?? "";
    const where = [place, district].filter(Boolean).join(", ");
    return where ? `${usableLabel} · ${where}` : usableLabel;
  }
  const area = usableLabel || parts.find((part) => part !== district) || parts[0] || "";
  if (!area) {
    // Nothing readable (Google only gave a Plus code): showing the code still beats an
    // empty line — plus the district when we know it.
    const rawCode = [label, ...(location.address ?? "").split(",")]
      .map(cleanAddressPart)
      .find((part) => isPlusCode(part));
    if (rawCode) return district ? `${rawCode}, ${district}` : rawCode;
    return district || fallback;
  }
  if (!district || area.toLowerCase() === district.toLowerCase()) return area;
  return `${area}, ${district}`;
}
