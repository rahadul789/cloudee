import { apiPostWithOptionalAuth } from "@/src/lib/api";
import { appStateStorage } from "@/src/lib/app-storage";

export const customerAnalyticsEventTypes = [
  "page_view",
  "restaurant_view",
  "menu_item_view",
  "cart_add",
  "cart_view",
  "checkout_start",
  "payment_initiated",
  "payment_completed",
  "payment_failed",
  "payment_cancelled",
  "signup_started",
  "signup_completed",
  "order_created",
  "search",
  "campaign_open",
  "voucher_applied",
  "custom",
] as const;

export type CustomerAnalyticsEventType =
  (typeof customerAnalyticsEventTypes)[number];

export type AnalyticsMetadataValue =
  | string
  | number
  | boolean
  | null
  | AnalyticsMetadataValue[]
  | { [key: string]: AnalyticsMetadataValue };

export type AnalyticsMetadata = Record<string, AnalyticsMetadataValue>;

type TrackCustomerEventInput = {
  eventType: CustomerAnalyticsEventType;
  path: string;
  screenName?: string;
  entityType?: string;
  entityId?: string;
  metadata?: AnalyticsMetadata;
};

const anonymousIdStorageKey = "customer-app:analytics:anonymous-id";
const attributionStorageKey = "customer-app:analytics:last-attribution";
const attributionCacheTtlMs = 60_000;
const analyticsRequestTimeoutMs = 6_000;
const maxAnalyticsQueueSize = 40;
const maxAnalyticsConcurrency = 2;
const sessionId = buildId("session");
let anonymousIdPromise: Promise<string> | null = null;
let rememberedAttributionPromise: Promise<CustomerAnalyticsAttribution | null> | null = null;
let rememberedAttributionCache:
  | {
      value: CustomerAnalyticsAttribution | null;
      expiresAt: number;
    }
  | null = null;
let activeAnalyticsRequests = 0;
const analyticsQueue: {
  input: TrackCustomerEventInput;
  occurredAt: string;
  resolve: () => void;
}[] = [];

export type CustomerAnalyticsAttribution = {
  source?: string;
  medium?: string;
  campaignId?: string;
  voucherId?: string;
  referrer?: string;
  path?: string;
  capturedAt?: string;
};

function buildId(prefix: string) {
  const cryptoObject = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  const uuid = cryptoObject?.randomUUID?.();

  if (uuid) {
    return `${prefix}_${uuid}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

async function getAnonymousId() {
  if (!anonymousIdPromise) {
    anonymousIdPromise = (async () => {
      try {
        const existingId = await appStateStorage.getItem(
          anonymousIdStorageKey,
        );
        if (existingId) {
          return existingId;
        }

        const newId = buildId("anon");
        await appStateStorage.setItem(anonymousIdStorageKey, newId);
        return newId;
      } catch {
        return buildId("anon");
      }
    })();
  }

  return anonymousIdPromise;
}

function hasAttributionValue(input: CustomerAnalyticsAttribution) {
  return Boolean(
    input.source ||
      input.medium ||
      input.campaignId ||
      input.voucherId ||
      input.referrer,
  );
}

async function readRememberedAttribution() {
  try {
    const rawValue = await appStateStorage.getItem(attributionStorageKey);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as CustomerAnalyticsAttribution;
    return hasAttributionValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getRememberedAttribution() {
  const now = Date.now();
  if (rememberedAttributionCache && rememberedAttributionCache.expiresAt > now) {
    return rememberedAttributionCache.value;
  }

  if (!rememberedAttributionPromise) {
    rememberedAttributionPromise = readRememberedAttribution().finally(() => {
      rememberedAttributionPromise = null;
    });
  }

  const value = await rememberedAttributionPromise;
  rememberedAttributionCache = {
    value,
    expiresAt: Date.now() + attributionCacheTtlMs,
  };
  return value;
}

export async function rememberCustomerAttribution(
  input: CustomerAnalyticsAttribution,
) {
  if (!hasAttributionValue(input)) return;

  const nextAttribution = {
    ...input,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
  rememberedAttributionCache = {
    value: nextAttribution,
    expiresAt: Date.now() + attributionCacheTtlMs,
  };

  try {
    await appStateStorage.setItem(
      attributionStorageKey,
      JSON.stringify(nextAttribution),
    );
  } catch {
    // Attribution is helpful for analytics, but it must never interrupt the app.
  }
}

async function sendCustomerEvent(
  input: TrackCustomerEventInput,
  occurredAt: string,
) {
  const controller =
    typeof AbortController === "undefined" ? null : new AbortController();
  const timeout = setTimeout(() => {
    controller?.abort();
  }, analyticsRequestTimeoutMs);

  try {
    const anonymousId = await getAnonymousId();
    const attribution = await getRememberedAttribution();
    const metadata = attribution
      ? {
          attribution,
          ...(input.metadata ?? {}),
        }
      : input.metadata;

    // Optional-auth: attributes to the real customerId when signed in, stays anonymous for
    // guests — otherwise every event (even a logged-in customer's) lands as a "guest".
    await apiPostWithOptionalAuth("/customer/analytics/events", {
      ...input,
      metadata,
      anonymousId,
      sessionId,
      sourceApp: "customer-app",
      occurredAt,
    }, controller ? { signal: controller.signal } : undefined);
  } catch {
    // Analytics must never block browsing, checkout, or auth flows.
  } finally {
    clearTimeout(timeout);
  }
}

function drainAnalyticsQueue() {
  while (
    activeAnalyticsRequests < maxAnalyticsConcurrency &&
    analyticsQueue.length > 0
  ) {
    const nextEvent = analyticsQueue.shift();
    if (!nextEvent) return;

    activeAnalyticsRequests += 1;
    void sendCustomerEvent(nextEvent.input, nextEvent.occurredAt).finally(() => {
      activeAnalyticsRequests = Math.max(0, activeAnalyticsRequests - 1);
      nextEvent.resolve();
      drainAnalyticsQueue();
    });
  }
}

export async function trackCustomerEvent(input: TrackCustomerEventInput) {
  return new Promise<void>((resolve) => {
    if (analyticsQueue.length >= maxAnalyticsQueueSize) {
      analyticsQueue.shift()?.resolve();
    }

    analyticsQueue.push({
      input,
      occurredAt: new Date().toISOString(),
      resolve,
    });
    drainAnalyticsQueue();
  });
}
