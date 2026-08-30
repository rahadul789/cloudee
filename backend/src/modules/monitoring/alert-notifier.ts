import net from "node:net";
import tls from "node:tls";
import mongoose from "mongoose";

import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AlertDeliveryLogModel } from "./alert-delivery-log.model";
import {
  type AlertDeliverySettingsInput,
  getAlertDeliverySettings,
  mergeAlertDeliverySettings,
} from "./alert-settings.service";

type AlertSeverity = "critical" | "warning" | "info" | "recovery";
export type AlertLayer = "operations" | "system";

export type AlertMessage = {
  dedupeKey: string;
  severity: AlertSeverity;
  layer?: AlertLayer;
  title: string;
  body: string;
  details?: Record<string, unknown>;
};

type AlertSendOptions = {
  delivery?: AlertDeliverySettingsInput;
  force?: boolean;
  ignoreCooldown?: boolean;
  requireEmail?: boolean;
  channels?: {
    email?: boolean;
    telegram?: boolean;
  };
};

const lastSentAtByKey = new Map<string, number>();
const lastTelegramSentAtByText = new Map<string, number>();
const lastTelegramSentAtByKey = new Map<string, number>();
const TELEGRAM_DUPLICATE_WINDOW_MS = 60_000;
const TELEGRAM_KEY_DUPLICATE_WINDOW_MS = 12 * 60 * 60_000;
const DEDUPE_MAP_PRUNE_THRESHOLD = 500;

// Drop dedupe entries that are older than their useful window so these in-memory
// maps never grow unbounded over a long-running process.
function pruneDedupeMap(map: Map<string, number>, maxAgeMs: number) {
  if (map.size < DEDUPE_MAP_PRUNE_THRESHOLD) return;
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, timestamp] of map) {
    if (timestamp < cutoff) map.delete(key);
  }
}

