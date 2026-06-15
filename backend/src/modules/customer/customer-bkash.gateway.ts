import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout";
import { env } from "../../config/env";
import { BkashPaymentAttemptModel } from "./customer.model";

function safeStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

// Low-level bKash tokenized-checkout gateway client.
// Extracted from customer.service.ts to keep the gateway transport concerns
// isolated from the customer order/business logic.

function getBkashConfig() {
  if (
    !env.BKASH_BASE_URL ||
    !env.BKASH_USERNAME ||
    !env.BKASH_PASSWORD ||
    !env.BKASH_APP_KEY ||
    !env.BKASH_APP_SECRET
  ) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "BKASH_NOT_CONFIGURED",
      "bKash is not configured yet on the server",
    );
  }

  return {
    baseUrl: env.BKASH_BASE_URL.replace(/\/+$/, ""),
    username: env.BKASH_USERNAME,
    password: env.BKASH_PASSWORD,
    appKey: env.BKASH_APP_KEY,
    appSecret: env.BKASH_APP_SECRET,
  };
}

export function hasBkashGatewayConfig() {
  return Boolean(
    env.BKASH_BASE_URL &&
      env.BKASH_USERNAME &&
      env.BKASH_PASSWORD &&
      env.BKASH_APP_KEY &&
      env.BKASH_APP_SECRET,
  );
}

async function postBkashJson<T>(params: {
  url: string;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
}) {
  const response = await fetchWithTimeout(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(params.headers ?? {}),
    },
    body: JSON.stringify(params.body),
    timeoutMs: 8_000,
  });

  const rawText = await response.text();
  const payload = rawText
    ? (JSON.parse(rawText) as Record<string, unknown>)
    : {};

  if (!response.ok) {
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "BKASH_GATEWAY_ERROR",
      typeof payload.errorMessage === "string"
        ? payload.errorMessage
        : typeof payload.statusMessage === "string"
          ? payload.statusMessage
          : "bKash gateway request failed",
    );
  }

  if (
    (typeof payload.statusCode === "string" && payload.statusCode !== "0000") ||
    typeof payload.errorCode === "string"
  ) {
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "BKASH_GATEWAY_ERROR",
      typeof payload.errorMessage === "string"
        ? payload.errorMessage
        : typeof payload.statusMessage === "string"
          ? payload.statusMessage
          : "bKash gateway request failed",
    );
  }

  return payload as T;
}

async function grantBkashToken() {
  const config = getBkashConfig();

  return postBkashJson<{
    id_token: string;
    refresh_token?: string;
  }>({
    url: `${config.baseUrl}/tokenized/checkout/token/grant`,
    headers: {
      username: config.username,
      password: config.password,
    },
    body: {
      app_key: config.appKey,
      app_secret: config.appSecret,
    },
  });
}

export async function createBkashUrlPayment(params: {
  amount: number;
  payerReference: string;
  merchantInvoiceNumber: string;
  callbackURL: string;
}) {
  const config = getBkashConfig();
  const token = await grantBkashToken();

  return postBkashJson<{
    paymentID: string;
    bkashURL: string;
  }>({
    url: `${config.baseUrl}/tokenized/checkout/create`,
    headers: {
      Authorization: token.id_token,
      "X-APP-Key": config.appKey,
    },
    body: {
      mode: "0011",
      payerReference: params.payerReference,
      callbackURL: params.callbackURL,
      amount: params.amount.toFixed(2),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: params.merchantInvoiceNumber,
    },
  });
}

export async function executeBkashPayment(paymentID: string) {
  const config = getBkashConfig();
  const token = await grantBkashToken();

  return postBkashJson<{
    paymentID: string;
    trxID?: string;
    transactionStatus?: string;
    payerReference?: string;
    customerMsisdn?: string;
  }>({
    url: `${config.baseUrl}/tokenized/checkout/execute`,
    headers: {
      Authorization: token.id_token,
      "X-APP-Key": config.appKey,
    },
    body: {
      paymentID,
    },
  });
}

export async function queryBkashPaymentStatus(paymentID: string) {
  const config = getBkashConfig();
  const token = await grantBkashToken();

  return postBkashJson<{
    paymentID?: string;
    trxID?: string;
    transactionStatus?: string;
    amount?: string;
    currency?: string;
    statusCode?: string;
    statusMessage?: string;
    payerReference?: string;
    customerMsisdn?: string;
  }>({
    url: `${config.baseUrl}/tokenized/checkout/payment/status`,
    headers: {
      Authorization: token.id_token,
      "X-APP-Key": config.appKey,
    },
    body: {
      paymentID,
    },
  });
}

