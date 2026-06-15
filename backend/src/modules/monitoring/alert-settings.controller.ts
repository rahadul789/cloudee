import type { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { AuthenticatedRequest } from "../../common/middleware/auth";
import { AppError } from "../../common/utils/app-error";
import { asyncHandler } from "../../common/utils/async-handler";
import { sendSuccess } from "../../common/utils/api-response";
import { env } from "../../config/env";
import {
  type AlertLayer,
  getAlertChannelStatus,
  sendOperationalAlert,
} from "./alert-notifier";
import {
  getAlertDeliverySettings,
  updateAlertDeliverySettings,
} from "./alert-settings.service";

const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());

const optionalEmailSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase());

const alertSettingsSchema = z
  .object({
    recipientEmails: z.array(emailSchema).max(20).default([]),
    notificationChannel: z.enum(["email", "telegram", "both"]).default("both"),
    fromEmail: optionalEmailSchema,
    fromName: z.string().trim().min(1).max(80),
    cooldownMinutes: z.coerce.number().int().min(1).max(24 * 60),
    checkIntervalSeconds: z.coerce.number().int().min(15).max(3600),
    memoryRssMb: z.coerce.number().int().min(128).max(8192),
    cpuPercent: z.coerce.number().int().min(1).max(100),
    fivexxThreshold: z.coerce.number().int().min(1).max(1000),
    sslExpiryDays: z.coerce.number().int().min(1).max(90),
  })
  .superRefine((settings, ctx) => {
    const emailEnabled =
      settings.notificationChannel === "email" ||
      settings.notificationChannel === "both";
    if (!emailEnabled) return;
    if (!settings.recipientEmails.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientEmails"],
        message: "Add at least one email recipient or choose Telegram only.",
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.fromEmail)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fromEmail"],
        message: "Enter a valid from email or choose Telegram only.",
      });
    }
  });

const testAlertSchema = z.object({
  recipientEmails: z.array(emailSchema).min(1).max(20),
  fromEmail: emailSchema,
  fromName: z.string().trim().min(1).max(80),
});

const telegramTestSchema = z.object({
  layer: z.enum(["operations", "system"]),
});

function smtpStatus() {
  return {
    enabled: env.ALERTS_ENABLED,
    smtpConfigured: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
    smtpHost: env.SMTP_HOST ?? "",
    smtpPort: env.SMTP_PORT,
    smtpSecure: env.SMTP_SECURE,
    smtpUser: env.SMTP_USER ?? "",
    ...getAlertChannelStatus(),
  };
}

export const getAdminAlertSettingsController = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const settings = await getAlertDeliverySettings();
    return sendSuccess(res, {
      data: {
        settings,
        status: smtpStatus(),
      },
    });
  },
);

export const putAdminAlertSettingsController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const settings = alertSettingsSchema.parse(req.body.settings);
    const data = await updateAlertDeliverySettings({
      settings,
      adminId: req.user?.id ?? "",
      adminName: req.user?.id ?? "",
    });

    return sendSuccess(res, {
      message: "Alert delivery settings updated",
      data: {
        settings: data,
        status: smtpStatus(),
      },
    });
  },
);

export const postAdminAlertTestController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const settings = testAlertSchema.parse(req.body.settings);
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "SMTP_NOT_CONFIGURED",
        "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in the server .env.",
      );
    }
    await sendOperationalAlert(
      {
        dedupeKey: `manual-admin-test:${Date.now()}`,
        severity: "info",
        layer: "operations",
        title: "Foodbela alert email test",
        body:
          "This is a manual test alert from Foodbela Admin. If you received this email, alert delivery is working.",
        details: {
          requestedBy: req.user?.id ?? "admin",
          recipients: settings.recipientEmails.join(", "),
          sentAt: new Date().toISOString(),
        },
      },
      {
        delivery: settings,
        force: true,
        ignoreCooldown: true,
        requireEmail: true,
        channels: { email: true, telegram: false },
      },
    );

    return sendSuccess(res, {
      message: "Test alert send attempted. Check the recipient inbox and spam folder.",
      data: {
        recipients: settings.recipientEmails,
        status: smtpStatus(),
      },
    });
  },
);

function buildTelegramTestMessage(layer: AlertLayer, requestedBy: string) {
  if (layer === "system") {
    return {
      dedupeKey: `manual-system-telegram-test:${Date.now()}`,
      severity: "warning" as const,
      layer,
      title: "System monitor test",
      body:
        "This is a manual Foodbela system alert test. Real alerts in this channel include backend down, database disconnected, high 5xx, high CPU/memory, SSL expiry, SMS provider issues, and repeated scheduler failures.",
      details: {
        service: "backend",
        environment: env.NODE_ENV,
        sampleProblem: "Backend readiness check failed",
        action: "Open Operations Health and check Infrastructure.",
        requestedBy,
        sentAt: new Date().toISOString(),
      },
    };
  }

  return {
    dedupeKey: `manual-ops-telegram-test:${Date.now()}`,
    severity: "critical" as const,
    layer,
    title: "Operations alert test",
    body:
      "This is a manual Foodbela operations alert test. Real alerts in this channel include order auto-cancel, restaurant response late, rider assignment late, delivery late, refund overdue, and support SLA overdue.",
    details: {
      orderNumber: "FB-TEST-1024",
      restaurant: "Demo Restaurant",
      issue: "Rider assignment late",
      path: "/orders?orderId=test",
      action: "Open the linked admin page and contact the restaurant/rider/customer as needed.",
      requestedBy,
      sentAt: new Date().toISOString(),
    },
  };
}

export const postAdminTelegramTestController = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { layer } = telegramTestSchema.parse(req.body);
    const channelStatus = getAlertChannelStatus();
    const isConfigured =
      layer === "system"
        ? channelStatus.telegramSystemConfigured
        : channelStatus.telegramOpsConfigured;

    if (!isConfigured) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "TELEGRAM_NOT_CONFIGURED",
        `Telegram ${layer} channel is not configured. Set the layer bot/chat env vars or the global Telegram env vars.`,
      );
    }

    await sendOperationalAlert(buildTelegramTestMessage(layer, req.user?.id ?? "admin"), {
      force: true,
      ignoreCooldown: true,
      channels: { email: false, telegram: true },
    });

    return sendSuccess(res, {
      message: `Telegram ${layer} test alert sent.`,
      data: {
        layer,
        status: smtpStatus(),
      },
    });
  },
);
