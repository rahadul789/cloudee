import mongoose from "mongoose";

import { logger } from "../../config/logger";
import { OtpAttemptModel } from "../auth/otp-monitor.model";
import { getSmsProviderBalance } from "../auth/otp-sms.service";
import { sendOperationalAlert } from "../monitoring/alert-notifier";

type OtpAttemptRow = {
  _id: unknown;
  phone?: string;
  purpose?: string;
  plainCode?: string;
  channel?: string;
  ipAddress?: string;
  resendCount?: number;
  requestedAt?: Date | null;
  lastSentAt?: Date | null;
  verifiedAt?: Date | null;
  loggedInAt?: Date | null;
  callRequestedAt?: Date | null;
  handledAt?: Date | null;
};

function iso(date?: Date | null) {
  return date ? new Date(date).toISOString() : null;
}

// Marks a stuck OTP attempt as dealt-with by an admin (support relayed the code).
export async function markOtpAttemptHandled(params: {
  id: string;
  adminId?: string;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return { handled: false };
  }
  await OtpAttemptModel.updateOne(
    { _id: params.id },
    { $set: { handledAt: new Date(), handledByAdminId: params.adminId ?? "" } },
  );
  return { handled: true };
}

// Time-gated watchdog: if a burst of recent OTP attempts is stuck (resent but never
// verified), the SMS provider is likely dropping codes — fire ONE ops alert so admins can
// flip on the Telegram fallback / relay codes. Called fire-and-forget from the OTP path.
let lastOtpDegradedCheckAtMs = 0;
export async function maybeAlertOtpDeliveryDegraded() {
  const nowMs = Date.now();
  if (nowMs - lastOtpDegradedCheckAtMs < 5 * 60_000) return;
  lastOtpDegradedCheckAtMs = nowMs;

  try {
    const since = new Date(nowMs - 15 * 60_000);
    const stuck = await OtpAttemptModel.countDocuments({
      requestedAt: { $gte: since },
      resendCount: { $gte: 2 },
      verifiedAt: null,
    });
    if (stuck < 5) return;

    await sendOperationalAlert({
      dedupeKey: "otp-delivery-degraded",
      severity: "warning",
      layer: "operations",
      title: "OTP delivery looks degraded",
      body: `${stuck} logins in the last 15 min resent OTP 2+ times without verifying — SMS delivery may be failing. Consider enabling the Telegram OTP fallback and relaying codes.`,
      details: { stuckLast15Min: stuck, path: "/otp-monitor" },
    });
  } catch (error) {
    logger.warn({ error }, "OTP degraded-delivery check failed");
  }
}

// Powers the admin "OTP Monitor" sidebar: a request→verify→login funnel + a filterable list
// (date range, phone, "stuck only") with the live code so support can read it out.
export async function getAdminOtpMonitor(params: {
  from?: string;
  to?: string;
  phone?: string;
  status?: "all" | "stuck" | "verified" | "call_requested";
  page?: number;
  pageSize?: number;
}) {
  const query: Record<string, unknown> = {};
  const requestedAt: Record<string, Date> = {};
  if (params.from) {
    const d = new Date(params.from);
    if (!Number.isNaN(d.getTime())) requestedAt.$gte = d;
  }
  if (params.to) {
    const d = new Date(params.to);
    if (!Number.isNaN(d.getTime())) requestedAt.$lte = d;
  }
  if (Object.keys(requestedAt).length) query.requestedAt = requestedAt;

  const phoneDigits = (params.phone ?? "").replace(/\D/g, "");
  if (phoneDigits) query.phone = { $regex: phoneDigits };

  if (params.status === "verified") query.verifiedAt = { $ne: null };
  else if (params.status === "call_requested") query.callRequestedAt = { $ne: null };
  else if (params.status === "stuck") {
    query.verifiedAt = null;
    query.loggedInAt = null;
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

  // Funnel spans the same date window but ignores the status/phone filters.
  const funnelMatch: Record<string, unknown> = {};
  if (query.requestedAt) funnelMatch.requestedAt = query.requestedAt;

  const [items, total, funnelAgg, trendAgg, smsBalance] = await Promise.all([
    OtpAttemptModel.find(query)
      .sort({ requestedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<OtpAttemptRow[]>(),
    OtpAttemptModel.countDocuments(query),
    OtpAttemptModel.aggregate<{
      requested: number;
      resent: number;
      callRequested: number;
      verified: number;
      loggedIn: number;
    }>([
      { $match: funnelMatch },
      {
        $group: {
          _id: null,
          requested: { $sum: 1 },
          resent: { $sum: { $cond: [{ $gt: ["$resendCount", 0] }, 1, 0] } },
          callRequested: {
            $sum: { $cond: [{ $ne: ["$callRequestedAt", null] }, 1, 0] },
          },
          verified: { $sum: { $cond: [{ $ne: ["$verifiedAt", null] }, 1, 0] } },
          loggedIn: { $sum: { $cond: [{ $ne: ["$loggedInAt", null] }, 1, 0] } },
        },
      },
    ]),
    OtpAttemptModel.aggregate<{
      _id: Date;
      requested: number;
      verified: number;
    }>([
      {
        $match: Object.keys(funnelMatch).length
          ? funnelMatch
          : { requestedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      },
      {
        $group: {
          _id: { $dateTrunc: { date: "$requestedAt", unit: "hour" } },
          requested: { $sum: 1 },
          verified: { $sum: { $cond: [{ $ne: ["$verifiedAt", null] }, 1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 48 },
    ]),
    getSmsProviderBalance().catch(() => null),
  ]);

  const f = funnelAgg[0] ?? {
    requested: 0,
    resent: 0,
    callRequested: 0,
    verified: 0,
    loggedIn: 0,
  };

  return {
    funnel: {
      requested: f.requested,
      resent: f.resent,
      callRequested: f.callRequested,
      verified: f.verified,
      loggedIn: f.loggedIn,
      stuck: Math.max(0, f.requested - f.verified),
    },
    trend: [...trendAgg]
      .sort((a, b) => new Date(a._id).getTime() - new Date(b._id).getTime())
      .map((bucket) => ({
        hour: iso(bucket._id),
        requested: bucket.requested,
        verified: bucket.verified,
      })),
    smsBalance:
      smsBalance && smsBalance.status === "ok"
        ? { balance: smsBalance.balance, checkedAt: smsBalance.checkedAt }
        : smsBalance
          ? { balance: null, checkedAt: smsBalance.checkedAt }
          : null,
    page,
    pageSize,
    total,
    items: items.map((a) => ({
      id: String(a._id),
      phone: a.phone ?? "",
      // Live code only while unverified; blanked once the funnel closes.
      code: a.verifiedAt || a.loggedInAt ? "" : a.plainCode ?? "",
      purpose: a.purpose ?? "",
      channel: a.channel ?? "sms",
      ipAddress: a.ipAddress ?? "",
      resendCount: a.resendCount ?? 0,
      requestedAt: iso(a.requestedAt),
      lastSentAt: iso(a.lastSentAt),
      verifiedAt: iso(a.verifiedAt),
      loggedInAt: iso(a.loggedInAt),
      callRequestedAt: iso(a.callRequestedAt),
      handledAt: iso(a.handledAt),
      status: a.loggedInAt
        ? "logged_in"
        : a.verifiedAt
          ? "verified"
          : a.callRequestedAt
            ? "call_requested"
            : (a.resendCount ?? 0) > 0
              ? "resent"
              : "requested",
    })),
  };
}
