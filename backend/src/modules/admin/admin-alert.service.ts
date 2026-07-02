import { emitSocketEvent } from "../../config/socket";
import { logger } from "../../config/logger";
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import { sendOperationalAlert } from "../monitoring/alert-notifier";
import { RestaurantModel } from "../auth/auth.model";
import { OrderModel } from "../owner/operational.model";
import { ServiceZoneModel } from "../service-area/service-area.model";
import { buildOrderServiceAreaScopeFilter } from "../service-area/service-area.service";
import {
  classifyAdminAlertType,
  getAdminNotificationSettings,
  isAdminNotificationCategoryEnabled,
} from "./admin-notification-settings";
import { invalidateAdminOperationalHealthCache } from "./business-event.service";
import { AdminOperationalAlertModel } from "./admin-alert.model";

const RESOLVED_ALERT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const adminOperationalAlertsCache = createInMemoryAsyncCache<any>({
  ttlMs: 5_000,
  staleWhileRevalidateMs: 15_000,
  maxEntries: 32,
});

function invalidateAdminOperationalAlertsCache() {
  adminOperationalAlertsCache.clear();
}

type AdminOperationalAlertInput = {
  alertType: string;
  severity?: "info" | "warning" | "critical";
  title: string;
  description?: string;
  source?: string;
  entityType?: string;
  entityId?: string;
  path?: string;
  iconKey?: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
};

type AdminOperationalAlertScope = {
  zoneId?: string;
  districtId?: string;
};

function serializeAlert(alert: Record<string, any>) {
  const metadata = (alert.metadata ?? {}) as Record<string, unknown>;
  const scope = metadataScope(metadata);
  return {
    id: String(alert._id ?? alert.id ?? ""),
    source: "ops" as const,
    type: String(alert.alertType ?? "operations"),
    title: String(alert.title ?? ""),
    description: String(alert.description ?? ""),
    recipientId: String(alert.entityId ?? ""),
    recipientName: String(alert.source ?? "Operations"),
    recipientPhone: "",
    path: String(alert.path ?? ""),
    isRead: alert.isRead === true,
    readAt: alert.readAt ? new Date(alert.readAt).toISOString() : null,
    createdAt: alert.createdAt ? new Date(alert.createdAt).toISOString() : null,
    deliveryStatus: String(alert.severity ?? "warning"),
    iconKey: String(alert.iconKey ?? "bell"),
    severity: String(alert.severity ?? "warning"),
    entityType: String(alert.entityType ?? ""),
    entityId: String(alert.entityId ?? ""),
    zoneId: scope.zoneId,
    districtId: scope.districtId,
    metadata,
    resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt).toISOString() : null,
    snoozedUntil: alert.snoozedUntil
      ? new Date(alert.snoozedUntil).toISOString()
      : null,
  };
}

function isOrderRelatedAlert(input: AdminOperationalAlertInput) {
  const alertType = input.alertType;
  return (
    input.entityType === "order" ||
    input.path?.startsWith("/orders") ||
    alertType.startsWith("order_") ||
    alertType.startsWith("rider_") ||
    alertType.startsWith("delivery_") ||
    alertType.startsWith("restaurant_") ||
    alertType === "owner_response_late" ||
    alertType === "prep_start_late" ||
    alertType === "food_prepare_late"
  );
}

function stringDetail(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeScopeId(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && "toString" in value) return String(value).trim();
  return "";
}

function alertOrderId(
  alert: Pick<ReturnType<typeof serializeAlert>, "entityType" | "entityId" | "metadata">,
) {
  const metadata = (alert.metadata ?? {}) as Record<string, unknown>;
  const metadataOrderId = normalizeScopeId(metadata.orderId);
  if (metadataOrderId) return metadataOrderId;
  return alert.entityType === "order" ? normalizeScopeId(alert.entityId) : "";
}

function isTerminalOrderAlertType(alertType: string) {
  return (
    alertType.includes("cancelled") ||
    alertType.includes("rejected") ||
    alertType.includes("delivered") ||
    alertType.includes("refund") ||
    alertType.includes("terminal")
  );
}

