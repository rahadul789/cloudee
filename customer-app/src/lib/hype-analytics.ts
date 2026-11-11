import { apiPostWithOptionalAuth } from "@/src/lib/api";

// Per-item Hype engagement for the admin page: seen in the feed, opened, tapped the button,
// opened the website, set a reminder. Each (item, type) is sent at most once per app session,
// batched every few seconds so scrolling the feed never spams the API.

export type HypeEventType = "impression" | "open" | "cta" | "website" | "remind";

const sentThisSession = new Set<string>();
let queue: { id: string; type: HypeEventType }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (!queue.length) return;
  const events = queue.slice(0, 100);
  queue = queue.slice(100);
  void apiPostWithOptionalAuth("/customer/hype/events", { events }).catch(() => undefined);
  if (queue.length) timer = setTimeout(flush, 1500);
}

export function trackHypeEvent(id: string, type: HypeEventType) {
  if (!id) return;
  const key = `${id}:${type}`;
  if (sentThisSession.has(key)) return;
  sentThisSession.add(key);
  queue.push({ id, type });
  if (!timer) timer = setTimeout(flush, 3000);
}

export function trackHypeImpressions(ids: string[]) {
  ids.forEach((id) => trackHypeEvent(id, "impression"));
}
