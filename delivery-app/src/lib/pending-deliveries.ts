import { useSyncExternalStore } from "react";

import { ApiRequestError } from "@/src/lib/api";
import { secureStateStorage } from "@/src/lib/secure-storage";

// Offline-safe "Delivered": at the customer's door the network is often weak. If the
// deliver request fails for NETWORK reasons we keep it here and resend automatically when
// the connection is back (backend deliver is idempotent, so a double send is harmless).
// A real rejection (wrong code, not in transit…) is NOT queued — the rider sees it at once.

export type PendingDelivery = { orderId: string; code?: string; queuedAt: number };

const STORAGE_KEY = "foodbela-rider-pending-deliveries";
/** Give up after this long — admin/support takes over a delivery stuck that long. */
export const PENDING_DELIVERY_TTL_MS = 6 * 60 * 60 * 1000;

let queue: PendingDelivery[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

async function persist() {
  try {
    await secureStateStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // storage unavailable: the in-memory queue still works for this session
  }
}

export async function loadPendingDeliveries() {
  if (loaded) return queue;
  loaded = true;
  try {
    const raw = await secureStateStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingDelivery[]) : [];
    queue = prunePendingDeliveries(Array.isArray(parsed) ? parsed : []);
  } catch {
    queue = [];
  }
  emit();
  return queue;
}

/** Drop expired / malformed entries and duplicates (latest wins). Pure, for testing. */
export function prunePendingDeliveries(items: PendingDelivery[], now = Date.now()) {
  const byOrder = new Map<string, PendingDelivery>();
  for (const item of items) {
    if (!item || typeof item.orderId !== "string" || !item.orderId) continue;
    if (typeof item.queuedAt !== "number" || now - item.queuedAt > PENDING_DELIVERY_TTL_MS) continue;
    byOrder.set(item.orderId, item);
  }
  return [...byOrder.values()];
}

/** Network trouble (or a 5xx) → worth queueing; a 4xx is a real answer from the server. */
export function isRetryableDeliveryError(error: unknown) {
  if (error instanceof ApiRequestError) return (error.status ?? 0) >= 500;
  return true;
}

export async function queuePendingDelivery(orderId: string, code?: string) {
  await loadPendingDeliveries();
  queue = prunePendingDeliveries([...queue, { orderId, code, queuedAt: Date.now() }]);
  emit();
  await persist();
}

export async function removePendingDelivery(orderId: string) {
  queue = queue.filter((item) => item.orderId !== orderId);
  emit();
  await persist();
}

export function getPendingDeliveries() {
  return queue;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Order ids waiting to be sent (for "Delivered · sending when online" badges). */
export function usePendingDeliveryIds() {
  return useSyncExternalStore(subscribe, () => queue, () => queue);
}