async function shouldSkipTerminalOrderAlert(input: AdminOperationalAlertInput) {
  if (!isOrderRelatedAlert(input) || isTerminalOrderAlertType(input.alertType)) {
    return false;
  }
  const metadata = input.metadata ?? {};
  const orderId =
    normalizeScopeId(metadata.orderId) ||
    (input.entityType === "order" ? normalizeScopeId(input.entityId) : "");
  if (!orderId) return false;

  const order = await OrderModel.findById(orderId, { status: 1 }).lean();
  return ["Cancelled", "Rejected", "Delivered"].includes(String(order?.status ?? ""));
}

function metadataScope(metadata: Record<string, unknown>) {
  const serviceArea =
    (typeof metadata.serviceAreaSnapshot === "object" && metadata.serviceAreaSnapshot
      ? metadata.serviceAreaSnapshot
      : typeof metadata.serviceArea === "object" && metadata.serviceArea
        ? metadata.serviceArea
        : {}) as Record<string, unknown>;
  return {
    zoneId: normalizeScopeId(metadata.zoneId) || normalizeScopeId(serviceArea.zoneId),
    districtId:
      normalizeScopeId(metadata.districtId) || normalizeScopeId(serviceArea.districtId),
  };
}

async function enrichAlertInputWithArea(input: AdminOperationalAlertInput) {
  const metadata = input.metadata ?? {};
  const currentScope = metadataScope(metadata);
  if (currentScope.zoneId || currentScope.districtId) {
    return {
      ...input,
      metadata: {
        ...metadata,
        zoneId: currentScope.zoneId,
        districtId: currentScope.districtId,
      },
    };
  }

  const orderId =
    normalizeScopeId(metadata.orderId) ||
    (input.entityType === "order" ? normalizeScopeId(input.entityId) : "");
  if (!orderId) return input;

  const order = await OrderModel.findById(orderId, { serviceAreaSnapshot: 1 }).lean();
  const serviceArea = (order?.serviceAreaSnapshot ?? {}) as Record<string, unknown>;
  const zoneId = normalizeScopeId(serviceArea.zoneId);
  const districtId = normalizeScopeId(serviceArea.districtId);
  if (!zoneId && !districtId) return input;

  return {
    ...input,
    metadata: {
      ...metadata,
      serviceAreaSnapshot: serviceArea,
      zoneId,
      districtId,
    },
  };
}

async function buildAlertScopeContext(scope: AdminOperationalAlertScope = {}) {
  const zoneId = normalizeScopeId(scope.zoneId);
  const districtId = normalizeScopeId(scope.districtId);
  if (!zoneId && !districtId) return null;

  const zoneIds = new Set<string>();
  const districtIds = new Set<string>();

  if (zoneId) {
    zoneIds.add(zoneId);
    const zone = await ServiceZoneModel.findById(zoneId, { districtId: 1 }).lean();
    const parentDistrictId = normalizeScopeId(zone?.districtId);
    if (parentDistrictId) districtIds.add(parentDistrictId);
  } else if (districtId) {
    districtIds.add(districtId);
    const zones = await ServiceZoneModel.find(
      { districtId, status: { $ne: "archived" } },
      { _id: 1 },
    ).lean();
    zones.forEach((zone) => {
      const scopedZoneId = normalizeScopeId(zone._id);
      if (scopedZoneId) zoneIds.add(scopedZoneId);
    });
  }

  return { zoneIds, districtIds };
}

function alertMatchesScope(
  alert: ReturnType<typeof serializeAlert>,
  scopeContext: Awaited<ReturnType<typeof buildAlertScopeContext>>,
  scopedOrderIds: Set<string>,
) {
  if (!scopeContext) return true;

  const metadata = (alert.metadata ?? {}) as Record<string, unknown>;
  const scope = metadataScope(metadata);
  if (scope.zoneId && scopeContext.zoneIds.has(scope.zoneId)) return true;
  if (scope.districtId && scopeContext.districtIds.has(scope.districtId)) return true;

  const orderId = alertOrderId(alert);
  return Boolean(orderId && scopedOrderIds.has(orderId));
}

