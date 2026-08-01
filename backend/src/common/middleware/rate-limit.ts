import rateLimit, {
  ipKeyGenerator,
  type ClientRateLimitInfo,
  type Options,
  type Store,
} from "express-rate-limit";
import { createHmac, timingSafeEqual } from "crypto";
import type { Request, RequestHandler } from "express";

import { env } from "../../config/env";
import { logger } from "../../config/logger";
import {
  defaultAuthRateLimitSettings,
  getAuthRateLimitSettings,
  type AuthRateLimitSettings,
} from "../../modules/public/content.service";

const passThroughLimiter: RequestHandler = (_req, _res, next) => next();
type RateLimitSettingKey = keyof AuthRateLimitSettings;
type RateLimitKeyStrategy = "ip" | "user";
const writeMethods = ["POST", "PATCH", "PUT", "DELETE"];
const snapshotBucketLimit = 8;

type RateLimitBucket = {
  totalHits: number;
  resetTime: Date;
};

type RateLimitMeta = {
  id: string;
  label: string;
  category: "global" | "auth" | "business";
  windowMs: number;
  limit: number;
  settingKey?: RateLimitSettingKey;
};

function scopedLimiter(baseId: string, baseLabel: string, scope?: string) {
  const normalizedScope = scope?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalizedScope) {
    return { id: baseId, label: baseLabel };
  }

  return {
    id: `${baseId}.${normalizedScope}`,
    label: `${baseLabel} (${normalizedScope})`,
  };
}

class ObservableMemoryStore implements Store {
  localKeys = true;
  prefix: string;
  private buckets = new Map<string, RateLimitBucket>();
  private windowMs: number;

  constructor(
    private readonly id: string,
    windowMs: number,
  ) {
    this.prefix = `${id}:`;
    this.windowMs = windowMs;
  }

  init(options: Options) {
    if (typeof options.windowMs === "number") {
      this.windowMs = options.windowMs;
    }
  }

  increment(key: string) {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetTime.getTime() <= now) {
      const next = {
        totalHits: 1,
        resetTime: new Date(now + this.windowMs),
      };
      this.buckets.set(key, next);
      return next;
    }

    existing.totalHits += 1;
    return existing;
  }

  get(key: string): ClientRateLimitInfo | undefined {
    const bucket = this.buckets.get(key);
    if (!bucket) return undefined;
    if (bucket.resetTime.getTime() <= Date.now()) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  decrement(key: string) {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    bucket.totalHits = Math.max(0, bucket.totalHits - 1);
    if (bucket.totalHits === 0) {
      this.buckets.delete(key);
    }
  }

  resetKey(key: string) {
    this.buckets.delete(key);
  }

  resetAll() {
    this.buckets.clear();
  }

  snapshot(limit = snapshotBucketLimit) {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetTime.getTime() <= now) {
        this.buckets.delete(key);
      }
    }

    return Array.from(this.buckets.entries())
      .sort((left, right) => right[1].totalHits - left[1].totalHits)
      .slice(0, limit)
      .map(([key, bucket]) => ({
        key: formatRateLimitKey(key),
        resetToken: createBucketResetToken(this.id, key, bucket.resetTime),
        totalHits: bucket.totalHits,
        resetAt: bucket.resetTime.toISOString(),
        resetInSeconds: Math.max(0, Math.ceil((bucket.resetTime.getTime() - now) / 1000)),
      }));
  }

  resetByToken(resetToken: string) {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetTime.getTime() <= now) {
        this.buckets.delete(key);
        continue;
      }

      const expectedToken = createBucketResetToken(this.id, key, bucket.resetTime);
      if (!constantTimeEqual(expectedToken, resetToken)) continue;

      this.buckets.delete(key);
      return {
        reset: true,
        key: formatRateLimitKey(key),
        totalHits: bucket.totalHits,
        resetAt: bucket.resetTime.toISOString(),
      };
    }

    return { reset: false };
  }

  size() {
    this.snapshot(0);
    return this.buckets.size;
  }
}

const limiterStores = new Map<string, ObservableMemoryStore>();
const limiterMeta = new Map<string, RateLimitMeta>();

