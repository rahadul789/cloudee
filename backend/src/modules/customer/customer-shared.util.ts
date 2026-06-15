// Pure leaf helpers shared across the customer module (cache keys, string
// trimming, currency rounding, distance math). Kept dependency-free so any
// customer sub-module can import them without creating an import cycle.

export const CUSTOMER_READ_CACHE_TTL_MS = 15_000;
export const CUSTOMER_READ_CACHE_MAX_ENTRIES = 500;

export function roundCacheCoordinate(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(4));
}

export function normalizeCacheString(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

export function trimLimitedString(value: unknown, fallback: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (normalized || fallback).slice(0, maxLength);
}

export function normalizeCacheStringArray(values?: string[]) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => normalizeCacheString(value)).filter(Boolean))].sort();
}

export function buildCacheKey(prefix: string, payload: unknown) {
  return `${prefix}:${JSON.stringify(payload)}`
}

export function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function normalizeDistanceKm(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) {
    return 0;
  }

  const roundedDistance = Number(distanceKm.toFixed(2));
  return roundedDistance < 0.1 ? 0 : roundedDistance;
}

export function roundCurrencyAmount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function calculateDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadius = 6371;
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLng = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return normalizeDistanceKm(earthRadius * c);
}
