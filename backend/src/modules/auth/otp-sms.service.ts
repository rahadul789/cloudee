import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { getPlatformContent } from "../public/content.service";

type SmsBdResponse = {
  error?: number | string;
  msg?: string;
  data?: {
    request_id?: number | string;
    balance?: number | string;
  };
};

export type OtpDeliveryConfig = {
  platformName: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  messageTemplate: string;
  telegramFallbackEnabled: boolean;
  callButtonAfterResends: number;
  supportCallNumber: string;
  whatsappOtpEnabled: boolean;
  whatsappAfterResends: number;
};

const DEFAULT_OTP_MESSAGE_TEMPLATE =
  "Your {{platformName}} verification code is {{code}}. It expires in {{expiryMinutes}} minutes.";

function normalizeSmsPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (/^01\d{9}$/.test(digits)) {
    return `88${digits}`;
  }

  if (/^8801\d{9}$/.test(digits)) {
    return digits;
  }

  throw new AppError(
    StatusCodes.BAD_REQUEST,
    "INVALID_SMS_PHONE",
    "Enter a valid Bangladeshi phone number",
  );
}

function maskSmsPhone(phone: string) {
  return phone.length <= 4
    ? phone
    : `${phone.slice(0, 5)}***${phone.slice(-3)}`;
}

function parseSmsBdResponse(rawText: string): SmsBdResponse {
  if (!rawText.trim()) return {};

  try {
    return JSON.parse(rawText) as SmsBdResponse;
  } catch {
    return { error: "INVALID_JSON", msg: rawText.slice(0, 160) };
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function getFallbackOtpDeliveryConfig(): OtpDeliveryConfig {
  return {
    platformName: "Foodbela",
    expiresInSeconds: clampInteger(env.OTP_EXPIRY_SECONDS, 300, 60, 900),
    resendCooldownSeconds: clampInteger(
      env.OTP_RESEND_COOLDOWN_SECONDS,
      60,
      15,
      300,
    ),
    messageTemplate: DEFAULT_OTP_MESSAGE_TEMPLATE,
    telegramFallbackEnabled: false,
    callButtonAfterResends: 2,
    supportCallNumber: "",
    whatsappOtpEnabled: false,
    whatsappAfterResends: 1,
  };
}

export async function getOtpDeliveryConfig(): Promise<OtpDeliveryConfig> {
  try {
    const content = await getPlatformContent();
    const otpSettings = content.auth?.otp;
    const fallback = getFallbackOtpDeliveryConfig();

    return {
      platformName: content.branding?.platformName?.trim() || fallback.platformName,
      expiresInSeconds: clampInteger(
        otpSettings?.expiresInSeconds,
        fallback.expiresInSeconds,
        60,
        900,
      ),
      resendCooldownSeconds: clampInteger(
        otpSettings?.resendCooldownSeconds,
        fallback.resendCooldownSeconds,
        15,
        300,
      ),
      messageTemplate: otpSettings?.messageTemplate?.includes("{{code}}")
        ? otpSettings.messageTemplate
        : fallback.messageTemplate,
      telegramFallbackEnabled: otpSettings?.telegramFallbackEnabled === true,
      callButtonAfterResends: clampInteger(
        otpSettings?.callButtonAfterResends,
        fallback.callButtonAfterResends,
        1,
        5,
      ),
      supportCallNumber:
        typeof otpSettings?.supportCallNumber === "string"
          ? otpSettings.supportCallNumber.trim().slice(0, 20)
          : fallback.supportCallNumber,
      whatsappOtpEnabled: otpSettings?.whatsappOtpEnabled === true,
      whatsappAfterResends: clampInteger(
        otpSettings?.whatsappAfterResends,
        fallback.whatsappAfterResends,
        0,
        5,
      ),
    };
  } catch (error) {
    logger.warn({ error }, "Using fallback OTP config");
    return getFallbackOtpDeliveryConfig();
  }
}

export function buildOtpSmsMessage(
  otpCode: string,
  config: OtpDeliveryConfig = getFallbackOtpDeliveryConfig(),
) {
  const expiryMinutes = Math.max(1, Math.ceil(config.expiresInSeconds / 60));

  return config.messageTemplate
    .replaceAll("{{code}}", otpCode)
    .replaceAll("{{expiryMinutes}}", String(expiryMinutes))
    .replaceAll("{{expirySeconds}}", String(config.expiresInSeconds))
    .replaceAll("{{platformName}}", config.platformName);
}

export async function sendTransactionalSms(params: {
  phone: string;
  message: string;
}) {
  const message = params.message.trim();

  if (!message) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "SMS_MESSAGE_EMPTY",
      "SMS message cannot be empty",
    );
  }

  if (env.MOCK_OTP_ENABLED) {
    logger.debug(
      { phone: maskSmsPhone(params.phone) },
      "Mock OTP enabled; transactional SMS delivery skipped",
    );
    return { skipped: true, provider: "mock" as const };
  }

  const apiKey = env.SMS_API_KEY?.trim();

  if (!apiKey) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "SMS_API_KEY_MISSING",
      "SMS API key is not configured on the server",
    );
  }

  const to = normalizeSmsPhone(params.phone);
  const payload = {
    api_key: apiKey,
    msg: message.slice(0, 480),
    to,
    ...(env.SMS_SENDER_ID?.trim()
      ? { sender_id: env.SMS_SENDER_ID.trim() }
      : {}),
  };

  let response: Response;
  let rawText = "";

  try {
    response = await fetchWithTimeout(env.SMS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs: 5_000,
    });
    rawText = await response.text();
  } catch (error) {
    logger.error(
      { error, phone: maskSmsPhone(to) },
      "Transactional SMS provider request failed",
    );
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_UNAVAILABLE",
      "Could not send SMS right now",
    );
  }

  const body = parseSmsBdResponse(rawText);
  const providerError = Number(body.error);

  if (!response.ok || providerError !== 0) {
    logger.warn(
      {
        status: response.status,
        providerError: body.error,
        providerMessage: body.msg,
        phone: maskSmsPhone(to),
      },
      "SMS provider rejected transactional message",
    );
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_REJECTED",
      typeof body.msg === "string" && body.msg.trim()
        ? body.msg
        : "Could not send SMS right now",
    );
  }

  logger.info(
    { requestId: body.data?.request_id, phone: maskSmsPhone(to) },
    "Transactional SMS sent",
  );

  return {
    skipped: false,
    provider: "sms.bd" as const,
    requestId: body.data?.request_id,
  };
}