function formatRateLimitKey(key: string) {
  if (!key) return "unknown";
  if (key.includes(":")) {
    const [scope, ...rest] = key.split(":");
    const value = rest.join(":");
    if (["admin", "owner", "rider", "customer", "refresh"].includes(scope) && value.length > 8) {
      return `${scope}:${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    return key;
  }

  if (key.includes(".")) {
    const parts = key.split(".");
    if (parts.length === 4) {
      return `ip:${parts[0]}.${parts[1]}.x.x`;
    }
  }

  if (key.includes(":") || key.length < 16) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function toBase64Url(value: string) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createBucketResetToken(limiterId: string, key: string, resetTime: Date) {
  return toBase64Url(
    createHmac("sha256", env.JWT_ACCESS_SECRET)
      .update(limiterId)
      .update("\0")
      .update(key)
      .update("\0")
      .update(String(resetTime.getTime()))
      .digest("base64"),
  );
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function registerLimiter(meta: RateLimitMeta) {
  limiterMeta.set(meta.id, meta);
  const store = new ObservableMemoryStore(meta.id, meta.windowMs);
  limiterStores.set(meta.id, store);
  return store;
}

function withIdentity(req: Request, fieldNames: string[]) {
  const body = req.body as Record<string, unknown> | undefined;
  const identity = fieldNames
    .map((fieldName) => body?.[fieldName])
    .find((value) => typeof value === "string" && value.trim().length > 0);

  return `${ipKeyGenerator(req.ip ?? "")}:${typeof identity === "string" ? identity.trim() : "anonymous"}`;
}

function withUser(req: Request) {
  if (req.user?.id && req.user.role) {
    return `${req.user.role}:${req.user.id}`;
  }

  return ipKeyGenerator(req.ip ?? "");
}

function withRefreshTokenFingerprint(req: Request) {
  const body = req.body as Record<string, unknown> | undefined;
  const refreshToken =
    typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";

  if (!refreshToken) {
    return ipKeyGenerator(req.ip ?? "");
  }

  const fingerprint = createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update("refresh-token")
    .update("\0")
    .update(refreshToken)
    .digest("hex");

  return `refresh:${fingerprint}`;
}

async function getConfiguredLimit(key: RateLimitSettingKey, fallback: number) {
  try {
    const settings = await getAuthRateLimitSettings();
    const configuredLimit = settings[key];
    return Number.isFinite(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : fallback;
  } catch (error) {
    logger.warn(
      { error, key },
      "Using fallback rate limit because platform settings could not be loaded",
    );
    return fallback;
  }
}

async function getLimiterLimit(meta: RateLimitMeta) {
  return meta.settingKey ? getConfiguredLimit(meta.settingKey, meta.limit) : meta.limit;
}

function buildLimiter(options: {
  id: string;
  label: string;
  category?: RateLimitMeta["category"];
  windowMs: number;
  limit: number;
  settingKey?: RateLimitSettingKey;
  keyStrategy?: RateLimitKeyStrategy;
  fieldNames?: string[];
  keyGenerator?: (req: Request) => string;
  methods?: string[];
  skip?: (req: Request) => boolean;
  message: string;
  event?: string;
}): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) {
    return passThroughLimiter;
  }

  const keyGenerator = (req: Request) =>
    options.keyGenerator
      ? options.keyGenerator(req)
      : options.fieldNames?.length
      ? withIdentity(req, options.fieldNames)
      : options.keyStrategy === "user"
        ? withUser(req)
      : ipKeyGenerator(req.ip ?? "");

  return rateLimit({
    windowMs: options.windowMs,
    limit: options.settingKey
      ? () => getConfiguredLimit(options.settingKey!, options.limit)
      : options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: options.message,
    },
    store: registerLimiter({
      id: options.id,
      label: options.label,
      category: options.category ?? "business",
      windowMs: options.windowMs,
      limit: options.limit,
      settingKey: options.settingKey,
    }),
    skip: (req) =>
      Boolean(options.skip?.(req)) ||
      Boolean(options.methods?.length && !options.methods.includes(req.method.toUpperCase())),
    keyGenerator,
    handler: (req, res, _next, limiterOptions) => {
      logger.warn(
        {
          businessEvent: true,
          event: options.event ?? "rate_limit.exceeded",
          category: "security",
          severity: "warning",
          path: req.originalUrl,
          method: req.method,
          ip: req.ip,
          limit: options.settingKey
            ? `${options.settingKey}:${defaultAuthRateLimitSettings[options.settingKey]}`
            : options.limit,
          windowMs: options.windowMs,
        },
        options.message,
      );
      res.status(limiterOptions.statusCode).json(limiterOptions.message);
    },
  });
}

export function createSigninLimiter(scope?: string): RequestHandler {
  const limiter = scopedLimiter("auth.signin", "Sign-in attempts", scope);
  return buildLimiter({
    id: limiter.id,
    label: limiter.label,
    category: "auth",
    windowMs: 15 * 60 * 1000,
    limit: 10,
    settingKey: "signinAttemptsPerWindow",
    fieldNames: ["phone", "email"],
    message: "Too many sign-in attempts. Please wait a few minutes and try again.",
    event: "auth.signin.rate_limited",
  });
}

export function createSignupLimiter(scope?: string): RequestHandler {
  const limiter = scopedLimiter("auth.signup", "Sign-up attempts", scope);
  return buildLimiter({
    id: limiter.id,
    label: limiter.label,
    category: "auth",
    windowMs: 30 * 60 * 1000,
    limit: 5,
    settingKey: "signupAttemptsPerWindow",
    fieldNames: ["phone", "email"],
    message: "Too many sign-up attempts. Please wait before trying again.",
    event: "auth.signup.rate_limited",
  });
}

export function createOtpSendLimiter(scope?: string): RequestHandler {
  const limiter = scopedLimiter("auth.otp_send_phone", "OTP send per phone", scope);
  return buildLimiter({
    id: limiter.id,
    label: limiter.label,
    category: "auth",
    windowMs: 10 * 60 * 1000,
    limit: 5,
    settingKey: "otpSendPerPhoneWindow",
    fieldNames: ["phone"],
    message: "Too many OTP requests. Please wait before requesting another code.",
    event: "auth.otp_send.rate_limited",
  });
}

export function createOtpSendIpLimiter(scope?: string): RequestHandler {
  const limiter = scopedLimiter("auth.otp_send_ip", "OTP send per IP", scope);
  return buildLimiter({
    id: limiter.id,
    label: limiter.label,
    category: "auth",
    windowMs: 10 * 60 * 1000,
    limit: 12,
    settingKey: "otpSendPerIpWindow",
    message: "Too many OTP requests from this device. Please wait before trying another number.",
    event: "auth.otp_send_ip.rate_limited",
  });
}

export function createOtpVerifyLimiter(scope?: string): RequestHandler {
  const limiter = scopedLimiter("auth.otp_verify", "OTP verify attempts", scope);
  return buildLimiter({
    id: limiter.id,
    label: limiter.label,
    category: "auth",
    windowMs: 10 * 60 * 1000,
    limit: 8,
    settingKey: "otpVerifyAttemptsPerWindow",
    fieldNames: ["verificationSessionId", "phone"],
    message: "Too many verification attempts. Please wait before trying again.",
    event: "auth.otp_verify.rate_limited",
  });
}

export function createPasswordRecoveryLimiter(scope?: string): RequestHandler {
  const limiter = scopedLimiter("auth.password_recovery", "Password recovery", scope);
  return buildLimiter({
    id: limiter.id,
    label: limiter.label,
    category: "auth",
    windowMs: 15 * 60 * 1000,
    limit: 5,
    settingKey: "passwordRecoveryPerWindow",
    fieldNames: ["phone", "email"],
    message: "Too many password recovery attempts. Please wait before trying again.",
    event: "auth.password_recovery.rate_limited",
  });
}

export function createSupportWriteLimiter(): RequestHandler {
  return buildLimiter({
    id: "support.write",
    label: "Support writes",
    windowMs: 15 * 60 * 1000,
    limit: 20,
    settingKey: "supportWritePerWindow",
    keyStrategy: "user",
    message: "Too many support messages. Please slow down and try again shortly.",
    event: "support.write.rate_limited",
  });
}

export function createAccountDeletionLimiter(): RequestHandler {
  return buildLimiter({
    id: "account.deletion_request",
    label: "Account deletion requests",
    windowMs: 60 * 60 * 1000,
    limit: 5,
    fieldNames: ["phone"],
    message: "Too many deletion requests. Please try again later.",
    event: "account.deletion_request.rate_limited",
  });
}

export function createPaymentLimiter(): RequestHandler {
  return buildLimiter({
    id: "payment.initiate",
    label: "Payment initiation",
    windowMs: 15 * 60 * 1000,
    limit: 8,
    settingKey: "paymentInitiatePerWindow",
    keyStrategy: "user",
    message: "Too many payment attempts. Please wait a moment and try again.",
    event: "payment.initiate.rate_limited",
  });
}

export function createOrderActionLimiter(): RequestHandler {
  return buildLimiter({
    id: "order.action",
    label: "Order actions",
    windowMs: 15 * 60 * 1000,
    limit: 10,
    settingKey: "orderActionPerWindow",
    keyStrategy: "user",
    message: "Too many order actions. Please wait a moment and try again.",
    event: "order.action.rate_limited",
  });
}

export function createRefreshLimiter(scope?: string): RequestHandler {
  const limiter = scopedLimiter("auth.refresh", "Session refresh", scope);
  return buildLimiter({
    id: limiter.id,
    label: limiter.label,
    category: "auth",
    windowMs: 15 * 60 * 1000,
    limit: 60,
    settingKey: "refreshPerWindow",
    keyGenerator: withRefreshTokenFingerprint,
    message: "Too many session refresh attempts. Please try again in a few minutes.",
    event: "auth.refresh.rate_limited",
  });
}

export function createAnalyticsEventLimiter(): RequestHandler {
  return buildLimiter({
    id: "analytics.events",
    label: "Analytics events",
    windowMs: 15 * 60 * 1000,
    limit: 240,
    settingKey: "analyticsEventsPerWindow",
    fieldNames: ["anonymousId", "sessionId"],
    message: "Too many analytics events. Please slow down and try again shortly.",
    event: "analytics.event.rate_limited",
  });
}

export function createCartQuoteLimiter(): RequestHandler {
  return buildLimiter({
    id: "cart.quote",
    label: "Cart quotes",
    windowMs: 15 * 60 * 1000,
    limit: 300,
    settingKey: "cartQuotePerWindow",
    keyStrategy: "user",
    message: "Too many cart quote requests. Please wait a moment and try again.",
    event: "cart.quote.rate_limited",
  });
}

// Lenient per-customer BURST limiter for the favourite heart toggle. Deliberately short
// (60s) and high (40) so a real person tapping hearts never hits it — it only trips on
// automated/rapid-fire abuse, and any trip clears within a minute. The app swallows the
// 429 silently (favourite is low-stakes), so a normal user never sees a message.
export function createFavoriteToggleLimiter(): RequestHandler {
  return buildLimiter({
    id: "favorite.toggle",
    label: "Favourite toggles",
    windowMs: 60 * 1000,
    limit: 40,
    keyStrategy: "user",
    message: "You're updating favourites very quickly. Please wait a few seconds.",
    event: "favorite.toggle.rate_limited",
  });
}

export function createCouponAttemptLimiter(): RequestHandler {
  return buildLimiter({
    id: "coupon.attempt",
    label: "Coupon attempts",
    windowMs: 15 * 60 * 1000,
    limit: 20,
    settingKey: "couponAttemptPerWindow",
    keyStrategy: "user",
    skip: (req) => {
      const body = req.body as Record<string, unknown> | undefined;
      return typeof body?.voucherCode !== "string" || !body.voucherCode.trim();
    },
    message: "Too many voucher attempts. Please try again later.",
    event: "coupon.attempt.rate_limited",
  });
}

export function createReferralApplyLimiter(): RequestHandler {
  return buildLimiter({
    id: "referral.apply",
    label: "Referral apply attempts",
    windowMs: 15 * 60 * 1000,
    limit: 5,
    settingKey: "referralApplyPerWindow",
    keyStrategy: "user",
    skip: (req) => {
      const body = req.body as Record<string, unknown> | undefined;
      return typeof body?.referralCode !== "string" || !body.referralCode.trim();
    },
    message: "Too many referral code attempts. Please try again later.",
    event: "referral.apply.rate_limited",
  });
}

export function createOrderPlaceLimiter(): RequestHandler {
  return buildLimiter({
    id: "order.place",
    label: "Order placement",
    windowMs: 15 * 60 * 1000,
    limit: 12,
    settingKey: "orderPlacePerWindow",
    keyStrategy: "user",
    message: "Too many order attempts. Please wait a moment and try again.",
    event: "order.place.rate_limited",
  });
}

export function createCustomerOrderReadLimiter(): RequestHandler {
  return buildLimiter({
    id: "customer.order_read",
    label: "Customer order reads",
    windowMs: 15 * 60 * 1000,
    limit: 360,
    keyGenerator: (req) => {
      const userKey = withUser(req);
      const orderId =
        typeof req.params.orderId === "string" && req.params.orderId.trim()
          ? req.params.orderId.trim()
          : "unknown";
      return `${userKey}:order:${orderId}`;
    },
    message: "Too many order tracking requests. Please slow down and try again shortly.",
    event: "customer.order_read.rate_limited",
  });
}

export function createRiderLocationLimiter(): RequestHandler {
  return buildLimiter({
    id: "rider.location",
    label: "Rider location updates",
    windowMs: 15 * 60 * 1000,
    limit: 900,
    settingKey: "riderLocationPerWindow",
    keyStrategy: "user",
    message: "Too many rider location updates. Please slow down and try again shortly.",
    event: "rider.location.rate_limited",
  });
}

export function createAdminWriteLimiter(): RequestHandler {
  return buildLimiter({
    id: "admin.write",
    label: "Admin writes",
    windowMs: 15 * 60 * 1000,
    limit: 240,
    settingKey: "adminWritePerWindow",
    keyStrategy: "user",
    methods: writeMethods,
    message: "Too many admin changes. Please slow down and try again shortly.",
    event: "admin.write.rate_limited",
  });
}

export function createOwnerWriteLimiter(): RequestHandler {
  return buildLimiter({
    id: "owner.write",
    label: "Owner writes",
    windowMs: 15 * 60 * 1000,
    limit: 240,
    settingKey: "ownerWritePerWindow",
    keyStrategy: "user",
    methods: writeMethods,
    message: "Too many owner changes. Please slow down and try again shortly.",
    event: "owner.write.rate_limited",
  });
}

export function createGlobalLimiter(): RequestHandler {
  return buildLimiter({
    id: "global.api",
    label: "Global API",
    category: "global",
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    keyStrategy: "user",
    skip: (req) =>
      (req.method === "POST" &&
        /^\/api\/v1\/rider\/orders\/[^/]+\/location$/.test(req.path)) ||
      (req.method === "PATCH" &&
        req.path === `${env.API_PREFIX}/rider/profile/location`) ||
      (req.method === "GET" &&
        /^\/api\/v1\/customer\/orders\/[^/]+$/.test(req.path)) ||
      (req.method === "POST" &&
        req.path === `${env.API_PREFIX}/customer/analytics/events`) ||
      (req.method === "POST" &&
        req.path === `${env.API_PREFIX}/media/upload-signature`),
    message: "Too many requests. Please slow down and try again shortly.",
    event: "global.rate_limited",
  });
}

export async function getRateLimitSnapshot() {
  const limiters = await Promise.all(
    Array.from(limiterMeta.values()).map(async (meta) => {
      const store = limiterStores.get(meta.id);
      const limit = await getLimiterLimit(meta);
      const buckets = store?.snapshot() ?? [];
      return {
        ...meta,
        limit,
        activeBuckets: store?.size() ?? 0,
        buckets: buckets.map((bucket) => ({
          ...bucket,
          remaining: Math.max(0, limit - bucket.totalHits),
          usedPercent: limit > 0 ? Math.min(100, Math.round((bucket.totalHits / limit) * 100)) : 0,
        })),
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    enabled: env.RATE_LIMIT_ENABLED,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    limiters: limiters.sort((left, right) => {
      const categoryOrder = { global: 0, auth: 1, business: 2 };
      return categoryOrder[left.category] - categoryOrder[right.category] || left.label.localeCompare(right.label);
    }),
  };
}

export function resetRateLimitBucket(params: {
  limiterId: string;
  resetToken: string;
}) {
  const meta = limiterMeta.get(params.limiterId);
  const store = limiterStores.get(params.limiterId);

  if (!meta || !store) {
    return {
      reset: false,
      limiterId: params.limiterId,
      reason: "limiter_not_found" as const,
    };
  }

  const result = store.resetByToken(params.resetToken);

  return {
    limiterId: meta.id,
    label: meta.label,
    ...result,
    reason: result.reset ? undefined : ("bucket_not_found" as const),
  };
}
