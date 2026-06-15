import { RiderAvailabilitySessionModel } from "./availability-session.model";

type AvailabilityEndReason =
  | "manual_offline"
  | "admin_offline"
  | "status_changed"
  | "kyc_changed"
  | "replaced"
  | "system";

type AvailabilitySessionSource = "rider_app" | "admin" | "system";

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sessionOverlapSeconds(
  session: { startedAt?: Date | string | null; endedAt?: Date | string | null },
  rangeStart: Date,
  rangeEnd: Date,
) {
  if (!session.startedAt) return 0;
  const startedAt = new Date(session.startedAt);
  const endedAt = session.endedAt ? new Date(session.endedAt) : rangeEnd;
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) return 0;
  const start = new Date(Math.max(startedAt.getTime(), rangeStart.getTime()));
  const end = new Date(Math.min(endedAt.getTime(), rangeEnd.getTime()));
  return end > start ? secondsBetween(start, end) : 0;
}

export async function syncRiderAvailabilitySession(params: {
  riderId: string;
  isAvailableForAssignments: boolean;
  source?: AvailabilitySessionSource;
  endReason?: AvailabilityEndReason;
}) {
  const riderId = params.riderId.trim();
  if (!riderId) return;

  if (params.isAvailableForAssignments) {
    try {
      await RiderAvailabilitySessionModel.updateOne(
        { riderId, endedAt: null },
        {
          $setOnInsert: {
            riderId,
            startedAt: new Date(),
            startSource: params.source ?? "rider_app",
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
  const openSession = await RiderAvailabilitySessionModel.findOne({
    riderId,
    endedAt: null,
  }).sort({ startedAt: -1 });

  if (!openSession) return;

  const startedAt = openSession.startedAt ?? now;
  openSession.endedAt = now;
  openSession.durationSeconds = secondsBetween(startedAt, now);
  openSession.endSource = params.source ?? "rider_app";
  openSession.endReason = params.endReason ?? "manual_offline";
  await openSession.save();
}

export async function getRiderAvailabilitySummary(riderId: string) {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const sevenDayStart = addDays(todayStart, -6);
  const thirtyDayStart = addDays(todayStart, -29);

  const [sessions, latestClosedSession] = await Promise.all([
    RiderAvailabilitySessionModel.find({
      riderId,
      startedAt: { $lt: addDays(todayStart, 1) },
      $or: [{ endedAt: null }, { endedAt: { $gte: thirtyDayStart } }],
    })
      .sort({ startedAt: -1 })
      .limit(200)
      .lean(),
    RiderAvailabilitySessionModel.findOne({
      riderId,
      endedAt: { $ne: null },
    })
      .sort({ endedAt: -1 })
      .lean(),
  ]);

  const openSession = sessions.find((session) => !session.endedAt) ?? null;
  const todayActiveSeconds = sessions.reduce(
    (total, session) => total + sessionOverlapSeconds(session, todayStart, now),
    0,
  );
  const sevenDaySeconds = sessions.reduce(
    (total, session) => total + sessionOverlapSeconds(session, sevenDayStart, now),
    0,
  );
  const thirtyDaySeconds = sessions.reduce(
    (total, session) => total + sessionOverlapSeconds(session, thirtyDayStart, now),
    0,
  );
  const activeDaysLast7d = Array.from({ length: 7 }, (_, index) => {
    const dayStart = addDays(sevenDayStart, index);
    const dayEnd = index === 6 ? now : addDays(dayStart, 1);
    return sessions.some((session) => sessionOverlapSeconds(session, dayStart, dayEnd) > 0);
  }).filter(Boolean).length;

  return {
    isOnline: Boolean(openSession),
    currentSessionStartedAt: toIso(openSession?.startedAt),
    todayActiveSeconds,
    averageDailyActiveSeconds7d: Math.round(sevenDaySeconds / 7),
    averageDailyActiveSeconds30d: Math.round(thirtyDaySeconds / 30),
    activeDaysLast7d,
    lastOnlineAt: toIso(sessions[0]?.startedAt),
    lastOfflineAt: toIso(latestClosedSession?.endedAt),
    sessionCountToday: sessions.filter(
      (session) => session.startedAt && new Date(session.startedAt) >= todayStart,
    ).length,
    sessions: sessions.slice(0, 20).map((session) => ({
      id: String(session._id ?? ""),
      startedAt: toIso(session.startedAt),
      endedAt: toIso(session.endedAt),
      durationSeconds: session.endedAt
        ? Math.max(0, Number(session.durationSeconds) || 0)
        : sessionOverlapSeconds(session, new Date(session.startedAt ?? now), now),
      status: session.endedAt ? "closed" : "online",
      startSource: String(session.startSource ?? ""),
      endSource: String(session.endSource ?? ""),
      endReason: String(session.endReason ?? ""),
    })),
  };
}