function buildAlertReadScopeQuery(
  scopeContext: Awaited<ReturnType<typeof buildAlertScopeContext>>,
) {
  if (!scopeContext) return {};

  const clauses: Record<string, unknown>[] = [];
  const zoneIds = Array.from(scopeContext.zoneIds);
  const districtIds = Array.from(scopeContext.districtIds);

  if (zoneIds.length) {
    clauses.push(
      { "metadata.zoneId": { $in: zoneIds } },
      { "metadata.serviceArea.zoneId": { $in: zoneIds } },
      { "metadata.serviceAreaSnapshot.zoneId": { $in: zoneIds } },
    );
  }
  if (districtIds.length) {
    clauses.push(
      { "metadata.districtId": { $in: districtIds } },
      { "metadata.serviceArea.districtId": { $in: districtIds } },
      { "metadata.serviceAreaSnapshot.districtId": { $in: districtIds } },
    );
  }

  return clauses.length ? { $or: clauses } : { _id: { $in: [] } };
}

function joinNameAndContact(name: unknown, contact: unknown) {
  return [stringDetail(name), stringDetail(contact)].filter(Boolean).join(" · ");
}

async function buildExternalOrderAlertMessage(
  payload: ReturnType<typeof serializeAlert>,
  input: AdminOperationalAlertInput,
) {
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const orderId = stringDetail(metadata.orderId) || payload.entityId || input.entityId || "";
  const order = orderId
    ? await OrderModel.findById(orderId)
        .select({
          orderNumber: 1,
          status: 1,
          customerSnapshot: 1,
          riderSnapshot: 1,
          restaurantId: 1,
          pricing: 1,
        })
        .lean()
    : null;
  const restaurant = order?.restaurantId
    ? await RestaurantModel.findById(order.restaurantId)
        .select({ name: 1, contact: 1 })
        .lean()
    : null;
  const details: Record<string, unknown> = {
    orderNumber:
      stringDetail(metadata.orderNumber) ||
      stringDetail(order?.orderNumber) ||
      stringDetail(payload.entityId),
    status: stringDetail(metadata.status) || stringDetail(order?.status),
    customer: joinNameAndContact(
      metadata.customerName || order?.customerSnapshot?.fullName,
      metadata.customerPhone || order?.customerSnapshot?.phone,
    ),
    restaurant: joinNameAndContact(
      metadata.restaurantName || restaurant?.name,
      metadata.restaurantPhone || restaurant?.contact?.phone,
    ),
    rider: joinNameAndContact(
      metadata.riderName || order?.riderSnapshot?.name,
      metadata.riderPhone || order?.riderSnapshot?.phone,
    ),
    total: stringDetail(metadata.total || order?.pricing?.total)
      ? `Tk ${Math.round(Number(metadata.total || order?.pricing?.total) || 0)}`
      : "",
    lateByMinutes: stringDetail(metadata.lateByMinutes),
    readyMinutes: stringDetail(metadata.readyMinutes),
    assignedMinutes: stringDetail(metadata.assignedMinutes),
    pickupMinutes: stringDetail(metadata.pickupMinutes),
    deliveryAddress: stringDetail(metadata.deliveryAddress),
    path: payload.path,
  };

  return {
    dedupeKey: `admin-alert:${input.dedupeKey}`,
    severity: (payload.severity === "critical" || payload.severity === "info"
      ? payload.severity
      : "warning") as "critical" | "warning" | "info",
    layer: "operations" as const,
    title: payload.title,
    body: [payload.description, payload.path ? `Admin path: ${payload.path}` : ""]
      .filter(Boolean)
      .join("\n"),
    details: Object.fromEntries(
      Object.entries(details).filter(([, value]) => stringDetail(value)),
    ),
  };
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function updateExistingAlert(input: AdminOperationalAlertInput) {
  const existing = await AdminOperationalAlertModel.findOne({
    dedupeKey: input.dedupeKey,
  });

  if (!existing) return null;

  existing.lastSeenAt = new Date();
  existing.description = input.description ?? existing.description;
  existing.title = input.title || existing.title;
  existing.severity = input.severity ?? existing.severity;
  existing.source = input.source ?? existing.source;
  existing.entityType = input.entityType ?? existing.entityType;
  existing.entityId = input.entityId ?? existing.entityId;
  existing.path = input.path ?? existing.path;
  existing.iconKey = input.iconKey ?? existing.iconKey;
  existing.metadata = { ...(existing.metadata ?? {}), ...(input.metadata ?? {}) };
  await existing.save();
  return existing;
}

export async function createAdminOperationalAlert(
  input: AdminOperationalAlertInput,
) {
  const scopedInput = await enrichAlertInputWithArea(input);
  const settings = await getAdminNotificationSettings();
  const category = classifyAdminAlertType(scopedInput.alertType);
  if (!isAdminNotificationCategoryEnabled(settings, category)) {
    return { alert: null, created: false, skipped: true };
  }
  if (await shouldSkipTerminalOrderAlert(scopedInput)) {
    return { alert: null, created: false, skipped: true };
  }

  const existing = await updateExistingAlert(scopedInput);

  if (existing) {
    invalidateAdminOperationalAlertsCache();
    invalidateAdminOperationalHealthCache();
    return { alert: serializeAlert(existing.toObject()), created: false };
  }

  let alert;
  try {
    alert = await AdminOperationalAlertModel.create({
      alertType: scopedInput.alertType,
      severity: scopedInput.severity ?? "warning",
      title: scopedInput.title,
      description: scopedInput.description ?? "",
      source: scopedInput.source ?? "operations",
      entityType: scopedInput.entityType ?? "",
      entityId: scopedInput.entityId ?? "",
      path: scopedInput.path ?? "",
      iconKey: scopedInput.iconKey ?? "bell",
      dedupeKey: scopedInput.dedupeKey,
      metadata: scopedInput.metadata ?? {},
      lastSeenAt: new Date(),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const duplicate = await updateExistingAlert(scopedInput);
    if (!duplicate) throw error;
    return { alert: serializeAlert(duplicate.toObject()), created: false };
  }
  const payload = serializeAlert(alert.toObject());

  emitSocketEvent("admin:ops", "admin.notification.created", payload);
  if (isOrderRelatedAlert(scopedInput)) {
    void buildExternalOrderAlertMessage(payload, scopedInput)
      .then((message) => sendOperationalAlert(message))
      .catch((error) => {
        logger.warn(
          { error, alertId: payload.id },
          "Failed to send external admin order alert",
        );
      });
  }
  invalidateAdminOperationalAlertsCache();
  invalidateAdminOperationalHealthCache();
  return { alert: payload, created: true };
}

export async function listAdminOperationalAlerts(scope: AdminOperationalAlertScope = {}) {
  const scopeKey = normalizeScopeId(scope.zoneId)
    ? `zone:${normalizeScopeId(scope.zoneId)}`
    : normalizeScopeId(scope.districtId)
      ? `district:${normalizeScopeId(scope.districtId)}`
      : "all";

  return adminOperationalAlertsCache.getOrSet(`admin-operational-alerts:${scopeKey}`, async () => {
    const rows = await AdminOperationalAlertModel.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const alerts = rows.map((row) => serializeAlert(row));
    const scopeContext = await buildAlertScopeContext(scope);
    if (!scopeContext) return alerts;

    const orderIds = Array.from(
      new Set(alerts.map((alert) => alertOrderId(alert)).filter(Boolean)),
    );
    const scopedOrders = orderIds.length
      ? await OrderModel.find(
          {
            _id: { $in: orderIds },
            ...buildOrderServiceAreaScopeFilter(scope),
          },
          { _id: 1 },
        ).lean()
      : [];
    const scopedOrderIds = new Set(scopedOrders.map((order) => String(order._id ?? "")));

    return alerts.filter((alert) => alertMatchesScope(alert, scopeContext, scopedOrderIds));
  });
}

export async function markAdminOperationalAlertRead(
  alertId: string,
  scope: AdminOperationalAlertScope = {},
) {
  if (scope.zoneId || scope.districtId) {
    const scopedAlerts = await listAdminOperationalAlerts(scope);
    if (!scopedAlerts.some((alert: { id?: string }) => alert.id === alertId)) {
      return { updated: false };
    }
  }
  const result = await AdminOperationalAlertModel.updateOne(
    { _id: alertId },
    { $set: { isRead: true, readAt: new Date() } },
  );
  if (result.modifiedCount > 0) {
    invalidateAdminOperationalAlertsCache();
    invalidateAdminOperationalHealthCache();
  }
  return { updated: result.modifiedCount > 0 };
}

export async function resolveAdminOperationalAlert(alertId: string) {
  const resolvedAt = new Date();
  const result = await AdminOperationalAlertModel.updateOne(
    { _id: alertId },
    {
      $set: {
        isRead: true,
        readAt: resolvedAt,
        resolvedAt,
        snoozedUntil: null,
      },
    },
  );
  if (result.modifiedCount > 0) {
    invalidateAdminOperationalAlertsCache();
    invalidateAdminOperationalHealthCache();
  }
  return { updated: result.modifiedCount > 0 };
}

export async function resolveAdminOperationalAlertByDedupeKey(dedupeKey: string) {
  const resolvedAt = new Date();
  const result = await AdminOperationalAlertModel.updateOne(
    { dedupeKey, resolvedAt: null },
    {
      $set: {
        isRead: true,
        readAt: resolvedAt,
        resolvedAt,
        snoozedUntil: null,
      },
    },
  );
  if (result.modifiedCount > 0) {
    invalidateAdminOperationalAlertsCache();
    invalidateAdminOperationalHealthCache();
  }
  return { updated: result.modifiedCount > 0 };
}

export async function snoozeAdminOperationalAlert(alertId: string, minutes: number) {
  const snoozeMinutes = Math.min(24 * 60, Math.max(5, Math.round(minutes)));
  const snoozedUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000);
  const result = await AdminOperationalAlertModel.updateOne(
    { _id: alertId },
    {
      $set: {
        snoozedUntil,
      },
    },
  );
  if (result.modifiedCount > 0) {
    invalidateAdminOperationalAlertsCache();
    invalidateAdminOperationalHealthCache();
  }
  return {
    updated: result.modifiedCount > 0,
    snoozedUntil: snoozedUntil.toISOString(),
  };
}

export async function markAllAdminOperationalAlertsRead(
  scope: AdminOperationalAlertScope = {},
) {
  const scopeContext = await buildAlertScopeContext(scope);
  if (scopeContext) {
    const rows = await AdminOperationalAlertModel.find({ isRead: { $ne: true } }).lean();
    const alerts = rows.map((row) => serializeAlert(row));
    const orderIds = Array.from(
      new Set(alerts.map((alert) => alertOrderId(alert)).filter(Boolean)),
    );
    const scopedOrders = orderIds.length
      ? await OrderModel.find(
          {
            _id: { $in: orderIds },
            ...buildOrderServiceAreaScopeFilter(scope),
          },
          { _id: 1 },
        ).lean()
      : [];
    const scopedOrderIds = new Set(scopedOrders.map((order) => String(order._id ?? "")));
    const scopedAlertIds = alerts
      .filter((alert) => alertMatchesScope(alert, scopeContext, scopedOrderIds))
      .map((alert) => alert.id)
      .filter(Boolean);

    if (!scopedAlertIds.length) return { updated: 0 };

    const scopedResult = await AdminOperationalAlertModel.updateMany(
      { _id: { $in: scopedAlertIds } },
      { $set: { isRead: true, readAt: new Date() } },
    );
    if (scopedResult.modifiedCount > 0) {
      invalidateAdminOperationalAlertsCache();
      invalidateAdminOperationalHealthCache();
    }
    return { updated: scopedResult.modifiedCount };
  }

  const result = await AdminOperationalAlertModel.updateMany(
    { isRead: { $ne: true }, ...buildAlertReadScopeQuery(scopeContext) },
    { $set: { isRead: true, readAt: new Date() } },
  );
  if (result.modifiedCount > 0) {
    invalidateAdminOperationalAlertsCache();
    invalidateAdminOperationalHealthCache();
  }
  return { updated: result.modifiedCount };
}

export async function pruneAdminOperationalAlerts() {
  const cutoff = new Date(Date.now() - RESOLVED_ALERT_RETENTION_MS);
  const result = await AdminOperationalAlertModel.deleteMany({
    resolvedAt: { $lte: cutoff },
  });
  if ((result.deletedCount ?? 0) > 0) {
    invalidateAdminOperationalAlertsCache();
    invalidateAdminOperationalHealthCache();
  }
  return { deleted: result.deletedCount ?? 0 };
}