function getTelegramTarget(layer: AlertLayer = "operations") {
  const layerToken =
    layer === "system" ? env.TELEGRAM_SYSTEM_BOT_TOKEN : env.TELEGRAM_OPS_BOT_TOKEN;
  const layerChatId =
    layer === "system" ? env.TELEGRAM_SYSTEM_CHAT_ID : env.TELEGRAM_OPS_CHAT_ID;
  const token = layerToken || env.TELEGRAM_BOT_TOKEN;
  const chatId = layerChatId || env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

export function getAlertChannelStatus() {
  return {
    telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    telegramOpsConfigured: Boolean(getTelegramTarget("operations")),
    telegramSystemConfigured: Boolean(getTelegramTarget("system")),
  };
}

function getChannelReadiness(
  settings: Awaited<ReturnType<typeof getAlertDeliverySettings>>,
  message: AlertMessage,
) {
  const recipients = settings.recipientEmails;
  const emailReady =
    recipients.length > 0 &&
    Boolean(settings.fromEmail) &&
    Boolean(env.SMTP_HOST) &&
    Boolean(env.SMTP_USER) &&
    Boolean(env.SMTP_PASS);
  return {
    emailReady,
    telegramReady: Boolean(getTelegramTarget(message.layer)),
  };
}

function shouldSend(key: string, severity: AlertSeverity, cooldownMinutes: number) {
  if (severity === "recovery") return true;
  const now = Date.now();
  const cooldownMs = cooldownMinutes * 60_000;
  const lastSentAt = lastSentAtByKey.get(key) ?? 0;
  if (now - lastSentAt < cooldownMs) return false;
  lastSentAtByKey.set(key, now);
  pruneDedupeMap(lastSentAtByKey, Math.max(cooldownMs, 24 * 60 * 60_000));
  return true;
}

function humanizeDetailKey(key: string) {
  return key
    .replace(/[_-]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function adminWebBaseUrl() {
  return env.ADMIN_WEB_BASE_URL.replace(/\/+$/, "");
}

function buildAdminUrl(value: string) {
  const path = value.trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${adminWebBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatDetailValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" &&
    value.trim().startsWith("/") &&
    key.toLowerCase().includes("path")
  ) {
    return buildAdminUrl(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDetails(details?: Record<string, unknown>) {
  if (!details || !Object.keys(details).length) return "";
  return [
    "",
    "Details:",
    ...Object.entries(details).map(
      ([key, value]) => `${humanizeDetailKey(key)}: ${formatDetailValue(key, value)}`,
    ),
  ].join("\n");
}

function escapeHeader(value: string) {
  return value.replace(/[\r\n]/g, " ").trim();
}

function encodeAddress(name: string, email: string) {
  const safeName = escapeHeader(name);
  return safeName ? `"${safeName.replace(/"/g, "'")}" <${email}>` : email;
}

function readSmtpResponse(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP response timed out"));
    }, 15_000);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] ?? "";
      if (/^\d{3}\s/.test(lastLine)) {
        cleanup();
        resolve(buffer);
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(socket: net.Socket, command: string, expected: number[]) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new Error(`SMTP command failed (${command}): ${response.trim()}`);
  }
  return response;
}

function connectSmtp() {
  const host = env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST is not configured");

  return new Promise<net.Socket>((resolve, reject) => {
    const options = {
      host,
      port: env.SMTP_PORT,
      servername: host,
    };
    const socket = env.SMTP_SECURE ? tls.connect(options) : net.connect(options);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP connection timed out"));
    }, 15_000);

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once(env.SMTP_SECURE ? "secureConnect" : "connect", async () => {
      clearTimeout(timer);
      try {
        await readSmtpResponse(socket);
        resolve(socket);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function sendEmailAlert(
  message: AlertMessage,
  settings: Awaited<ReturnType<typeof getAlertDeliverySettings>>,
) {
  const recipients = settings.recipientEmails;
  if (
    !recipients.length ||
    !settings.fromEmail ||
    !env.SMTP_HOST ||
    !env.SMTP_USER ||
    !env.SMTP_PASS
  ) {
    return;
  }

  const socket = await connectSmtp();
  const hostname = "foodbela-monitor";
  const subject = `[Foodbela ${message.severity.toUpperCase()}] ${message.title}`;
  const body = `${message.body}${formatDetails(message.details)}\n\nGenerated at: ${new Date().toISOString()}\n`;
  const headers = [
    `From: ${encodeAddress(settings.fromName, settings.fromEmail)}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${escapeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];
  const data = `${headers.join("\r\n")}\r\n\r\n${body.replace(/\n/g, "\r\n")}`;

  try {
    await smtpCommand(socket, `EHLO ${hostname}`, [250]);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(env.SMTP_USER).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(env.SMTP_PASS).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${env.SMTP_USER}>`, [250]);
    for (const recipient of recipients) {
      await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }
    await smtpCommand(socket, "DATA", [354]);
    socket.write(`${data.replace(/\r?\n\./g, "\r\n..")}\r\n.\r\n`);
    const response = await readSmtpResponse(socket);
    const code = Number(response.slice(0, 3));
    if (code !== 250) {
      throw new Error(`SMTP DATA failed: ${response.trim()}`);
    }
    await smtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

async function sendTelegramAlert(message: AlertMessage) {
  const target = getTelegramTarget(message.layer);
  if (!target) return;
  const body = message.body.replace(
    /Admin path:\s*(\/[^\s\n]+)/g,
    (_match, path: string) => `Admin URL: ${buildAdminUrl(path)}`,
  );
  const severityEmoji =
    message.severity === "critical"
      ? "🔴"
      : message.severity === "warning"
        ? "⚠️"
        : message.severity === "recovery"
          ? "✅"
          : "ℹ️";
  const layerEmoji = message.layer === "system" ? "🛠️" : "📟";
  const text = [
    `${severityEmoji} ${layerEmoji} Foodbela ${message.layer === "system" ? "SYSTEM" : "OPS"} ${message.severity.toUpperCase()}: ${message.title}`,
    "",
    body,
    formatDetails(message.details),
  ]
    .filter(Boolean)
    .join("\n");
  const now = Date.now();
  const previousSentAt = lastTelegramSentAtByText.get(text) ?? 0;
  if (now - previousSentAt < TELEGRAM_DUPLICATE_WINDOW_MS) return;

  const response = await fetch(
    `https://api.telegram.org/bot${target.token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target.chatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Telegram alert failed: ${response.status} ${await response.text()}`);
  }
  lastTelegramSentAtByText.set(text, now);
  for (const [key, sentAt] of lastTelegramSentAtByText.entries()) {
    if (now - sentAt > TELEGRAM_DUPLICATE_WINDOW_MS) {
      lastTelegramSentAtByText.delete(key);
    }
  }
}

async function claimTelegramDelivery(
  message: AlertMessage,
  cooldownMs: number,
  force = false,
) {
  if (force || message.severity === "recovery") return true;

  const nowMs = Date.now();
  pruneDedupeMap(lastTelegramSentAtByKey, TELEGRAM_KEY_DUPLICATE_WINDOW_MS);
  const memorySentAt = lastTelegramSentAtByKey.get(message.dedupeKey) ?? 0;
  if (nowMs - memorySentAt < cooldownMs) return false;

  if (mongoose.connection.readyState !== 1) {
    lastTelegramSentAtByKey.set(message.dedupeKey, nowMs);
    return true;
  }

  const now = new Date(nowMs);
  const cooldownUntil = new Date(nowMs + cooldownMs);
  const channel = `telegram:${message.layer ?? "operations"}`;
  const update = {
    $set: {
      layer: message.layer ?? "operations",
      title: message.title,
      severity: message.severity,
      lastSentAt: now,
      cooldownUntil,
    },
    $inc: { sendCount: 1 },
  };

  const claimedExisting = await AlertDeliveryLogModel.findOneAndUpdate(
    {
      dedupeKey: message.dedupeKey,
      channel,
      $or: [
        { cooldownUntil: { $lte: now } },
        { cooldownUntil: null },
        { cooldownUntil: { $exists: false } },
      ],
    },
    update,
    { new: true },
  ).lean();

  if (claimedExisting) {
    lastTelegramSentAtByKey.set(message.dedupeKey, nowMs);
    return true;
  }

  try {
    await AlertDeliveryLogModel.create({
      dedupeKey: message.dedupeKey,
      channel,
      layer: message.layer ?? "operations",
      title: message.title,
      severity: message.severity,
      lastSentAt: now,
      cooldownUntil,
      sendCount: 1,
    });
    lastTelegramSentAtByKey.set(message.dedupeKey, nowMs);
    return true;
  } catch (error) {
    const duplicateKey =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000;
    if (!duplicateKey) throw error;
    return false;
  }
}

export async function sendOperationalAlert(
  message: AlertMessage,
  options: AlertSendOptions = {},
) {
  if (!env.ALERTS_ENABLED && !options.force) return;
  const settings = options.delivery
    ? mergeAlertDeliverySettings(options.delivery)
    : await getAlertDeliverySettings();
  const readiness = getChannelReadiness(settings, message);
  const channelSetting = settings.notificationChannel;
  const wantsEmail =
    options.channels?.email ?? (channelSetting === "email" || channelSetting === "both");
  const wantsTelegram =
    options.channels?.telegram ??
    (channelSetting === "telegram" || channelSetting === "both");
  if (
    !(wantsEmail && readiness.emailReady) &&
    !(wantsTelegram && readiness.telegramReady)
  ) {
    return;
  }
  if (
    !options.ignoreCooldown &&
    !shouldSend(message.dedupeKey, message.severity, settings.cooldownMinutes)
  ) {
    return;
  }

  const tasks: Array<Promise<unknown>> = [];
  if (wantsEmail && readiness.emailReady) tasks.push(sendEmailAlert(message, settings));
  if (wantsTelegram && readiness.telegramReady) {
    const telegramCooldownMs = Math.max(
      settings.cooldownMinutes * 60_000,
      TELEGRAM_KEY_DUPLICATE_WINDOW_MS,
    );
    tasks.push(
      claimTelegramDelivery(
        message,
        telegramCooldownMs,
        options.force === true || options.ignoreCooldown === true,
      ).then((claimed) => (claimed ? sendTelegramAlert(message) : undefined)),
    );
  }
  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") {
      logger.error(result.reason, "Operational alert delivery failed");
    }
  });
  if (options.requireEmail && readiness.emailReady && results[0]?.status === "rejected") {
    throw results[0].reason;
  }
  if (options.force && results.every((result) => result.status === "rejected")) {
    const firstFailure = results.find((result) => result.status === "rejected");
    throw firstFailure?.reason ?? new Error("Operational alert delivery failed");
  }
}
