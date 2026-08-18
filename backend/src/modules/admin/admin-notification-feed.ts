export type AdminNotificationFeedSource =
  | "all"
  | "customer"
  | "owner"
  | "rider"
  | "campaign"
  | "scheduled"
  | "ops";

export type AdminRecipientNotificationSource = "customer" | "owner" | "rider";

type AdminNotificationFeedParams = {
  source?: AdminNotificationFeedSource;
  kind?: "all" | "notifications" | "push";
  recipientType?: "all" | "customers" | "owners" | "riders";
};

const recipientTypeSource: Record<
  Exclude<AdminNotificationFeedParams["recipientType"], "all" | undefined>,
  AdminRecipientNotificationSource
> = {
  customers: "customer",
  owners: "owner",
  riders: "rider",
};

/**
 * The default admin inbox is admin-owned activity only. Recipient notifications
 * remain available as delivery history when an admin explicitly asks for them.
 */
export function shouldLoadAdminRecipientSource(
  params: AdminNotificationFeedParams,
  source: AdminRecipientNotificationSource,
) {
  if (params.source && params.source !== "all") {
    return params.source === source;
  }
  if (params.kind === "notifications") return true;
  if (params.recipientType && params.recipientType !== "all") {
    return recipientTypeSource[params.recipientType] === source;
  }
  return false;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown) {
  const parsed = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedEventFamily(value: unknown) {
  const normalized = stringValue(value)
    .toLowerCase()
    .replace(/^order[._-]/, "")
    .replace(/[^a-z0-9]+/g, "");

  if (normalized === "created" || normalized === "placed") return "created";
  return normalized;
}

function structuralKey(item: Record<string, unknown>) {
  const source = stringValue(item.source);
  const id = stringValue(item.id);
  const campaignId = stringValue(item.campaignId);

  if ((source === "campaign" || source === "scheduled") && (campaignId || id)) {
    return `campaign:${campaignId || id}`;
  }

  if (source === "owner" || source === "ops") {
    const eventType = normalizedEventFamily(item.eventType || item.type);
    const entityType = stringValue(item.entityType) || "order";
    const entityId = stringValue(item.entityId);
    if (eventType && entityId) {
      return `business:${entityType}:${entityId}:${eventType}`;
    }
  }

  return source && id ? `${source}:${id}` : "";
}

function detailScore(item: Record<string, unknown>) {
  const source = stringValue(item.source);
  const sourcePriority = source === "ops" ? 2 : source === "scheduled" ? 1 : 0;
  return sourcePriority + [
    item.campaignId,
    item.eventType,
    item.entityId,
    item.scheduledAt,
    item.sentAt,
    item.failureReason,
    item.conversions,
    item.metadata,
  ].filter(Boolean).length;
}

export function dedupeAdminNotificationItems<T extends Record<string, unknown>>(
  items: T[],
) {
  const byKey = new Map<string, T>();
  const withoutKey: T[] = [];

  for (const item of items) {
    const key = structuralKey(item);
    if (!key) {
      withoutKey.push(item);
      continue;
    }

    const existing = byKey.get(key);
    if (
      !existing ||
      detailScore(item) > detailScore(existing) ||
      (detailScore(item) === detailScore(existing) &&
        timestamp(item.createdAt) > timestamp(existing.createdAt))
    ) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values(), ...withoutKey].sort(
    (left, right) => timestamp(right.createdAt) - timestamp(left.createdAt),
  );
}
