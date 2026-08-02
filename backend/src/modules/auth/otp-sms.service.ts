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

type SslSmsResponse = {
  status?: string;
  status_code?: number | string;
  error_message?: string;
  smsinfo?: Array<{
    sms_status?: string;
    status_message?: string;
    reference_id?: string;
  }>;
};

export type SmsProvider = "smsbd" | "sslwireless";
export type SslSenderType = "masking" | "non_masking";

// A unique, ≤20-char alphanumeric client reference the SSL Wireless API needs per send
// (rejects duplicates with error 4023). base36 time + random keeps it short and unique.
function generateCsmsId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${stamp}${rand}`.slice(0, 20);
}

export type OtpDeliveryConfig = {
  platformName: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  // Cooldown used from the FIRST manual resend onward (longer, so support can hand-deliver
  // the code). resendCooldownSeconds still governs the wait after the initial auto-send.
  manualResendCooldownSeconds: number;
  messageTemplate: string;
  telegramFallbackEnabled: boolean;
  callButtonAfterResends: number;
  supportCallNumber: string;
  whatsappOtpEnabled: boolean;
  whatsappAfterResends: number;
  // SMS gateway selection (admin-controlled; env provides the boot default + secrets).
  smsProvider: SmsProvider;
  smsFallbackEnabled: boolean;
  sslSenderType: SslSenderType;
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
    manualResendCooldownSeconds: 90,
    messageTemplate: DEFAULT_OTP_MESSAGE_TEMPLATE,
    telegramFallbackEnabled: false,
    callButtonAfterResends: 2,
    supportCallNumber: "",
    whatsappOtpEnabled: false,
    whatsappAfterResends: 1,
    smsProvider: env.SMS_PROVIDER,
    smsFallbackEnabled: false,
    sslSenderType: "non_masking",
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
      manualResendCooldownSeconds: clampInteger(
        otpSettings?.manualResendCooldownSeconds,
        fallback.manualResendCooldownSeconds,
        15,
        600,
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
      // Admin choice wins; unset falls back to the env boot default.
      smsProvider:
        otpSettings?.smsProvider === "sslwireless" ||
        otpSettings?.smsProvider === "smsbd"
          ? otpSettings.smsProvider
          : fallback.smsProvider,
      smsFallbackEnabled: otpSettings?.smsFallbackEnabled === true,
      sslSenderType:
        otpSettings?.sslSenderType === "masking" ? "masking" : "non_masking",
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

// ── Low-level provider senders ──────────────────────────────────────────────
// Each takes an already-normalized `to` (88XXXXXXXXXXX) + trimmed `message`, returns
// { requestId } on success, or throws an AppError. No provider selection here.

async function sendViaSmsBd(to: string, message: string) {
  const apiKey = env.SMS_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "SMS_API_KEY_MISSING",
      "SMS API key is not configured on the server",
    );
  }

  const payload = {
    api_key: apiKey,
    msg: message.slice(0, 480),
    to,
    ...(env.SMS_SENDER_ID?.trim() ? { sender_id: env.SMS_SENDER_ID.trim() } : {}),
  };

  let response: Response;
  let rawText = "";
  try {
    response = await fetchWithTimeout(env.SMS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 5_000,
    });
    rawText = await response.text();
  } catch (error) {
    logger.error({ error, phone: maskSmsPhone(to) }, "sms.net.bd request failed");
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_UNAVAILABLE",
      "Could not send SMS right now",
    );
  }

  const body = parseSmsBdResponse(rawText);
  if (!response.ok || Number(body.error) !== 0) {
    logger.warn(
      {
        status: response.status,
        providerError: body.error,
        providerMessage: body.msg,
        phone: maskSmsPhone(to),
      },
      "sms.net.bd rejected message",
    );
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_REJECTED",
      typeof body.msg === "string" && body.msg.trim()
        ? body.msg
        : "Could not send SMS right now",
    );
  }

  return {
    requestId:
      body.data?.request_id != null ? String(body.data.request_id) : undefined,
  };
}

async function sendViaSslWireless(
  to: string,
  message: string,
  senderType: SslSenderType,
  brandName: string,
) {
  const apiToken = env.SSL_SMS_API_TOKEN?.trim();
  if (!apiToken) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "SSL_SMS_TOKEN_MISSING",
      "SSL Wireless API token is not configured on the server",
    );
  }

  const sid = (
    senderType === "masking"
      ? env.SSL_SMS_SID_MASKING
      : env.SSL_SMS_SID_NONMASKING
  )?.trim();
  if (!sid) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "SSL_SMS_SID_MISSING",
      `SSL Wireless ${senderType} sender ID is not configured on the server`,
    );
  }

  // SSL Wireless MANDATES that non-masking SMS start with the brand in brackets —
  // "(Brand) <body>" — else it rejects with "Invalid Nonmasking SMS format". Masking
  // SMS already carry the brand as the sender ID, so they need no prefix.
  const brand = brandName.trim();
  const smsBody =
    senderType === "non_masking" && brand && !message.startsWith(`(${brand})`)
      ? `(${brand}) ${message}`
      : message;

  const payload = {
    api_token: apiToken,
    sid,
    msisdn: to,
    sms: smsBody.slice(0, 1000),
    csms_id: generateCsmsId(),
  };

  let response: Response;
  let rawText = "";
  try {
    response = await fetchWithTimeout(env.SSL_SMS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 8_000,
    });
    rawText = await response.text();
  } catch (error) {
    logger.error({ error, phone: maskSmsPhone(to) }, "SSL Wireless request failed");
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_UNAVAILABLE",
      "Could not send SMS right now",
    );
  }

  let body: SslSmsResponse = {};
  try {
    body = rawText.trim() ? (JSON.parse(rawText) as SslSmsResponse) : {};
  } catch {
    body = { error_message: rawText.slice(0, 160) };
  }

  const ok =
    response.ok && body.status === "SUCCESS" && Number(body.status_code) === 200;
  if (!ok) {
    logger.warn(
      {
        status: response.status,
        providerStatus: body.status,
        statusCode: body.status_code,
        error: body.error_message,
        phone: maskSmsPhone(to),
      },
      "SSL Wireless rejected message",
    );
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "SMS_PROVIDER_REJECTED",
      typeof body.error_message === "string" && body.error_message.trim()
        ? body.error_message
        : "Could not send SMS right now",
    );
  }

  return { requestId: body.smsinfo?.[0]?.reference_id };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────
// Sends via the admin-selected provider; when fallback is ON, a failed primary
// send auto-retries once via the OTHER provider (default OFF = clean switch).
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
      "Mock OTP enabled; SMS delivery skipped",
    );
    return { skipped: true as const, provider: "mock" as const };
  }

  const to = normalizeSmsPhone(params.phone);
  const config = await getOtpDeliveryConfig();
  const primary = config.smsProvider;
  const secondary: SmsProvider =
    primary === "sslwireless" ? "smsbd" : "sslwireless";

  const brandName = env.SSL_SMS_BRAND_NAME?.trim() || config.platformName;
  const send = async (provider: SmsProvider) => {
    const result =
      provider === "sslwireless"
        ? await sendViaSslWireless(to, message, config.sslSenderType, brandName)
        : await sendViaSmsBd(to, message);
    logger.info(
      { provider, requestId: result.requestId, phone: maskSmsPhone(to) },
      "Transactional SMS sent",
    );
    return { skipped: false as const, provider, requestId: result.requestId };
  };

  try {
    return await send(primary);
  } catch (primaryError) {
    if (!config.smsFallbackEnabled) throw primaryError;
    logger.warn(
      { err: primaryError, primary, secondary, phone: maskSmsPhone(to) },
      "Primary SMS provider failed; trying fallback provider",
    );
    try {
      return await send(secondary);
    } catch (secondaryError) {
      logger.error(
        { err: secondaryError, primary, secondary, phone: maskSmsPhone(to) },
        "Fallback SMS provider also failed",
      );
      throw secondaryError;
    }
  }
}

export async function getSmsProviderBalance() {
  const checkedAt = new Date().toISOString();
  const config = await getOtpDeliveryConfig();

  // SSL Wireless exposes no balance API — report the credential/config state instead.
  if (config.smsProvider === "sslwireless") {
    const token = env.SSL_SMS_API_TOKEN?.trim();
    const sid = (
      config.sslSenderType === "masking"
        ? env.SSL_SMS_SID_MASKING
        : env.SSL_SMS_SID_NONMASKING
    )?.trim();
    return {
      configured: Boolean(token),
      status: token ? ("ok" as const) : ("not_configured" as const),
      provider: "sslwireless" as const,
      balance: null,
      rawBalance: "",
      message: token
        ? "SSL Wireless has no balance API — check credit in the iSMS Plus portal."
        : "SSL_SMS_API_TOKEN is not configured",
      senderIdConfigured: Boolean(sid),
      checkedAt,
    };
  }

  const apiKey = env.SMS_API_KEY?.trim();

  if (!apiKey) {
    return {
      configured: false,
      status: "not_configured" as const,
      provider: "smsbd" as const,
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
        provider: "smsbd" as const,
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
      provider: "smsbd" as const,
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
      provider: "smsbd" as const,
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
    return { skipped: true as const, provider: "mock" as const };
  }

  const config = params.config ?? (await getOtpDeliveryConfig());
  const message = buildOtpSmsMessage(params.otpCode, config);
  // Delegates to the dispatcher so OTP honours the admin-selected provider + fallback.
  return sendTransactionalSms({ phone: params.phone, message });
}
