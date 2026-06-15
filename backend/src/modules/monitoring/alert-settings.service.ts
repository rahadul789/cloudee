import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import { AlertDeliverySettingsModel } from "./alert-settings.model";

export type AlertDeliverySettings = {
  recipientEmails: string[];
  notificationChannel: "email" | "telegram" | "both";
  fromEmail: string;
  fromName: string;
  cooldownMinutes: number;
  checkIntervalSeconds: number;
  memoryRssMb: number;
  cpuPercent: number;
  fivexxThreshold: number;
  sslExpiryDays: number;
};

export type AlertDeliverySettingsInput = Partial<AlertDeliverySettings>;

const SETTINGS_KEY = "global";
const alertSettingsCache = createInMemoryAsyncCache<AlertDeliverySettings>({
  ttlMs: 15_000,
  staleWhileRevalidateMs: 45_000,
  maxEntries: 2,
});

function splitCsv(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueEmails(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
    ),
  );
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function getEnvAlertDeliverySettings(): AlertDeliverySettings {
  return {
    recipientEmails: uniqueEmails(splitCsv(env.ALERT_RECIPIENT_EMAILS)),
    notificationChannel: "both",
    fromEmail: (env.ALERT_FROM_EMAIL ?? "").trim().toLowerCase(),
    fromName: env.ALERT_FROM_NAME,
    cooldownMinutes: env.ALERT_COOLDOWN_MINUTES,
    checkIntervalSeconds: env.ALERT_CHECK_INTERVAL_SECONDS,
    memoryRssMb: env.ALERT_MEMORY_RSS_MB,
    cpuPercent: env.ALERT_CPU_PERCENT,
    fivexxThreshold: env.ALERT_5XX_THRESHOLD,
    sslExpiryDays: env.ALERT_SSL_EXPIRY_DAYS,
  };
}

function mergeSettings(
  fallback: AlertDeliverySettings,
  override?: Record<string, any> | null,
): AlertDeliverySettings {
  if (!override) return fallback;
  return {
    recipientEmails: uniqueEmails(
      Array.isArray(override.recipientEmails)
        ? override.recipientEmails.map(String)
        : fallback.recipientEmails,
    ),
    notificationChannel:
      override.notificationChannel === "email" ||
      override.notificationChannel === "telegram" ||
      override.notificationChannel === "both"
        ? override.notificationChannel
        : fallback.notificationChannel,
    fromEmail:
      typeof override.fromEmail === "string" && override.fromEmail.trim()
        ? override.fromEmail.trim().toLowerCase()
        : fallback.fromEmail,
    fromName:
      typeof override.fromName === "string" && override.fromName.trim()
        ? override.fromName.trim()
        : fallback.fromName,
    cooldownMinutes: numberValue(
      override.cooldownMinutes,
      fallback.cooldownMinutes,
      1,
      24 * 60,
    ),
    checkIntervalSeconds: numberValue(
      override.checkIntervalSeconds,
      fallback.checkIntervalSeconds,
      15,
      3600,
    ),
    memoryRssMb: numberValue(override.memoryRssMb, fallback.memoryRssMb, 128, 8192),
    cpuPercent: numberValue(override.cpuPercent, fallback.cpuPercent, 1, 100),
    fivexxThreshold: numberValue(
      override.fivexxThreshold,
      fallback.fivexxThreshold,
      1,
      1000,
    ),
    sslExpiryDays: numberValue(
      override.sslExpiryDays,
      fallback.sslExpiryDays,
      1,
      90,
    ),
  };
}

export async function getAlertDeliverySettings() {
  return alertSettingsCache.getOrSet(SETTINGS_KEY, async () => {
    const fallback = getEnvAlertDeliverySettings();
    try {
      const row = await AlertDeliverySettingsModel.findOne({ key: SETTINGS_KEY }).lean();
      return mergeSettings(fallback, row);
    } catch (error) {
      logger.warn(error, "Could not read alert delivery settings; using env fallback");
      return fallback;
    }
  });
}

export async function updateAlertDeliverySettings(params: {
  settings: AlertDeliverySettingsInput;
  adminId?: string;
  adminName?: string;
}) {
  const fallback = await getAlertDeliverySettings();
  const next = mergeSettings(fallback, params.settings);
  const row = await AlertDeliverySettingsModel.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        key: SETTINGS_KEY,
        ...next,
        updatedByAdminId: params.adminId ?? "",
        updatedByAdminName: params.adminName ?? "",
      },
    },
    { new: true, upsert: true },
  ).lean();
  alertSettingsCache.clear();
  return mergeSettings(next, row);
}

export function mergeAlertDeliverySettings(
  override?: AlertDeliverySettingsInput,
): AlertDeliverySettings {
  return mergeSettings(getEnvAlertDeliverySettings(), override);
}
