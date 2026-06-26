export function formatDateTimeAmPm(value?: string | Date | null) {
  if (!value) return "Not available yet";

  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  }).format(new Date(value));
}

export function formatDateMedium(value?: string | Date | null) {
  if (!value) return "Not available yet";

  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatTimeAmPm(value?: string | Date | null) {
  if (!value) return "Not available yet";

  return new Intl.DateTimeFormat("en-BD", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatDurationMinutes(
  value?: number | null,
  fallback = "Not available",
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const safeMinutes = Math.max(0, Math.round(value));
  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatDurationRangeMinutes(
  minValue?: number | null,
  maxValue?: number | null,
  fallback = "Not available",
) {
  if (
    typeof minValue !== "number" ||
    typeof maxValue !== "number" ||
    !Number.isFinite(minValue) ||
    !Number.isFinite(maxValue)
  ) {
    return fallback;
  }

  const minMinutes = Math.max(0, Math.round(minValue));
  const maxMinutes = Math.max(minMinutes, Math.round(maxValue));

  if (minMinutes === maxMinutes) {
    return formatDurationMinutes(minMinutes, fallback);
  }

  // Foodpanda-style compact range with a single unit suffix, e.g. "2-7 min".
  if (maxMinutes < 60) {
    return `${minMinutes}-${maxMinutes} min`;
  }

  // Ranges spanning the hour mark are rare for prep/delivery; keep them readable.
  return `${formatDurationMinutes(minMinutes, fallback)} - ${formatDurationMinutes(
    maxMinutes,
    fallback,
  )}`;
}
