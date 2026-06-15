import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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

function buildLimiter(options: {
  windowMs: number;
  limit: number;
  settingKey?: RateLimitSettingKey;
  keyStrategy?: RateLimitKeyStrategy;
  fieldNames?: string[];
  methods?: string[];
  message: string;
  event?: string;
}): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) {
    return passThroughLimiter;
  }

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
    skip: (req) =>
      Boolean(
        options.methods?.length && !options.methods.includes(req.method.toUpperCase()),
      ),
    keyGenerator: (req) =>
      options.fieldNames?.length
        ? withIdentity(req, options.fieldNames)
        : options.keyStrategy === "user"
          ? withUser(req)
        : ipKeyGenerator(req.ip ?? ""),
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

export function createSigninLimiter(): RequestHandler {
  return buildLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    settingKey: "signinAttemptsPerWindow",
    fieldNames: ["phone", "email"],
    message: "Too many sign-in attempts. Please wait a few minutes and try again.",
    event: "auth.signin.rate_limited",
  });
}

export function createSignupLimiter(): RequestHandler {
  return buildLimiter({
    windowMs: 30 * 60 * 1000,
    limit: 5,
    settingKey: "signupAttemptsPerWindow",
    fieldNames: ["phone", "email"],
    message: "Too many sign-up attempts. Please wait before trying again.",
    event: "auth.signup.rate_limited",
  });
}

export function createOtpSendLimiter(): RequestHandler {
  return buildLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    settingKey: "otpSendPerPhoneWindow",
    fieldNames: ["phone"],
    message: "Too many OTP requests. Please wait before requesting another code.",
    event: "auth.otp_send.rate_limited",
  });
}

export function createOtpSendIpLimiter(): RequestHandler {
  return buildLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 12,
    settingKey: "otpSendPerIpWindow",
    message: "Too many OTP requests from this device. Please wait before trying another number.",
    event: "auth.otp_send_ip.rate_limited",
  });
}

export function createOtpVerifyLimiter(): RequestHandler {
  return buildLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 8,
    settingKey: "otpVerifyAttemptsPerWindow",
    fieldNames: ["verificationSessionId", "phone"],
    message: "Too many verification attempts. Please wait before trying again.",
    event: "auth.otp_verify.rate_limited",
  });
}

export function createPasswordRecoveryLimiter(): RequestHandler {
  return buildLimiter({
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
    windowMs: 15 * 60 * 1000,
    limit: 20,
    settingKey: "supportWritePerWindow",
    keyStrategy: "user",
    message: "Too many support messages. Please slow down and try again shortly.",
    event: "support.write.rate_limited",
  });
}

export function createPaymentLimiter(): RequestHandler {
  return buildLimiter({
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
    windowMs: 15 * 60 * 1000,
    limit: 10,
    settingKey: "orderActionPerWindow",
    keyStrategy: "user",
    message: "Too many order actions. Please wait a moment and try again.",
    event: "order.action.rate_limited",
  });
}

export function createRefreshLimiter(): RequestHandler {
  return buildLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    settingKey: "refreshPerWindow",
    message: "Too many session refresh attempts. Please try again in a few minutes.",
    event: "auth.refresh.rate_limited",
  });
}

export function createAnalyticsEventLimiter(): RequestHandler {
  return buildLimiter({
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
    windowMs: 15 * 60 * 1000,
    limit: 300,
    settingKey: "cartQuotePerWindow",
    message: "Too many cart quote requests. Please wait a moment and try again.",
    event: "cart.quote.rate_limited",
  });
}

export function createOrderPlaceLimiter(): RequestHandler {
  return buildLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    settingKey: "orderPlacePerWindow",
    keyStrategy: "user",
    message: "Too many order attempts. Please wait a moment and try again.",
    event: "order.place.rate_limited",
  });
}

export function createRiderLocationLimiter(): RequestHandler {
  return buildLimiter({
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
    windowMs: 15 * 60 * 1000,
    limit: 240,
    settingKey: "ownerWritePerWindow",
    keyStrategy: "user",
    methods: writeMethods,
    message: "Too many owner changes. Please slow down and try again shortly.",
    event: "owner.write.rate_limited",
  });
}