export function maskBkashWalletNumber(value: string) {
  const normalized = value.trim();
  if (normalized.length < 7) return normalized ? "***" : "";
  return `${normalized.slice(0, 4)}****${normalized.slice(-3)}`;
}

export function safeBkashProviderResponse(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const allowedKeys = [
    "paymentID",
    "bkashURL",
    "callbackURL",
    "trxID",
    "transactionStatus",
    "statusCode",
    "statusMessage",
    "errorCode",
    "errorMessage",
    "amount",
    "currency",
    "intent",
    "merchantInvoiceNumber",
    "paymentExecuteTime",
    "payerReference",
    "customerMsisdn",
  ];
  return allowedKeys.reduce<Record<string, unknown>>((next, key) => {
    if (source[key] !== undefined) {
      next[key] = source[key];
    }
    return next;
  }, {});
}

export function getBkashProviderCode(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const source = value as Record<string, unknown>;
  return safeStringValue(source.statusCode ?? source.errorCode);
}

export function getBkashProviderMessage(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const source = value as Record<string, unknown>;
  return safeStringValue(source.statusMessage ?? source.errorMessage);
}

export function isBkashCompletedTransaction(
  status: string,
  response: Record<string, unknown>,
) {
  const normalized = status.trim().toLowerCase();
  return (
    ["completed", "success", "successful"].includes(normalized) ||
    (typeof response.trxID === "string" && response.trxID.trim().length > 0)
  );
}

export function isBkashTerminalFailedTransaction(status: string) {
  const normalized = status.trim().toLowerCase();
  return [
    "cancelled",
    "canceled",
    "failed",
    "failure",
    "expired",
    "void",
  ].includes(normalized);
}

export async function updateBkashPaymentAttempt(
  attemptId: unknown,
  params: {
    event: string;
    status?: string;
    paymentStatus?: string;
    orderFinalizationStatus?: string;
    note?: string;
    reason?: string;
    paymentID?: string;
    transactionId?: string;
    walletNumber?: string;
    payerReference?: string;
    customerMsisdn?: string;
    orderId?: unknown;
    failureStage?: string;
    failureReason?: string;
    providerResponse?: unknown;
    metadata?: Record<string, unknown>;
    timestamps?: Record<string, Date | null>;
  },
) {
  if (!attemptId) return null;
  const providerResponse = safeBkashProviderResponse(params.providerResponse);
  const providerCode = getBkashProviderCode(providerResponse);
  const providerMessage = getBkashProviderMessage(providerResponse);
  const update: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (params.status) update.status = params.status;
  if (params.paymentStatus) update.paymentStatus = params.paymentStatus;
  if (params.orderFinalizationStatus) {
    update.orderFinalizationStatus = params.orderFinalizationStatus;
  }
  if (params.paymentID !== undefined) update.paymentID = params.paymentID;
  if (params.transactionId !== undefined) update.transactionId = params.transactionId;
  if (params.walletNumber !== undefined) update.walletNumber = params.walletNumber;
  if (params.payerReference !== undefined) update.payerReference = params.payerReference;
  if (params.customerMsisdn !== undefined) update.customerMsisdn = params.customerMsisdn;
  if (params.orderId) update.orderId = params.orderId;
  if (params.failureStage !== undefined) update.failureStage = params.failureStage;
  if (params.failureReason !== undefined) update.failureReason = params.failureReason;
  if (Object.keys(providerResponse).length) update.providerResponse = providerResponse;
  Object.entries(params.timestamps ?? {}).forEach(([key, value]) => {
    update[key] = value;
  });

  return BkashPaymentAttemptModel.findByIdAndUpdate(
    attemptId,
    {
      $set: update,
      $push: {
        events: {
          event: params.event,
          status: params.status ?? "",
          paymentStatus: params.paymentStatus ?? "",
          note: params.note ?? "",
          reason: params.reason ?? "",
          providerStatus: safeStringValue((providerResponse as any).transactionStatus),
          providerCode,
          providerMessage,
          metadata: params.metadata ?? {},
          occurredAt: new Date(),
        },
      },
    },
    { new: true },
  );
}
