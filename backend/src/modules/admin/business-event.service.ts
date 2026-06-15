import { logger } from "../../config/logger";
import { getRequestMonitorSnapshot } from "../../common/middleware/request-monitor";
import { getBackgroundTaskQueueSnapshot } from "../../common/utils/background-task";
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import {
  TRACKING_STALE_AFTER_MS,
  decorateTrackingSnapshot,
} from "../../common/utils/tracking-freshness";
import { getSocketConnectionSnapshot } from "../../config/socket";
import { getInfrastructureHealthSnapshot } from "../monitoring/infrastructure-health.service";
import mongoose from "mongoose";
import { AdminOperationalAlertModel } from "./admin-alert.model";
import { AdminModel } from "./admin.model";
import { AdminBusinessEventModel } from "./business-event.model";
import { OwnerModel, RiderModel } from "../auth/auth.model";
import { CustomerModel } from "../customer/customer.model";
import { OrderModel } from "../owner/operational.model";

type BusinessEventCategory =
  | "orders"
  | "dispatch"
  | "notifications"
  | "scheduler"
  | "security"
  | "system";

type BusinessEventSeverity = "info" | "warning" | "critical";

type BusinessEventInput = {
  event: string;
  category: BusinessEventCategory;
  severity?: BusinessEventSeverity;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  actorType?: string;
  actorId?: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
};

type JobState = {
  key: string;
  label: string;
  status: "idle" | "running" | "ok" | "failed";
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastError: string;
};

const schedulerJobs = new Map<string, JobState>();
const adminOperationalHealthCache = createInMemoryAsyncCache<any>({
  ttlMs: 5_000,
  staleWhileRevalidateMs: 15_000,
  maxEntries: 2,
});

export function invalidateAdminOperationalHealthCache() {
  adminOperationalHealthCache.clear();
}

function databaseState() {
  const state = mongoose.connection.readyState;
  if (state === 1) return "connected";
  if (state === 2) return "connecting";
  if (state === 3) return "disconnecting";
  return "disconnected";
}

function getRuntimeSnapshot() {
  const memory = process.memoryUsage();
  const database = databaseState();
  return {
    ready: database === "connected",
    database,
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
    },
    nodeEnv: process.env.NODE_ENV ?? "development",
    pid: process.pid,
  };
}

function serializeDate(value: unknown) {
  return value ? new Date(value as Date).toISOString() : null;
}