export async function getSmsProviderBalance() {
  const checkedAt = new Date().toISOString();
  const apiKey = env.SMS_API_KEY?.trim();

  if (!apiKey) {
    return {
      configured: false,
      status: "not_configured" as const,
      provider: "sms.bd" as const,
      balance: null,
      rawBalance: "",
      message: "SMS_API_KEY is not configured",
      senderIdConfigured: Boolean(env.SMS_SENDER_ID?.trim()),
      checkedAt,
    };
  }

  const balanceUrl = new URL("/user/balance/", env.SMS_API_URL);
  balanceUrl.searchParams.set("api_key", apiKey);

  try {
    const response = await fetchWithTimeout(balanceUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      timeoutMs: 5_000,
    });
    const rawText = await response.text();
    const body = parseSmsBdResponse(rawText);
    const providerError = Number(body.error);

    if (!response.ok || providerError !== 0) {
      return {
        configured: true,
        status: "failed" as const,
        provider: "sms.bd" as const,
        balance: null,
        rawBalance: "",
        message:
          typeof body.msg === "string" && body.msg.trim()
            ? body.msg
            : "SMS balance check failed",
        senderIdConfigured: Boolean(env.SMS_SENDER_ID?.trim()),
        checkedAt,
      };
    }

    const rawBalance =
      typeof body.data?.balance === "string" || typeof body.data?.balance === "number"
        ? String(body.data.balance)
        : "";
    const balance = Number(rawBalance);

    return {
      configured: true,
      status: "ok" as const,
      provider: "sms.bd" as const,
      balance: Number.isFinite(balance) ? balance : null,
      rawBalance,
      message: body.msg || "Success",
      senderIdConfigured: Boolean(env.SMS_SENDER_ID?.trim()),
      checkedAt,
    };
  } catch (error) {
    logger.warn({ error }, "SMS balance check failed");
    return {
      configured: true,
      status: "failed" as const,
      provider: "sms.bd" as const,
      balance: null,
      rawBalance: "",
      message: error instanceof Error ? error.message : "SMS balance check failed",
      senderIdConfigured: Boolean(env.SMS_SENDER_ID?.trim()),
      checkedAt,
    };
  }
}

export async function sendOtpSms(params: {
  phone: string;
  otpCode: string;
  config?: OtpDeliveryConfig;
}) {
  if (env.MOCK_OTP_ENABLED) {
    logger.debug(
      { phone: maskSmsPhone(params.phone) },
      "Mock OTP enabled; SMS delivery skipped",
    );
    return { skipped: true, provider: "mock" as const };
  }

  const apiKey = env.SMS_API_KEY?.trim();

  if (!apiKey) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "SMS_API_KEY_MISSING",
      "SMS API key is not configured on the server",
    );
  }

  const to = normalizeSmsPhone(params.phone);
  const config = params.config ?? (await getOtpDeliveryConfig());
  const payload = {
    api_key: apiKey,
    msg: buildOtpSmsMessage(params.otpCode, config),
    to,
    ...(env.SMS_SENDER_ID?.trim()
      ? { sender_id: env.SMS_SENDER_ID.trim() }
      : {}),
  };

  let response: Response;
  let rawText = "";

  try {
    response = await fetch(env.SMS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    rawText = await response.text();
  } catch (error) {
    logger.error(
      { error, phone: maskSmsPhone(to) },
      "SMS provider request failed",
    );
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_UNAVAILABLE",
      "Could not send OTP right now",
    );
  }

  const body = parseSmsBdResponse(rawText);
  const providerError = Number(body.error);

  if (!response.ok || providerError !== 0) {
    logger.warn(
      {
        status: response.status,
        providerError: body.error,
        providerMessage: body.msg,
        phone: maskSmsPhone(to),
      },
      "SMS provider rejected OTP request",
    );
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_REJECTED",
      typeof body.msg === "string" && body.msg.trim()
        ? body.msg
        : "Could not send OTP right now",
    );
  }

  logger.info(
    { requestId: body.data?.request_id, phone: maskSmsPhone(to) },
    "OTP SMS sent",
  );

  return {
    skipped: false,
    provider: "sms.bd" as const,
    requestId: body.data?.request_id,
  };
}
