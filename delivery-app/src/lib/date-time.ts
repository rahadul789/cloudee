// Foodbela operates in Asia/Dhaka (UTC+6, no DST). Date-range filters must key off the Dhaka
// calendar day, NOT the phone's local timezone — otherwise a device set to another zone puts
// "today" on the wrong day and yesterday's trips leak in. These return real epoch-ms boundaries.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

// Start of "today" in Dhaka, as a real epoch-ms.
export function dhakaStartOfToday(now: number = Date.now()) {
  return Math.floor((now + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
}

// Start of the current month in Dhaka, as a real epoch-ms.
export function dhakaStartOfMonth(now: number = Date.now()) {
  const shifted = new Date(now + DHAKA_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - DHAKA_OFFSET_MS
  );
}

export function formatDateTime(value?: string | null) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-BD", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return "";

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return formatDateTime(value);
}