function serializeBusinessEvent(row: Record<string, any>) {
  return {
    id: String(row._id ?? row.id ?? ""),
    event: String(row.event ?? ""),
    category: String(row.category ?? "system"),
    severity: String(row.severity ?? "info"),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    entityType: String(row.entityType ?? ""),
    entityId: String(row.entityId ?? ""),
    actorType: String(row.actorType ?? "system"),
    actorId: String(row.actorId ?? ""),
    actorName: String(row.actorName ?? ""),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: serializeDate(row.createdAt),
  };
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeTrackingLocation(tracking: Record<string, any>) {
  const location = tracking.currentLocation;
  if (!location || typeof location !== "object") return null;

  const latitude = numberValue(location.latitude, Number.NaN);
  const longitude = numberValue(location.longitude, Number.NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    heading: Number.isFinite(Number(location.heading)) ? Number(location.heading) : null,
    accuracyMeters: Number.isFinite(Number(location.accuracyMeters))
      ? Number(location.accuracyMeters)
      : null,
  };
}

function serializeLiveLocationOrder(order: Record<string, any>) {
  const tracking = decorateTrackingSnapshot(
    (order.riderTracking ?? {}) as Record<string, any>,
    stringValue(order.status),
  ) as Record<string, any>;
  const freshness = (tracking.freshness ?? {}) as Record<string, any>;

  return {
    id: String(order._id ?? order.id ?? ""),
    orderNumber: stringValue(order.orderNumber, "Order"),
    status: stringValue(order.status),
    restaurantId: String(order.restaurantId ?? ""),
    customerId: stringValue(order.customerId),
    riderId: stringValue(order.riderId),
    customerName: stringValue(
      order.customerSnapshot?.fullName ?? order.customerSnapshot?.name,
      "Customer",
    ),
    customerPhone: stringValue(order.customerSnapshot?.phone),
    riderName: stringValue(order.riderSnapshot?.name, "Rider"),
    riderPhone: stringValue(order.riderSnapshot?.phone),
    deliveryAddress: stringValue(order.customerSnapshot?.deliveryAddress?.addressLine),
    isFocused: Boolean(tracking.isFocused),
    isNearCustomer: Boolean(tracking.isNearCustomer),
    startedAt: serializeDate(tracking.startedAt),
    lastUpdatedAt: serializeDate(tracking.lastUpdatedAt),
    freshness: {
      state: stringValue(freshness.state, "unavailable"),
      ageSeconds:
        typeof freshness.ageSeconds === "number" ? freshness.ageSeconds : null,
      isFresh: Boolean(freshness.isFresh),
      isStale: Boolean(freshness.isStale),
    },
    remainingDistanceKm: numberValue(tracking.remainingDistanceKm),
    directDistanceKm: numberValue(tracking.directDistanceKm),
    remainingDurationMinutes: numberValue(tracking.remainingDurationMinutes),
    speedKmph: numberValue(tracking.speedKmph),
    currentLocation: serializeTrackingLocation(tracking),
    createdAt: serializeDate(order.createdAt),
    updatedAt: serializeDate(order.updatedAt),
  };
}

function getRoleFallbackName(role: string, userId: string) {
  const label =
    role === "admin"
      ? "Admin"
      : role === "owner"
        ? "Restaurant owner"
        : role === "rider"
          ? "Rider"
          : role === "customer"
            ? "Customer"
            : "User";
  return userId ? `${label} ${userId.slice(-6)}` : label;
}

function secondsSinceIso(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

async function enrichSocketConnectionSnapshot() {
  const snapshot = getSocketConnectionSnapshot();
  const idsByRole = snapshot.connections.reduce<Record<string, string[]>>(
    (summary, connection) => {
      if (!connection.userId) return summary;
      summary[connection.role] = [
        ...(summary[connection.role] ?? []),
        connection.userId,
      ];
      return summary;
    },
    {},
  );

  const [admins, owners, riders, customers] = await Promise.all([
    idsByRole.admin?.length
      ? AdminModel.find({ _id: { $in: idsByRole.admin } })
          .select({ fullName: 1, email: 1 })
          .lean()
      : [],
    idsByRole.owner?.length
      ? OwnerModel.find({ _id: { $in: idsByRole.owner } })
          .select({ fullName: 1, phone: 1, email: 1 })
          .lean()
      : [],
    idsByRole.rider?.length
      ? RiderModel.find({ _id: { $in: idsByRole.rider } })
          .select({ fullName: 1, phone: 1 })
          .lean()
      : [],
    idsByRole.customer?.length
      ? CustomerModel.find({ _id: { $in: idsByRole.customer } })
          .select({ fullName: 1, phone: 1, email: 1 })
          .lean()
      : [],
  ]);

  const actorByKey = new Map<
    string,
    { displayName: string; contact: string; actorLabel: string }
  >();

  admins.forEach((admin: any) => {
    const displayName = String(admin.fullName ?? admin.email ?? "").trim();
    actorByKey.set(`admin:${admin._id}`, {
      displayName,
      contact: String(admin.email ?? ""),
      actorLabel: "Admin web",
    });
  });
  owners.forEach((owner: any) => {
    const displayName = String(owner.fullName ?? owner.phone ?? "").trim();
    actorByKey.set(`owner:${owner._id}`, {
      displayName,
      contact: String(owner.phone ?? owner.email ?? ""),
      actorLabel: "Restaurant owner",
    });
  });
  riders.forEach((rider: any) => {
    const displayName = String(rider.fullName ?? rider.phone ?? "").trim();
    actorByKey.set(`rider:${rider._id}`, {
      displayName,
      contact: String(rider.phone ?? ""),
      actorLabel: "Delivery rider",
    });
  });
  customers.forEach((customer: any) => {
    const displayName = String(customer.fullName ?? customer.phone ?? "").trim();
    actorByKey.set(`customer:${customer._id}`, {
      displayName,
      contact: String(customer.phone ?? customer.email ?? ""),
      actorLabel: "Customer app",
    });
  });

  return {
    ...snapshot,
    connections: snapshot.connections.map((connection) => {
      const actor = actorByKey.get(`${connection.role}:${connection.userId}`);
      const businessRooms = connection.rooms.filter(
        (room) => room !== "public:content",
      );
      const connectedForSeconds = secondsSinceIso(connection.connectedAt);
      return {
        ...connection,
        displayName:
          actor?.displayName || getRoleFallbackName(connection.role, connection.userId),
        contact: actor?.contact ?? "",
        actorLabel: actor?.actorLabel ?? getRoleFallbackName(connection.role, ""),
        primaryRoom: businessRooms[0] ?? connection.rooms[0] ?? "",
        businessRooms,
        connectedForSeconds,
        lifecycleNote:
          "Ends when the app closes, the user signs out, the session expires, or the network drops.",
      };
    }),
  };
}

async function getRealtimeOperationsSnapshot() {
  const liveTrackingQuery = {
    status: "PickedUp",
    "riderTracking.isActive": true,
  };
  const staleCutoff = new Date(Date.now() - TRACKING_STALE_AFTER_MS);
  const [summaryRows, liveOrders] = await Promise.all([
    OrderModel.aggregate<{
      _id: null;
      activeShares: number;
      focusedShares: number;
      liveShares: number;
      staleShares: number;
    }>([
      { $match: liveTrackingQuery },
      {
        $group: {
          _id: null,
          activeShares: { $sum: 1 },
          focusedShares: {
            $sum: {
              $cond: [{ $eq: ["$riderTracking.isFocused", true] }, 1, 0],
            },
          },
          liveShares: {
            $sum: {
              $cond: [
                {
                  $gte: [
                    { $ifNull: ["$riderTracking.lastUpdatedAt", new Date(0)] },
                    staleCutoff,
                  ],
                },
                1,
                0,
              ],
            },
          },
          staleShares: {
            $sum: {
              $cond: [
                {
                  $lt: [
                    { $ifNull: ["$riderTracking.lastUpdatedAt", new Date(0)] },
                    staleCutoff,
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    OrderModel.find(liveTrackingQuery)
      .sort({ "riderTracking.lastUpdatedAt": -1, updatedAt: -1 })
      .limit(100)
      .select({
        _id: 1,
        orderNumber: 1,
        status: 1,
        restaurantId: 1,
        customerId: 1,
        riderId: 1,
        customerSnapshot: 1,
        riderSnapshot: 1,
        riderTracking: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean(),
  ]);
  const summary = summaryRows[0] ?? {
    activeShares: 0,
    focusedShares: 0,
    liveShares: 0,
    staleShares: 0,
  };
  const orders = liveOrders.map((order) =>
    serializeLiveLocationOrder(order as Record<string, any>),
  );

  return {
    socket: await enrichSocketConnectionSnapshot(),
    liveLocation: {
      activeShares: summary.activeShares,
      focusedShares: summary.focusedShares,
      liveShares: summary.liveShares,
      staleShares: summary.staleShares,
      visibleLimit: 100,
      sampleSize: orders.length,
      orders,
    },
  };
}

export async function recordBusinessEvent(input: BusinessEventInput) {
  const severity = input.severity ?? "info";
  const payload = {
    event: input.event,
    category: input.category,
    severity,
    title: input.title,
    description: input.description ?? "",
    entityType: input.entityType ?? "",
    entityId: input.entityId ?? "",
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? "",
    actorName: input.actorName ?? "",
    metadata: input.metadata ?? {},
  };

  const logPayload = { businessEvent: true, ...payload };
  if (severity === "critical") {
    logger.error(logPayload, input.title);
  } else if (severity === "warning") {
    logger.warn(logPayload, input.title);
  } else {
    logger.info(logPayload, input.title);
  }

  try {
    await AdminBusinessEventModel.create(payload);
  } catch (error) {
    logger.warn({ error, event: input.event }, "Business event persistence failed");
  }
}

export function fireBusinessEvent(input: BusinessEventInput) {
  void recordBusinessEvent(input);
}

export function markOperationalJobStarted(key: string, label: string) {
  schedulerJobs.set(key, {
    key,
    label,
    status: "running",
    lastStartedAt: new Date().toISOString(),
    lastFinishedAt: null,
    lastDurationMs: null,
    lastError: "",
  });
}

export function markOperationalJobFinished(
  key: string,
  status: "ok" | "failed",
  startedAt: number,
  error?: unknown,
) {
  const previous = schedulerJobs.get(key);
  schedulerJobs.set(key, {
    key,
    label: previous?.label ?? key,
    status,
    lastStartedAt: previous?.lastStartedAt ?? null,
    lastFinishedAt: new Date().toISOString(),
    lastDurationMs: Math.max(0, Date.now() - startedAt),
    lastError: error instanceof Error ? error.message : error ? String(error) : "",
  });
}

export async function getAdminOperationalHealthSnapshot() {
  return adminOperationalHealthCache.getOrSet("admin-operational-health", async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();
    const activeAlertQuery = {
      isRead: { $ne: true },
      resolvedAt: null,
      $or: [{ snoozedUntil: null }, { snoozedUntil: { $lte: now } }],
    };

    const [
      recentEvents,
      activeAlerts,
      alertSummaryRows,
      eventSummaryRows,
      realtime,
      infrastructure,
    ] = await Promise.all([
      AdminBusinessEventModel.find().sort({ createdAt: -1 }).limit(80).lean(),
      AdminOperationalAlertModel.find(activeAlertQuery)
        .sort({ lastSeenAt: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      AdminOperationalAlertModel.aggregate<{
        _id: null;
        openCriticalAlerts: number;
        openWarningAlerts: number;
        openInfoAlerts: number;
      }>([
        { $match: activeAlertQuery },
        {
          $group: {
            _id: null,
            openCriticalAlerts: {
              $sum: {
                $cond: [{ $eq: ["$severity", "critical"] }, 1, 0],
              },
            },
            openWarningAlerts: {
              $sum: {
                $cond: [{ $eq: ["$severity", "warning"] }, 1, 0],
              },
            },
            openInfoAlerts: {
              $sum: {
                $cond: [{ $eq: ["$severity", "info"] }, 1, 0],
              },
            },
          },
        },
      ]),
      AdminBusinessEventModel.aggregate<{
        _id: null;
        eventsLast24h: number;
        criticalEventsLast24h: number;
        warningEventsLast24h: number;
      }>([
        { $match: { createdAt: { $gte: since24h } } },
        {
          $group: {
            _id: null,
            eventsLast24h: { $sum: 1 },
            criticalEventsLast24h: {
              $sum: {
                $cond: [{ $eq: ["$severity", "critical"] }, 1, 0],
              },
            },
            warningEventsLast24h: {
              $sum: {
                $cond: [{ $eq: ["$severity", "warning"] }, 1, 0],
              },
            },
          },
        },
      ]),
      getRealtimeOperationsSnapshot(),
      getInfrastructureHealthSnapshot(),
    ]);

    const alertSummary = alertSummaryRows[0] ?? {
      openCriticalAlerts: 0,
      openWarningAlerts: 0,
      openInfoAlerts: 0,
    };
    const eventSummary = eventSummaryRows[0] ?? {
      eventsLast24h: 0,
      criticalEventsLast24h: 0,
      warningEventsLast24h: 0,
    };

    const runtime = getRuntimeSnapshot();
    const requestMonitor = getRequestMonitorSnapshot();
    const schedulerJobList = Array.from(schedulerJobs.values());
    const failedSchedulerJobs = schedulerJobList.filter(
      (job) => job.status === "failed",
    ).length;
    const infrastructureComponents = Array.isArray(infrastructure.components)
      ? infrastructure.components
      : [];
    const criticalInfrastructure = infrastructureComponents.filter(
      (component: { status?: string }) => component.status === "critical",
    ).length;
    const warningInfrastructure = infrastructureComponents.filter(
      (component: { status?: string }) => component.status === "warning",
    ).length;

    const currentCriticalSignals =
      alertSummary.openCriticalAlerts + failedSchedulerJobs + criticalInfrastructure;
    const currentWarningSignals =
      alertSummary.openWarningAlerts + warningInfrastructure;
    const attentionScore =
      currentCriticalSignals * 5 + currentWarningSignals * 2;

    const systemStatus =
      currentCriticalSignals > 0 || !runtime.ready
        ? "needs_attention"
        : currentWarningSignals > 0
          ? "watching"
          : "healthy";

    return {
      generatedAt: new Date().toISOString(),
      systemStatus,
      attentionScore,
      runtime,
      backgroundTasks: getBackgroundTaskQueueSnapshot(),
      requestMonitor,
      infrastructure,
      summary: {
        openCriticalAlerts: alertSummary.openCriticalAlerts,
        openWarningAlerts: alertSummary.openWarningAlerts,
        openInfoAlerts: alertSummary.openInfoAlerts,
        failedSchedules: 0,
        pendingSchedules: 0,
        eventsLast24h: eventSummary.eventsLast24h,
        criticalEventsLast24h: eventSummary.criticalEventsLast24h,
        warningEventsLast24h: eventSummary.warningEventsLast24h,
      },
      schedulerJobs: schedulerJobList,
      timeline: recentEvents.map((event) => serializeBusinessEvent(event)),
      activeAlerts: activeAlerts.map((alert) => ({
        id: String(alert._id ?? ""),
        alertType: String(alert.alertType ?? ""),
        severity: String(alert.severity ?? "warning"),
        title: String(alert.title ?? ""),
        description: String(alert.description ?? ""),
        source: String(alert.source ?? "operations"),
        entityType: String(alert.entityType ?? ""),
        entityId: String(alert.entityId ?? ""),
        path: String(alert.path ?? ""),
        iconKey: String(alert.iconKey ?? "bell"),
        lastSeenAt: serializeDate(alert.lastSeenAt),
        createdAt: serializeDate(alert.createdAt),
        resolvedAt: serializeDate(alert.resolvedAt),
        snoozedUntil: serializeDate(alert.snoozedUntil),
      })),
      schedules: [],
      realtime,
    };
  });
}
