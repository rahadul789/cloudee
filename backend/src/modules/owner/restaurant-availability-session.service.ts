import { RestaurantAvailabilitySessionModel } from "./restaurant-availability-session.model";

export type RestaurantAvailabilitySessionSource =
  | "owner_app"
  | "owner_web"
  | "admin"
  | "system"
  | "unknown";

export type RestaurantAvailabilityEndReason =
  | "manual_offline"
  | "admin_offline"
  | "enforcement"
  | "restaurant_hidden"
  | "replaced"
  | "system";

function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export async function syncRestaurantAvailabilitySession(params: {
  restaurantId: string;
  ownerId?: string;
  isOnline: boolean;
  source?: RestaurantAvailabilitySessionSource;
  endReason?: RestaurantAvailabilityEndReason;
  adminId?: string;
  activeOrderCount?: number;
  activeOrderNumbers?: string[];
  fallbackStartedAt?: Date | string | null;
}) {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId) return;

  const source = params.source ?? "unknown";

  if (params.isOnline) {
    const fallbackStartedAt = params.fallbackStartedAt
      ? new Date(params.fallbackStartedAt)
      : null;
    const startedAt =
      fallbackStartedAt && !Number.isNaN(fallbackStartedAt.getTime())
        ? fallbackStartedAt
        : new Date();
    try {
      await RestaurantAvailabilitySessionModel.updateOne(
        { restaurantId, endedAt: null },
        {
          $setOnInsert: {
            restaurantId,
            ownerId: params.ownerId ?? "",
            startedAt,
            startSource: source,
            activeOrderCountAtStart: Math.max(0, params.activeOrderCount ?? 0),
            startedByOwnerId: params.ownerId ?? "",
          },
        },
        { upsert: true },
      );
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    return;
  }

  const now = new Date();
  const openSession = await RestaurantAvailabilitySessionModel.findOne({
    restaurantId,
    endedAt: null,
  }).sort({ startedAt: -1 });

  if (!openSession) {
    const fallbackStartedAt = params.fallbackStartedAt
      ? new Date(params.fallbackStartedAt)
      : null;
    if (!fallbackStartedAt || Number.isNaN(fallbackStartedAt.getTime())) return;
    await RestaurantAvailabilitySessionModel.create({
      restaurantId,
      ownerId: params.ownerId ?? "",
      startedAt: fallbackStartedAt,
      endedAt: now,
      durationSeconds: secondsBetween(fallbackStartedAt, now),
      startSource: "unknown",
      endSource: source,
      endReason: params.endReason ?? "manual_offline",
      activeOrderCountAtStart: 0,
      activeOrderCountAtEnd: Math.max(0, params.activeOrderCount ?? 0),
      activeOrderNumbersAtEnd: (params.activeOrderNumbers ?? []).slice(0, 20),
      endedByOwnerId: source === "owner_app" || source === "owner_web" ? params.ownerId ?? "" : "",
      endedByAdminId: source === "admin" ? params.adminId ?? "" : "",
    });
    return;
  }

  const startedAt = openSession.startedAt ?? now;
  openSession.endedAt = now;
  openSession.durationSeconds = secondsBetween(startedAt, now);
  openSession.endSource = source;
  openSession.endReason = params.endReason ?? "manual_offline";
  openSession.activeOrderCountAtEnd = Math.max(0, params.activeOrderCount ?? 0);
  openSession.activeOrderNumbersAtEnd = (params.activeOrderNumbers ?? []).slice(0, 20);
  openSession.endedByOwnerId = source === "owner_app" || source === "owner_web" ? params.ownerId ?? "" : "";
  openSession.endedByAdminId = source === "admin" ? params.adminId ?? "" : "";
  await openSession.save();
}
