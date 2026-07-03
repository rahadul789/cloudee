import crypto from "node:crypto";
import mongoose from "mongoose";

import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { enqueueBackgroundTask } from "../../common/utils/background-task";
import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout";
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import { decorateTrackingSnapshot } from "../../common/utils/tracking-freshness";
import { logger } from "../../config/logger";
import { env } from "../../config/env";
import { emitSocketEvent } from "../../config/socket";
import {
  createBkashUrlPayment,
  executeBkashPayment,
  hasBkashGatewayConfig,
  isBkashCompletedTransaction,
  isBkashTerminalFailedTransaction,
  maskBkashWalletNumber,
  queryBkashPaymentStatus,
  updateBkashPaymentAttempt,
} from "./customer-bkash.gateway";
import { createAdminOperationalAlert } from "../admin/admin-alert.service";
import {
  enqueueAdminBkashPaidWithoutOrderAlert,
  enqueueAdminOrderTerminalExceptionAlert,
} from "../admin/order-exception-alerts";
import {
  assertOtpVerificationAllowed,
  createOtpSession,
  getOtpSessionTiming,
  recordOtpVerificationSuccess,
  rejectInvalidOtpAttempt,
} from "../auth/auth.service";
import {
  applyServiceAreaHomeCmsOverride,
  getPlatformContent,
  registerPlatformContentInvalidationListener,
} from "../public/content.service";
import {
  compareOtpCode,
  comparePassword,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../auth/auth.utils";
import { OtpSessionModel, RestaurantModel, RiderModel } from "../auth/auth.model";
import { LedgerEntryModel } from "../owner/finance.model";
import { syncOrderLedgerForFinalStatus } from "../owner/finance.service";
import { decorateOwnerFinancials } from "../owner/order-financials";
import { createOwnerNotification } from "../owner/operational.service";
import { buildOrderPreparationTiming } from "../owner/preparation-timing";
import { sendLocalizedPushToOwner } from "../owner/push.service";
import { ReviewModel, SupportCaseModel } from "../owner/experience.model";
import {
  getRestaurantEnforcement,
  isRestaurantOrderingRestricted,
} from "../restaurant-enforcement";
import {
  CategoryModel,
  MenuItemModel,
  OrderModel,
} from "../owner/operational.model";
import {
  resolveMenuMarkdownForDisplay,
  type MarkdownRule,
} from "../promotions/menu-markdown";
import { buildActiveMenuMarkdownFilter } from "../promotions/menu-markdown-query";
import {
  applyServiceAreaDeliveryPricing,
  assertLocationInsideServiceArea,
  assertRestaurantMatchesDeliveryServiceArea,
  getServiceAreaRestaurantDistanceKm,
  isCoordinateInsideServiceArea,
  isServiceAreaModeEnabled,
  resolveRestaurantServiceAreaSnapshot,
  resolveServiceZoneForCoordinates,
} from "../service-area/service-area.service";
import { getOrderRouteMetrics, type LatLng } from "../routing/routing.service";
import {
  BkashPaymentAttemptModel,
  BkashSandboxPaymentSessionModel,
  CustomerModel,
  CustomerRefreshTokenSessionModel,
  RestaurantCollectionModel,
  VoucherModel,
  VoucherRedemptionModel,
} from "./customer.model";
import {
  attachReferralToNewCustomer,
  createCustomerReferralCode,
  ensureCustomerReferralCode,
} from "./referral.service";
import {
  calculateVoucherDiscount,
  releaseVoucherRedemptionsForOrder,
  resolveActiveVoucher,
  summarizeAppliedVouchers,
} from "./customer-voucher.service";
import {
  customerCartQuoteCache,
  getCustomerFacingOrderNoteSetting,
  quoteCustomerCart,
} from "./customer-cart.service";
import {
  buildCacheKey,
  calculateDistanceKm,
  CUSTOMER_READ_CACHE_MAX_ENTRIES,
  CUSTOMER_READ_CACHE_TTL_MS,
  normalizeCacheString,
  normalizeCacheStringArray,
  roundCacheCoordinate,
  roundCurrencyAmount,
  trimLimitedString,
} from "./customer-shared.util";

const CUSTOMER_REFRESH_EXPIRY_DAYS = 3650;
const DEFAULT_CUSTOMER_ORDER_PAGE_SIZE = 80;
const MAX_CUSTOMER_ORDER_PAGE_SIZE = 100;
const MAX_CUSTOMER_PUSH_TOKENS = 5;
const DISABLED_CUSTOMER_PUSH_TOKEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_SUPPORT_CASE_REPLIES = 300;
const MAX_ORDER_HISTORY_ENTRIES = 100;
const DEFAULT_CUSTOMER_FULL_NAME = "Your name";
const CUSTOMER_PASSWORD_MIN_LENGTH = 6;
const QUEUED_DELIVERY_DROPOFF_BUFFER_MINUTES = 3;
const QUEUED_DELIVERY_ROUTE_FACTOR = 1.35;
const QUEUED_DELIVERY_SPEED_KMPH = 16;
const CUSTOM_OFFER_TARGET_ORDER_COUNT = 10;
const CUSTOM_OFFER_ADMIN_RESPONSE_HOURS = 72;
export type CustomerCacheRecord = Record<string, any>;
type DiscoverableRestaurantsResult = CustomerCacheRecord[];
type DiscoverableRestaurantsPageResult = {
  items: CustomerCacheRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasNextPage: boolean;
  nextPage: number | null;
};
type CustomerDiscoveryHomeResult = CustomerCacheRecord;
type CustomerRestaurantDetailsResult = CustomerCacheRecord;
export type CustomerCartQuoteResult = CustomerCacheRecord;
const CUSTOMER_ORDER_LIST_SELECT = [
  "_id",
  "restaurantId",
  "orderNumber",
  "status",
  "note",
  "paymentMethod",
  "terminalReason",
  "cancelledBy",
  "pricing",
  "customerSnapshot.deliveryAddress.addressLine",
  "riderSnapshot.name",
  "riderSnapshot.phone",
  "itemsSnapshot.itemId",
  "itemsSnapshot.name",
  "itemsSnapshot.quantity",
  "itemsSnapshot.unitPrice",
  "itemsSnapshot.selectedVariantOptions",
  "itemsSnapshot.selectedAddOnOptions",
  "preparationMeta",
  "timestamps",
  "createdAt",
  "updatedAt",
].join(" ");
let restaurantDataBackfillPromise: Promise<void> | null = null;
let customerIdentityBackfillPromise: Promise<void> | null = null;




function buildDiscoverableRestaurantsCacheKey(params?: {
  search?: string;
  collectionKey?: string;
  restaurantIds?: string[];
  featuredOnly?: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}) {
  return buildCacheKey("discoverable-restaurants", {
    search: normalizeCacheString(params?.search),
    collectionKey: normalizeCacheString(params?.collectionKey),
    restaurantIds: normalizeCacheStringArray(params?.restaurantIds),
    featuredOnly: Boolean(params?.featuredOnly),
    latitude: roundCacheCoordinate(params?.latitude),
    longitude: roundCacheCoordinate(params?.longitude),
    radiusKm: roundCacheCoordinate(params?.radiusKm),
  });
}

function buildCustomerDiscoveryHomeCacheKey(params?: {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  customerId?: string;
  timeBucket?: number;
}) {
  return buildCacheKey("customer-discovery-home", {
    customerId: normalizeCacheString(params?.customerId),
    latitude: roundCacheCoordinate(params?.latitude),
    longitude: roundCacheCoordinate(params?.longitude),
    radiusKm: roundCacheCoordinate(params?.radiusKm),
    // The time-based home section swaps with the Asia/Dhaka clock, so each hour
    // gets its own cache entry. Window boundaries are hour-aligned, so this keeps
    // the served window correct without a separate "fetch the window" round-trip.
    timeBucket: typeof params?.timeBucket === "number" ? params.timeBucket : 0,
  });
}

// 0-23.999 decimal hour in Asia/Dhaka (minutes included for boundary accuracy).
function getDhakaHourDecimal(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return (hour === 24 ? 0 : hour) + minute / 60;
}

function isHourWithinWindow(
  hourDecimal: number,
  startHour: number,
  endHour: number,
): boolean {
  if (endHour > startHour) {
    return hourDecimal >= startHour && hourDecimal < endHour;
  }
  // end <= start: window wraps past midnight (e.g. 23 -> 5).
  return hourDecimal >= startHour || hourDecimal < endHour;
}

function resolveActiveTimeWindow(
  windows: Array<Record<string, any>> | undefined,
  hourDecimal: number,
): Record<string, any> | null {
  if (!Array.isArray(windows)) return null;
  return (
    windows.find(
      (window) =>
        window?.isActive !== false &&
        isHourWithinWindow(
          hourDecimal,
          Number(window?.startHour ?? 0),
          Number(window?.endHour ?? 24),
        ),
    ) ?? null
  );
}

function restaurantMatchesTimeTags(
  restaurant: Record<string, any>,
  tags: string[],
): boolean {
  if (!tags.length) return true;
  const haystack = [
    restaurant?.name,
    ...(Array.isArray(restaurant?.cuisineTypes) ? restaurant.cuisineTypes : []),
    ...(Array.isArray(restaurant?.tags) ? restaurant.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tags.some((tag) => tag && haystack.includes(tag.toLowerCase()));
}

function buildCustomerRestaurantDetailsCacheKey(
  restaurantId: string,
  params?: {
    latitude?: number;
    longitude?: number;
  },
) {
  return buildCacheKey("customer-restaurant-details", {
    restaurantId: normalizeCacheString(restaurantId),
    latitude: roundCacheCoordinate(params?.latitude),
    longitude: roundCacheCoordinate(params?.longitude),
  });
}


function normalizePageBounds(params?: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Math.floor(Number(params?.page ?? 1)) || 1);
  const pageSize = Math.min(
    MAX_CUSTOMER_ORDER_PAGE_SIZE,
    Math.max(
      1,
      Math.floor(
        Number(params?.pageSize ?? DEFAULT_CUSTOMER_ORDER_PAGE_SIZE),
      ) || DEFAULT_CUSTOMER_ORDER_PAGE_SIZE,
    ),
  );
  return { page, pageSize };
}

function pruneCustomerPushTokens(customer: { pushTokens: any[] }) {
  const disabledCutoff = Date.now() - DISABLED_CUSTOMER_PUSH_TOKEN_RETENTION_MS;
  customer.pushTokens = (customer.pushTokens ?? [])
    .filter((token) => {
      if (!token?.disabledAt) return true;
      return new Date(token.disabledAt).getTime() >= disabledCutoff;
    })
    .sort((left, right) => {
      const leftActive = left.disabledAt ? 0 : 1;
      const rightActive = right.disabledAt ? 0 : 1;
      if (leftActive !== rightActive) return rightActive - leftActive;
      return (
        new Date(right.lastSeenAt ?? 0).getTime() -
        new Date(left.lastSeenAt ?? 0).getTime()
      );
    })
    .slice(0, MAX_CUSTOMER_PUSH_TOKENS);
}

function normalizeSigninContextText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function rememberCustomerSigninContext(
  customer: {
    lastKnownDeviceId?: string;
    lastKnownIpAddress?: string;
    lastKnownUserAgent?: string;
  },
  context: { installId?: string; ipAddress?: string; userAgent?: string },
) {
  const installId = normalizeSigninContextText(context.installId, 160);
  const ipAddress = normalizeSigninContextText(context.ipAddress, 80);
  const userAgent = normalizeSigninContextText(context.userAgent, 300);

  if (installId) customer.lastKnownDeviceId = installId;
  if (ipAddress) customer.lastKnownIpAddress = ipAddress;
  if (userAgent) customer.lastKnownUserAgent = userAgent;
}

async function ensureCustomerIdentityBackfill() {
  if (!customerIdentityBackfillPromise) {
    customerIdentityBackfillPromise = Promise.all([
      CustomerModel.updateMany(
        { googleSub: "" },
        {
          $unset: {
            googleSub: 1,
          },
        },
      ),
      CustomerModel.updateMany(
        { phone: "" },
        {
          $unset: {
            phone: 1,
          },
        },
      ),
      CustomerModel.updateMany(
        { passwordHash: null },
        {
          $set: {
            passwordHash: "",
          },
        },
      ),
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }

  await customerIdentityBackfillPromise;
}

async function ensureRestaurantDiscoveryBackfill() {
  // Discovery reads must stay fast. Run restaurant data backfills from admin/migrations,
  // not on customer-facing browse/details requests.
  if (!restaurantDataBackfillPromise) restaurantDataBackfillPromise = Promise.resolve();
}

function buildCustomerAuthPayload(params: {
  customerId: string;
  fullName: string;
  phone?: string;
  email?: string;
  referralCode?: string;
  hasPassword?: boolean;
  profileImage?: { url?: string; publicId?: string };
  previousPhones?: Array<{ phone?: string; changedAt?: Date | string | null }>;
  notificationSettings?: {
    orderUpdates?: boolean;
    restaurantStatus?: boolean;
    reviewReplies?: boolean;
    promotions?: boolean;
  };
  refreshToken: string;
  tokenId: string;
}) {
  return {
    accessToken: signAccessToken({
      subject: params.customerId,
      role: "customer",
      tokenId: params.tokenId,
    }),
    refreshToken: params.refreshToken,
    customer: {
      id: params.customerId,
      fullName: params.fullName,
      phone: params.phone ?? "",
      email: params.email ?? "",
      referralCode: params.referralCode ?? "",
      hasPassword: params.hasPassword ?? false,
      profileImage: params.profileImage ?? { url: "", publicId: "" },
      previousPhones: (params.previousPhones ?? []).map((entry) => ({
        phone: entry.phone ?? "",
        changedAt: entry.changedAt
          ? new Date(entry.changedAt).toISOString()
          : null,
      })),
      notificationSettings: {
        orderUpdates: params.notificationSettings?.orderUpdates ?? true,
        restaurantStatus: params.notificationSettings?.restaurantStatus ?? true,
        reviewReplies: params.notificationSettings?.reviewReplies ?? true,
        promotions: params.notificationSettings?.promotions ?? true,
      },
    },
  };
}

function mapSavedLocation(location: {
  _id?: mongoose.Types.ObjectId | string;
  id?: string;
  label?: string;
  address?: string;
  addressDetails?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  isDefault?: boolean;
  serviceArea?: Record<string, unknown> | null;
  lastUsedAt?: Date | string | null;
}) {
  return {
    id: String(location._id ?? location.id ?? ""),
    label: location.label ?? "",
    address: location.address ?? "",
    addressDetails: location.addressDetails ?? "",
    latitude: location.latitude ?? 0,
    longitude: location.longitude ?? 0,
    source:
      location.source === "gps" ||
      location.source === "manual" ||
      location.source === "saved"
        ? location.source
        : "saved",
    isDefault: Boolean(location.isDefault),
    serviceArea: mapSavedLocationServiceArea(location.serviceArea),
    lastUsedAt: location.lastUsedAt
      ? new Date(location.lastUsedAt).toISOString()
      : null,
  };
}

function mapSavedLocationServiceArea(serviceArea?: Record<string, unknown> | null) {
  const zoneId =
    typeof serviceArea?.zoneId === "string" ? serviceArea.zoneId.trim() : "";
  const districtId =
    typeof serviceArea?.districtId === "string"
      ? serviceArea.districtId.trim()
      : "";
  if (!zoneId && !districtId) return null;
  return {
    districtId,
    districtName:
      typeof serviceArea?.districtName === "string"
        ? serviceArea.districtName.trim()
        : "",
    zoneId,
    zoneSlug:
      typeof serviceArea?.zoneSlug === "string"
        ? serviceArea.zoneSlug.trim()
        : "",
    zoneName:
      typeof serviceArea?.zoneName === "string"
        ? serviceArea.zoneName.trim()
        : "",
    radiusKm:
      typeof serviceArea?.radiusKm === "number" &&
      Number.isFinite(serviceArea.radiusKm)
        ? serviceArea.radiusKm
        : null,
  };
}

function serviceAreaComparisonKey(serviceArea?: Record<string, unknown> | null) {
  const mapped = mapSavedLocationServiceArea(serviceArea);
  if (!mapped) return "";
  return [
    mapped.districtId,
    mapped.zoneId,
    mapped.zoneSlug,
    mapped.zoneName,
    mapped.radiusKm ?? "",
  ].join(":");
}

function getLocationCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type CustomerCurrentLocationInput = {
  label?: string;
  address?: string;
  addressDetails?: string;
  latitude?: number | null;
  longitude?: number | null;
  source?: "gps" | "manual" | "saved";
  serviceArea?: Record<string, unknown> | null;
} | null | undefined;

async function resolveSavedLocationServiceArea(location: {
  latitude?: number | null;
  longitude?: number | null;
  serviceArea?: Record<string, unknown> | null;
}) {
  const existing = mapSavedLocationServiceArea(location.serviceArea);
  if (!isServiceAreaModeEnabled()) return existing;

  const latitude = getLocationCoordinate(location.latitude);
  const longitude = getLocationCoordinate(location.longitude);
  if (latitude === null || longitude === null) return existing;

  const resolved = await resolveServiceZoneForCoordinates({ latitude, longitude });
  return mapSavedLocationServiceArea(
    (resolved?.snapshot ?? null) as Record<string, unknown> | null,
  );
}

async function applyCustomerCurrentLocationSnapshot(
  customer: Record<string, any>,
  location: CustomerCurrentLocationInput,
) {
  if (!location) return;

  const latitude = getLocationCoordinate(location.latitude);
  const longitude = getLocationCoordinate(location.longitude);
  const serviceArea = await resolveSavedLocationServiceArea({
    latitude,
    longitude,
    serviceArea: location.serviceArea,
  });

  if (serviceArea) {
    customer.serviceArea = serviceArea;
  }

  if (latitude !== null && longitude !== null) {
    customer.lastKnownLocation = {
      label: location.label?.trim() || "Selected location",
      address: location.address?.trim() || "",
      addressDetails: location.addressDetails?.trim() || "",
      latitude,
      longitude,
      source: location.source ?? "manual",
      updatedAt: new Date(),
    };
  }
}

function applyCustomerPrimarySavedLocationSnapshot(
  customer: Record<string, any>,
  location: Record<string, any> | null | undefined,
) {
  if (!location) return;

  const serviceArea = mapSavedLocationServiceArea(location.serviceArea);
  if (serviceArea) {
    customer.serviceArea = serviceArea;
  }

  const latitude = getLocationCoordinate(location.latitude);
  const longitude = getLocationCoordinate(location.longitude);
  if (latitude !== null && longitude !== null) {
    customer.lastKnownLocation = {
      label: String(location.label ?? "Selected location").trim(),
      address: String(location.address ?? "").trim(),
      addressDetails: String(location.addressDetails ?? "").trim(),
      latitude,
      longitude,
      source:
        location.source === "gps" ||
        location.source === "manual" ||
        location.source === "saved"
          ? location.source
          : "saved",
      updatedAt: new Date(),
    };
  }
}

async function refreshSavedLocationServiceAreas<
  T extends {
    latitude?: number;
    longitude?: number;
    serviceArea?: Record<string, unknown> | null;
  },
>(locations: T[]) {
  return Promise.all(
    locations.map(async (location) => ({
      ...location,
      serviceArea: await resolveSavedLocationServiceArea(location),
    })),
  );
}

async function createCustomerRefreshSession(params: {
  customerId: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({
    subject: params.customerId,
    role: "customer",
    tokenId,
  });

  const tokenHash = await hashPassword(refreshToken);

  await CustomerRefreshTokenSessionModel.create({
    customerId: params.customerId,
    tokenId,
    tokenHash,
    userAgent: params.userAgent ?? "",
    ipAddress: params.ipAddress ?? "",
    expiresAt: new Date(
      Date.now() + CUSTOMER_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ),
  });

  return { refreshToken, tokenId };
}

function normalizeCustomerEmail(email?: string) {
  return email?.trim().toLowerCase() ?? "";
}

function validateCustomerPassword(password?: string) {
  const normalizedPassword = password?.trim() ?? "";

  if (normalizedPassword.length < CUSTOMER_PASSWORD_MIN_LENGTH) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PASSWORD_TOO_SHORT",
      `Use at least ${CUSTOMER_PASSWORD_MIN_LENGTH} characters for your password`,
    );
  }

  return normalizedPassword;
}

function customerHasPassword(customer: { passwordHash?: string | null }) {
  return Boolean(customer.passwordHash?.trim());
}

async function getPaymentMethodSettings() {
  const content = await getPlatformContent();
  const payments = content.operations?.payments ?? {};

  return {
    cashOnDeliveryEnabled: true,
    bkashEnabled: payments.bkashEnabled === true,
    bkashRefundEtaMinutes:
      typeof payments.bkashRefundEtaMinutes === "number"
        ? Math.max(1, Math.min(24 * 60, Math.round(payments.bkashRefundEtaMinutes)))
        : 60,
  };
}

function buildOwnerFacingOrderPayload(
  order: Record<string, any>,
  platformContent: Awaited<ReturnType<typeof getPlatformContent>>,
) {
  const ownerOrder = decorateOwnerFinancials(order);

  if (platformContent.operations?.ownerApp?.showCustomerPhoneNumbers !== false) {
    return ownerOrder;
  }

  return {
    ...ownerOrder,
    customerSnapshot: {
      ...(ownerOrder.customerSnapshot ?? {}),
      phone: "",
    },
  };
}

function safeStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function startCustomerPhoneSignin(
  phone: string,
  context?: { userAgent?: string; ipAddress?: string; useOtp?: boolean },
) {
  await ensureCustomerIdentityBackfill();
  const customer = await CustomerModel.findOne({ phone });

  if (customer) {
    assertCustomerAccountAccessible(customer);

    if (customerHasPassword(customer) && !context?.useOtp) {
      return {
        flow: "password" as const,
        phone,
        customer: {
          fullName: customer.fullName ?? "",
          email: customer.email ?? "",
        },
      };
    }
  }

  const otpSession = await createOtpSession({
    phone,
    purpose: "customer_phone_signin",
    referenceId: phone,
    userAgent: context?.userAgent,
    ipAddress: context?.ipAddress,
  });

  return {
    flow: "otp" as const,
    phone,
    verificationSessionId: otpSession.id,
    ...getOtpSessionTiming(otpSession),
    customer: customer
      ? {
          fullName: customer.fullName ?? "",
          email: customer.email ?? "",
        }
      : null,
  };
}

export async function signinCustomerWithPassword(params: {
  phone: string;
  password: string;
  installId?: string;
  currentLocation?: CustomerCurrentLocationInput;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  const customer = await CustomerModel.findOne({ phone: params.phone });

  if (!customer || !customer.passwordHash?.trim()) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_CREDENTIALS",
      "This phone number or password is incorrect",
    );
  }

  assertCustomerAccountAccessible(customer);

  const isPasswordValid = await comparePassword(
    params.password,
    customer.passwordHash,
  );

  if (!isPasswordValid) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_CREDENTIALS",
      "This phone number or password is incorrect",
    );
  }

  if (!customer.referralCode) {
    customer.referralCode = await createCustomerReferralCode();
  }

  customer.lastLoginAt = new Date();
  rememberCustomerSigninContext(customer, params);
  await applyCustomerCurrentLocationSnapshot(customer, params.currentLocation);
  await customer.save();

  const refreshSession = await createCustomerRefreshSession({
    customerId: customer.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return buildCustomerAuthPayload({
    customerId: customer.id,
    fullName: customer.fullName,
    phone: customer.phone ?? undefined,
    email: customer.email ?? undefined,
    referralCode: customer.referralCode ?? "",
    hasPassword: customerHasPassword(customer),
    profileImage: customer.profileImage,
    previousPhones: customer.previousPhones,
    notificationSettings: customer.notificationSettings,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId,
  });
}

export async function requestCustomerPasswordReset(params: {
  phone: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  const customer = await CustomerModel.findOne({ phone: params.phone });

  if (!customer || !customer.passwordHash?.trim()) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer account not found for this phone number",
    );
  }

  assertCustomerAccountAccessible(customer);

  const otpSession = await createOtpSession({
    phone: params.phone,
    purpose: "customer_password_reset",
    referenceId: customer.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return {
    verificationSessionId: otpSession.id,
    phone: otpSession.phone,
    ...getOtpSessionTiming(otpSession),
  };
}

export async function verifyCustomerPasswordResetOtp(params: {
  verificationSessionId: string;
  otpCode: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  const otpSession = await OtpSessionModel.findById(
    params.verificationSessionId,
  );

  if (!otpSession || otpSession.purpose !== "customer_password_reset") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESET_SESSION_NOT_FOUND",
      "Password reset session not found",
    );
  }

  if (otpSession.status !== "pending") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_NOT_ACTIVE",
      "OTP session is not active",
    );
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired";
    await otpSession.save();
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_EXPIRED",
      "OTP has expired",
    );
  }

  await assertOtpVerificationAllowed(otpSession, params);
  const isOtpValid = await compareOtpCode(
    params.otpCode,
    otpSession.otpCodeHash,
  );

  if (!isOtpValid) {
    await rejectInvalidOtpAttempt(otpSession, params);
  }

  otpSession.status = "verified";
  otpSession.verifiedAt = new Date();
  await recordOtpVerificationSuccess(otpSession, params);
  await otpSession.save();

  return {
    verificationSessionId: otpSession.id,
    phone: otpSession.phone,
    expiresInSeconds: Math.max(
      0,
      Math.floor((otpSession.expiresAt.getTime() - Date.now()) / 1000),
    ),
  };
}

export async function resetCustomerPassword(params: {
  verificationSessionId: string;
  newPassword: string;
}) {
  await ensureCustomerIdentityBackfill();
  const otpSession = await OtpSessionModel.findById(
    params.verificationSessionId,
  );

  if (!otpSession || otpSession.purpose !== "customer_password_reset") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESET_SESSION_NOT_FOUND",
      "Password reset session not found",
    );
  }

  if (otpSession.status !== "verified") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESET_SESSION_NOT_VERIFIED",
      "Verify OTP before resetting the password",
    );
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired";
    await otpSession.save();
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_EXPIRED",
      "OTP has expired",
    );
  }

  const customer = await CustomerModel.findById(otpSession.referenceId);

  if (!customer || customer.phone !== otpSession.phone) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer account not found",
    );
  }

  assertCustomerAccountAccessible(customer);

  const password = validateCustomerPassword(params.newPassword);
  customer.passwordHash = await hashPassword(password);

  if (!customer.authProviders.includes("phone")) {
    customer.authProviders = [...customer.authProviders, "phone"];
  }

  await customer.save();
  await CustomerRefreshTokenSessionModel.updateMany(
    { customerId: customer._id, revokedAt: null },
    { revokedAt: new Date() },
  );

  otpSession.status = "consumed";
  await otpSession.save();

  return { reset: true, phone: customer.phone ?? "" };
}

export async function verifyCustomerPhoneOtp(params: {
  verificationSessionId: string;
  otpCode: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  const otpSession = await OtpSessionModel.findById(
    params.verificationSessionId,
  );

  if (!otpSession || otpSession.purpose !== "customer_phone_signin") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OTP_SESSION_NOT_FOUND",
      "Verification session not found",
    );
  }

  if (otpSession.status !== "pending") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_NOT_ACTIVE",
      "OTP session is not active",
    );
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired";
    await otpSession.save();
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_EXPIRED",
      "OTP has expired",
    );
  }

  await assertOtpVerificationAllowed(otpSession, params);
  const isOtpValid = await compareOtpCode(
    params.otpCode,
    otpSession.otpCodeHash,
  );

  if (!isOtpValid) {
    await rejectInvalidOtpAttempt(otpSession, params);
  }

  otpSession.status = "verified";
  otpSession.verifiedAt = new Date();
  await recordOtpVerificationSuccess(otpSession, params);
  await otpSession.save();

  return {
    verificationSessionId: otpSession.id,
    phone: otpSession.phone,
    expiresInSeconds: Math.max(
      0,
      Math.floor((otpSession.expiresAt.getTime() - Date.now()) / 1000),
    ),
  };
}

export async function verifyCustomerPhoneSignin(params: {
  verificationSessionId: string;
  fullName?: string;
  email?: string;
  password?: string;
  referralCode?: string;
  installId?: string;
  currentLocation?: CustomerCurrentLocationInput;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  const otpSession = await OtpSessionModel.findById(
    params.verificationSessionId,
  );

  if (!otpSession || otpSession.purpose !== "customer_phone_signin") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OTP_SESSION_NOT_FOUND",
      "Verification session not found",
    );
  }

  if (otpSession.status !== "verified") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_NOT_VERIFIED",
      "Verify the OTP first before finishing registration",
    );
  }

  let customer = await CustomerModel.findOne({ phone: otpSession.phone });
  const normalizedFullName = params.fullName?.trim() ?? "";
  const normalizedEmail = normalizeCustomerEmail(params.email);
  const normalizedPassword = params.password?.trim() ?? "";

  if (!customer) {
    customer = new CustomerModel({
      fullName: normalizedFullName || DEFAULT_CUSTOMER_FULL_NAME,
      phone: otpSession.phone,
      email: normalizedEmail,
      passwordHash: normalizedPassword
        ? await hashPassword(validateCustomerPassword(normalizedPassword))
        : "",
      referralCode: await createCustomerReferralCode(),
      authProviders: ["phone"],
    });
    await attachReferralToNewCustomer({
      customer,
      referralCode: params.referralCode,
      installId: params.installId,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
    });
    rememberCustomerSigninContext(customer, params);
    await applyCustomerCurrentLocationSnapshot(customer, params.currentLocation);
    await customer.save();
  } else {
    assertCustomerAccountAccessible(customer);

    if (!customer.fullName?.trim()) {
      customer.fullName = normalizedFullName || DEFAULT_CUSTOMER_FULL_NAME;
    } else if (normalizedFullName) {
      customer.fullName =
        normalizedFullName || customer.fullName || DEFAULT_CUSTOMER_FULL_NAME;
    }

    if (normalizedEmail) {
      customer.email = normalizedEmail;
    }

    if (!customerHasPassword(customer) && normalizedPassword) {
      customer.passwordHash = await hashPassword(
        validateCustomerPassword(normalizedPassword),
      );
    }

    if (!customer.authProviders.includes("phone")) {
      customer.authProviders = [...customer.authProviders, "phone"];
    }

    if (!customer.referralCode) {
      customer.referralCode = await createCustomerReferralCode();
    }

    rememberCustomerSigninContext(customer, params);
    await applyCustomerCurrentLocationSnapshot(customer, params.currentLocation);
    await customer.save();
  }

  assertCustomerAccountAccessible(customer);

  customer.lastLoginAt = new Date();
  await customer.save();

  otpSession.status = "consumed";
  await otpSession.save();

  const refreshSession = await createCustomerRefreshSession({
    customerId: customer.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return buildCustomerAuthPayload({
    customerId: customer.id,
    fullName: customer.fullName,
    phone: customer.phone ?? undefined,
    email: customer.email ?? undefined,
    referralCode: customer.referralCode ?? "",
    hasPassword: customerHasPassword(customer),
    profileImage: customer.profileImage,
    previousPhones: customer.previousPhones,
    notificationSettings: customer.notificationSettings,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId,
  });
}

export async function signinCustomerWithGoogle(params: {
  googleSub: string;
  email: string;
  fullName: string;
  profileImage?: { url?: string; publicId?: string };
  currentLocation?: CustomerCurrentLocationInput;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  let customer = await CustomerModel.findOne({ googleSub: params.googleSub });

  if (!customer) {
    customer = await CustomerModel.create({
      googleSub: params.googleSub,
      email: params.email,
      fullName: params.fullName,
      profileImage: params.profileImage ?? { url: "", publicId: "" },
      referralCode: await createCustomerReferralCode(),
      authProviders: ["google"],
    });
    await applyCustomerCurrentLocationSnapshot(customer, params.currentLocation);
    await customer.save();
  } else {
    assertCustomerAccountAccessible(customer);
    customer.email = params.email;
    customer.fullName = params.fullName;
    customer.profileImage = {
      ...(customer.profileImage ?? { url: "", publicId: "" }),
      ...(params.profileImage ?? {}),
    };
    if (!customer.authProviders.includes("google")) {
      customer.authProviders = [...customer.authProviders, "google"];
    }
    if (!customer.referralCode) {
      customer.referralCode = await createCustomerReferralCode();
    }
    await applyCustomerCurrentLocationSnapshot(customer, params.currentLocation);
    await customer.save();
  }

  assertCustomerAccountAccessible(customer);

  customer.lastLoginAt = new Date();
  await customer.save();

  const refreshSession = await createCustomerRefreshSession({
    customerId: customer.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return buildCustomerAuthPayload({
    customerId: customer.id,
    fullName: customer.fullName,
    phone: customer.phone ?? undefined,
    email: customer.email ?? undefined,
    referralCode: customer.referralCode ?? "",
    hasPassword: customerHasPassword(customer),
    profileImage: customer.profileImage,
    previousPhones: customer.previousPhones,
    notificationSettings: customer.notificationSettings,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId,
  });
}

export async function refreshCustomerSession(params: {
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  const payload = verifyRefreshToken(params.refreshToken);

  if (!payload.tokenId) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_REFRESH_TOKEN",
      "Invalid refresh token",
    );
  }

  const session = await CustomerRefreshTokenSessionModel.findOne({
    tokenId: payload.tokenId,
    customerId: payload.sub,
  });

  if (!session || session.revokedAt) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "SESSION_REVOKED",
      "Refresh session is not active",
    );
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "SESSION_EXPIRED",
      "Refresh session has expired",
    );
  }

  const isValid = await comparePassword(params.refreshToken, session.tokenHash);

  if (!isValid) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "INVALID_REFRESH_TOKEN",
      "Invalid refresh token",
    );
  }

  const customer = await CustomerModel.findById(payload.sub);

  if (!customer) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer not found",
    );
  }

  assertCustomerAccountAccessible(customer);

  session.revokedAt = new Date();
  await session.save();

  const refreshSession = await createCustomerRefreshSession({
    customerId: customer.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return buildCustomerAuthPayload({
    customerId: customer.id,
    fullName: customer.fullName,
    phone: customer.phone ?? undefined,
    email: customer.email ?? undefined,
    referralCode: customer.referralCode ?? "",
    hasPassword: customerHasPassword(customer),
    profileImage: customer.profileImage,
    previousPhones: customer.previousPhones,
    notificationSettings: customer.notificationSettings,
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId,
  });
}

export async function startCustomerPhoneChange(params: {
  customerId: string;
  phone: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  const customerId = ensureCustomerIdentity(params.customerId);
  const customer = await getCustomerById(customerId);
  const nextPhone = params.phone.trim();

  if (!/^01\d{9}$/.test(nextPhone)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_PHONE",
      "Enter a valid phone number",
    );
  }

  if (customer.phone === nextPhone) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PHONE_UNCHANGED",
      "Enter a different phone number to continue",
    );
  }

  const existingCustomer = await CustomerModel.findOne({
    _id: { $ne: customer._id },
    $or: [{ phone: nextPhone }, { pendingPhone: nextPhone }],
  });

  if (existingCustomer) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "PHONE_ALREADY_IN_USE",
      "An account already exists with this phone number",
    );
  }

  customer.pendingPhone = nextPhone;
  await customer.save();

  const otpSession = await createOtpSession({
    phone: nextPhone,
    purpose: "customer_phone_change",
    referenceId: customer.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return {
    verificationSessionId: otpSession.id,
    ...getOtpSessionTiming(otpSession),
  };
}

export async function verifyCustomerPhoneChange(params: {
  customerId: string;
  verificationSessionId: string;
  otpCode: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  await ensureCustomerIdentityBackfill();
  const customerId = ensureCustomerIdentity(params.customerId);
  const customer = await getCustomerById(customerId);
  const otpSession = await OtpSessionModel.findById(
    params.verificationSessionId,
  );

  if (!otpSession || otpSession.purpose !== "customer_phone_change") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OTP_SESSION_NOT_FOUND",
      "Verification session not found",
    );
  }

  if (otpSession.referenceId !== customer.id) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "OTP_SESSION_MISMATCH",
      "This verification session does not belong to your account",
    );
  }

  if (otpSession.status !== "pending") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_NOT_ACTIVE",
      "OTP session is not active",
    );
  }

  if (otpSession.expiresAt.getTime() < Date.now()) {
    otpSession.status = "expired";
    await otpSession.save();
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "OTP_EXPIRED",
      "OTP has expired",
    );
  }

  await assertOtpVerificationAllowed(otpSession, params);
  const isOtpValid = await compareOtpCode(
    params.otpCode,
    otpSession.otpCodeHash,
  );

  if (!isOtpValid) {
    await rejectInvalidOtpAttempt(otpSession, params);
  }

  if (customer.pendingPhone !== otpSession.phone) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PHONE_CHANGE_MISMATCH",
      "Pending phone number does not match verification request",
    );
  }

  const existingCustomer = await CustomerModel.findOne({
    _id: { $ne: customer._id },
    phone: otpSession.phone,
  });

  if (existingCustomer) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "PHONE_ALREADY_IN_USE",
      "An account already exists with this phone number",
    );
  }

  if (customer.phone) {
    customer.set("previousPhones", [
      {
        phone: customer.phone,
        changedAt: new Date(),
      },
      ...(customer.previousPhones ?? [])
        .filter((entry) => entry.phone !== customer.phone)
        .slice(0, 9),
    ]);
  }

  customer.phone = otpSession.phone;
  customer.pendingPhone = null;
  await customer.save();

  otpSession.status = "consumed";
  otpSession.verifiedAt = new Date();
  await recordOtpVerificationSuccess(otpSession, params);
  await otpSession.save();

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      referralCode: customer.referralCode ?? "",
      hasPassword: customerHasPassword(customer),
      profileImage: customer.profileImage ?? { url: "", publicId: "" },
      previousPhones: (customer.previousPhones ?? []).map((entry) => ({
        phone: entry.phone ?? "",
        changedAt: entry.changedAt
          ? new Date(entry.changedAt).toISOString()
          : null,
      })),
      notificationSettings: {
        orderUpdates: customer.notificationSettings?.orderUpdates ?? true,
        restaurantStatus:
          customer.notificationSettings?.restaurantStatus ?? true,
        reviewReplies: customer.notificationSettings?.reviewReplies ?? true,
        promotions: customer.notificationSettings?.promotions ?? true,
      },
    },
  };
}

export async function updateCustomerProfile(params: {
  customerId: string;
  fullName?: string;
  email?: string;
  profileImage?: { url?: string; publicId?: string };
  notificationSettings?: {
    orderUpdates?: boolean;
    restaurantStatus?: boolean;
    reviewReplies?: boolean;
    promotions?: boolean;
  };
}) {
  const customerId = ensureCustomerIdentity(params.customerId);
  const customer = await getCustomerById(customerId);

  if (params.fullName !== undefined) {
    customer.fullName = params.fullName.trim();
  }

  if (params.email !== undefined) {
    customer.email = normalizeCustomerEmail(params.email);
  }

  if (params.profileImage !== undefined) {
    customer.profileImage = {
      ...(customer.profileImage ?? { url: "", publicId: "" }),
      ...params.profileImage,
    };
  }

  if (params.notificationSettings !== undefined) {
    customer.notificationSettings = {
      ...(customer.notificationSettings ?? {
        orderUpdates: true,
        restaurantStatus: true,
        reviewReplies: true,
      }),
      ...params.notificationSettings,
    };
  }

  if (!customer.referralCode) {
    customer.referralCode = await createCustomerReferralCode();
  }

  await customer.save();

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      referralCode: customer.referralCode ?? "",
      hasPassword: customerHasPassword(customer),
      profileImage: customer.profileImage ?? { url: "", publicId: "" },
      previousPhones: (customer.previousPhones ?? []).map((entry) => ({
        phone: entry.phone ?? "",
        changedAt: entry.changedAt
          ? new Date(entry.changedAt).toISOString()
          : null,
      })),
      notificationSettings: {
        orderUpdates: customer.notificationSettings?.orderUpdates ?? true,
        restaurantStatus:
          customer.notificationSettings?.restaurantStatus ?? true,
        reviewReplies: customer.notificationSettings?.reviewReplies ?? true,
        promotions: customer.notificationSettings?.promotions ?? true,
      },
    },
  };
}

export async function updateCustomerPassword(params: {
  customerId: string;
  currentPassword?: string;
  newPassword: string;
}) {
  const customerId = ensureCustomerIdentity(params.customerId);
  const customer = await getCustomerById(customerId);
  const nextPassword = validateCustomerPassword(params.newPassword);

  if (customerHasPassword(customer)) {
    const currentPassword = params.currentPassword?.trim() ?? "";

    if (!currentPassword) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "CURRENT_PASSWORD_REQUIRED",
        "Enter your current password",
      );
    }

    const isCurrentPasswordValid = await comparePassword(
      currentPassword,
      customer.passwordHash ?? "",
    );

    if (!isCurrentPasswordValid) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "INVALID_CURRENT_PASSWORD",
        "Current password is incorrect",
      );
    }
  }

  customer.passwordHash = await hashPassword(nextPassword);
  await customer.save();

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      referralCode: customer.referralCode ?? "",
      hasPassword: customerHasPassword(customer),
      profileImage: customer.profileImage ?? { url: "", publicId: "" },
      previousPhones: (customer.previousPhones ?? []).map((entry) => ({
        phone: entry.phone ?? "",
        changedAt: entry.changedAt
          ? new Date(entry.changedAt).toISOString()
          : null,
      })),
      notificationSettings: {
        orderUpdates: customer.notificationSettings?.orderUpdates ?? true,
        restaurantStatus:
          customer.notificationSettings?.restaurantStatus ?? true,
        reviewReplies: customer.notificationSettings?.reviewReplies ?? true,
        promotions: customer.notificationSettings?.promotions ?? true,
      },
    },
  };
}

export async function getCustomerProfile(customerId: string) {
  const customer = await getCustomerById(ensureCustomerIdentity(customerId));
  const referralCode = await ensureCustomerReferralCode(customer);

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      referralCode,
      hasPassword: customerHasPassword(customer),
      profileImage: customer.profileImage ?? { url: "", publicId: "" },
      previousPhones: (customer.previousPhones ?? []).map((entry) => ({
        phone: entry.phone ?? "",
        changedAt: entry.changedAt
          ? new Date(entry.changedAt).toISOString()
          : null,
      })),
      notificationSettings: {
        orderUpdates: customer.notificationSettings?.orderUpdates ?? true,
        restaurantStatus:
          customer.notificationSettings?.restaurantStatus ?? true,
        reviewReplies: customer.notificationSettings?.reviewReplies ?? true,
        promotions: customer.notificationSettings?.promotions ?? true,
      },
    },
  };
}

export async function logoutCustomerSession(
  refreshToken: string,
  options?: { expoPushToken?: string },
) {
  const payload = verifyRefreshToken(refreshToken);
  const signedOutAt = new Date();
  let pushTokenRemoved = false;

  if (options?.expoPushToken && payload.sub) {
    const pushTokenResult = await CustomerModel.updateOne(
      {
        _id: payload.sub,
        "pushTokens.expoPushToken": options.expoPushToken,
      },
      {
        $set: {
          "pushTokens.$.disabledAt": signedOutAt,
          "pushTokens.$.lastSeenAt": signedOutAt,
        },
      },
    );
    pushTokenRemoved = pushTokenResult.modifiedCount > 0;
  }

  if (!payload.tokenId) {
    return { revoked: true, pushTokenRemoved };
  }

  await CustomerRefreshTokenSessionModel.findOneAndUpdate(
    { tokenId: payload.tokenId, customerId: payload.sub, revokedAt: null },
    { revokedAt: signedOutAt },
  );

  return { revoked: true, pushTokenRemoved };
}


function getDiscoverableRestaurantQuery() {
  return {
    "runtime.isVisible": true,
    $or: [
      { "enforcement.status": { $exists: false } },
      { "enforcement.status": { $in: ["active", "under_review"] } },
      { "enforcement.expiresAt": { $lte: new Date() } },
    ],
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDiscoverySearchText(value?: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, " ")
    .trim();
}

function tokenizeDiscoverySearch(value?: string) {
  return normalizeDiscoverySearchText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 6);
}

function getLevenshteinDistanceWithin(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    let rowMin = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
      rowMin = Math.min(rowMin, current[rightIndex]);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function isDiscoverySearchMatch(queryTokens: string[], values: unknown[]) {
  const haystack = tokenizeDiscoverySearch(values.filter(Boolean).join(" "));
  if (!queryTokens.length || !haystack.length) return false;

  return queryTokens.every((queryToken) =>
    haystack.some((word) => {
      if (word.includes(queryToken) || queryToken.includes(word)) return true;
      if (queryToken.length < 4 || word.length < 4) return false;
      return getLevenshteinDistanceWithin(queryToken, word, 1) <= 1;
    }),
  );
}

async function findSearchMatchedRestaurantIds(search?: string) {
  const tokens = tokenizeDiscoverySearch(search);
  if (!tokens.length) return null;

  const exactRegexes = tokens.map((token) => new RegExp(escapeRegex(token), "i"));
  const [restaurantRows, categoryRows, menuRows] = await Promise.all([
    RestaurantModel.find(
      {
        ...getDiscoverableRestaurantQuery(),
        $or: exactRegexes.flatMap((regex) => [
          { name: regex },
          { description: regex },
          { cuisineTypes: regex },
          { tags: regex },
        ]),
      },
      { _id: 1 },
    ).lean(),
    CategoryModel.find(
      {
        status: "active",
        $or: exactRegexes.flatMap((regex) => [{ name: regex }, { description: regex }]),
      },
      { restaurantId: 1 },
    ).lean(),
    MenuItemModel.find(
      {
        status: "active",
        $or: exactRegexes.flatMap((regex) => [{ name: regex }, { description: regex }]),
      },
      { restaurantId: 1 },
    ).lean(),
  ]);

  const matchedIds = new Set<string>();
  restaurantRows.forEach((restaurant) => matchedIds.add(String(restaurant._id)));
  categoryRows.forEach((category) => matchedIds.add(String(category.restaurantId)));
  menuRows.forEach((item) => matchedIds.add(String(item.restaurantId)));

  if (tokens.some((token) => token.length >= 4)) {
    const [fuzzyRestaurants, fuzzyCategories, fuzzyItems] = await Promise.all([
      RestaurantModel.find(getDiscoverableRestaurantQuery(), {
        _id: 1,
        name: 1,
        description: 1,
        cuisineTypes: 1,
        tags: 1,
      })
        .limit(300)
        .lean(),
      CategoryModel.find(
        { status: "active" },
        { restaurantId: 1, name: 1, description: 1 },
      )
        .limit(1200)
        .lean(),
      MenuItemModel.find(
        { status: "active" },
        { restaurantId: 1, name: 1, description: 1, tags: 1 },
      )
        .limit(3000)
        .lean(),
    ]);

    fuzzyRestaurants.forEach((restaurant) => {
      if (
        isDiscoverySearchMatch(tokens, [
          restaurant.name,
          restaurant.description,
          ...(restaurant.cuisineTypes ?? []),
          ...(restaurant.tags ?? []),
        ])
      ) {
        matchedIds.add(String(restaurant._id));
      }
    });
    fuzzyCategories.forEach((category) => {
      if (isDiscoverySearchMatch(tokens, [category.name, category.description])) {
        matchedIds.add(String(category.restaurantId));
      }
    });
    fuzzyItems.forEach((item) => {
      const itemTags = Array.isArray((item as any).tags)
        ? ((item as any).tags as string[])
        : [];
      if (isDiscoverySearchMatch(tokens, [item.name, item.description, ...itemTags])) {
        matchedIds.add(String(item.restaurantId));
      }
    });
  }

  return [...matchedIds].filter((id) => mongoose.Types.ObjectId.isValid(id));
}

async function enrichRestaurantDiscoveryRows<T extends Record<string, any>>(
  restaurants: T[],
) {
  const restaurantObjectIds = restaurants
    .map((restaurant) => String(restaurant._id ?? ""))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!restaurantObjectIds.length) {
    return restaurants;
  }

  const [pricingRows, reviewRows] = await Promise.all([
    MenuItemModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      lowestMenuPrice: number | null;
    }>([
      {
        $match: {
          restaurantId: { $in: restaurantObjectIds },
          status: "active",
          availability: "available",
        },
      },
      {
        $group: {
          _id: "$restaurantId",
          lowestMenuPrice: { $min: "$basePrice" },
        },
      },
    ]),
    ReviewModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      avgRating: number | null;
      reviewCount: number;
    }>([
      {
        $match: {
          restaurantId: { $in: restaurantObjectIds },
          moderationStatus: "visible",
          isHidden: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$restaurantId",
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const pricingByRestaurantId = new Map(
    pricingRows.map((row) => [String(row._id), row.lowestMenuPrice ?? null]),
  );
  const reviewsByRestaurantId = new Map(
    reviewRows.map((row) => [
      String(row._id),
      {
        avgRating:
          row.reviewCount > 0 && typeof row.avgRating === "number"
            ? Math.round(row.avgRating * 10) / 10
            : null,
        reviewCount: row.reviewCount ?? 0,
      },
    ]),
  );

  restaurants.forEach((restaurant) => {
    const mutableRestaurant = restaurant as Record<string, any>;
    const restaurantId = String(mutableRestaurant._id ?? "");
    const reviewMetrics = reviewsByRestaurantId.get(restaurantId);
    mutableRestaurant.lowestMenuPrice =
      pricingByRestaurantId.get(restaurantId) ?? null;
    mutableRestaurant.reviewCount = reviewMetrics?.reviewCount ?? 0;
    mutableRestaurant.avgRating = reviewMetrics?.avgRating ?? null;
  });

  return restaurants;
}


function getOrderDeliveryCoordinate(order: Record<string, any>) {
  const deliveryAddress = order.customerSnapshot?.deliveryAddress;
  if (
    typeof deliveryAddress?.latitude !== "number" ||
    typeof deliveryAddress?.longitude !== "number"
  ) {
    return null;
  }

  return {
    latitude: deliveryAddress.latitude,
    longitude: deliveryAddress.longitude,
  };
}

function estimateQueueTravelMinutes(
  fromOrder: Record<string, any>,
  toOrder: Record<string, any>,
) {
  const fromCoordinate = getOrderDeliveryCoordinate(fromOrder);
  const toCoordinate = getOrderDeliveryCoordinate(toOrder);

  if (!fromCoordinate || !toCoordinate) {
    return null;
  }

  const directDistanceKm = calculateDistanceKm(
    fromCoordinate.latitude,
    fromCoordinate.longitude,
    toCoordinate.latitude,
    toCoordinate.longitude,
  );
  const routeDistanceKm = directDistanceKm * QUEUED_DELIVERY_ROUTE_FACTOR;
  return Math.max(
    1,
    Math.round((routeDistanceKm / QUEUED_DELIVERY_SPEED_KMPH) * 60),
  );
}

async function buildQueuedDeliveryTrackingMeta(orderObject: Record<string, any>) {
  const riderTracking = orderObject.riderTracking ?? {};
  const riderId = orderObject.riderId;
  const orderId = String(orderObject._id ?? "");

  if (
    orderObject.status !== "PickedUp" ||
    riderTracking.isFocused !== false ||
    !riderId ||
    !orderId
  ) {
    return {};
  }

  const rider = await RiderModel.findById(riderId)
    .select("activeTrackingOrderId")
    .lean();
  const activeTrackingOrderId = String(rider?.activeTrackingOrderId ?? "");

  if (!activeTrackingOrderId || activeTrackingOrderId === orderId) {
    return {};
  }

  const pickedUpOrders = await OrderModel.find({
    riderId,
    status: "PickedUp",
  })
    .sort({ "timestamps.PickedUp": 1, createdAt: 1 })
    .select(
      "_id customerSnapshot.deliveryAddress riderTracking.remainingDurationMinutes timestamps.PickedUp createdAt",
    )
    .lean();

  const activeOrder = pickedUpOrders.find(
    (queuedOrder) => String(queuedOrder._id ?? "") === activeTrackingOrderId,
  );

  if (!activeOrder) {
    return {};
  }

  const queuedSequence = [
    activeOrder,
    ...pickedUpOrders.filter(
      (queuedOrder) => String(queuedOrder._id ?? "") !== activeTrackingOrderId,
    ),
  ];
  const targetIndex = queuedSequence.findIndex(
    (queuedOrder) => String(queuedOrder._id ?? "") === orderId,
  );

  if (targetIndex <= 0) {
    return {};
  }

  const activeRemainingMinutes = Number(
    (activeOrder.riderTracking as Record<string, any> | undefined)
      ?.remainingDurationMinutes,
  );

  if (!Number.isFinite(activeRemainingMinutes)) {
    return { queuePosition: targetIndex };
  }

  let queueEtaMinutes = Math.max(0, activeRemainingMinutes);
  for (let index = 1; index <= targetIndex; index += 1) {
    const travelMinutes = estimateQueueTravelMinutes(
      queuedSequence[index - 1] as Record<string, any>,
      queuedSequence[index] as Record<string, any>,
    );

    if (travelMinutes === null) {
      return { queuePosition: targetIndex };
    }

    queueEtaMinutes +=
      QUEUED_DELIVERY_DROPOFF_BUFFER_MINUTES + travelMinutes;
  }

  return {
    queueEtaMinutes: Math.max(1, Math.round(queueEtaMinutes)),
    queuePosition: targetIndex,
  };
}




export async function listDiscoverableRestaurants(params?: {
  search?: string;
  collectionKey?: string;
  restaurantIds?: string[];
  featuredOnly?: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}): Promise<DiscoverableRestaurantsResult> {
  await ensureRestaurantDiscoveryBackfill();
  return discoverableRestaurantsCache.getOrSet(
    buildDiscoverableRestaurantsCacheKey(params),
    async () => {
      const query: Record<string, unknown> = getDiscoverableRestaurantQuery();

      if (params?.collectionKey) {
        const collection = await RestaurantCollectionModel.findOne({
          key: params.collectionKey,
          isActive: true,
        });

        if (!collection) {
          return [];
        }

        query._id = { $in: collection.restaurantIds };
      }

      if (params?.restaurantIds?.length) {
        query._id = {
          $in: params.restaurantIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      if (params?.featuredOnly) {
        query["discovery.isFeatured"] = true;
      }

      const searchMatchedRestaurantIds = await findSearchMatchedRestaurantIds(
        params?.search,
      );
      if (searchMatchedRestaurantIds) {
        const existingIds = Array.isArray((query._id as any)?.$in)
          ? ((query._id as any).$in as mongoose.Types.ObjectId[]).map((id) =>
              id.toString(),
            )
          : null;
        const nextIds = existingIds
          ? searchMatchedRestaurantIds.filter((id) => existingIds.includes(id))
          : searchMatchedRestaurantIds;

        if (!nextIds.length) {
          return [];
        }

        query._id = {
          $in: nextIds.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }

      const latitude = params?.latitude;
      const longitude = params?.longitude;
      const hasCoordinates =
        typeof latitude === "number" && typeof longitude === "number";
      if (!hasCoordinates) {
        if (isServiceAreaModeEnabled()) {
          return [];
        }

        const restaurants = await RestaurantModel.aggregate([
          {
            $match: query,
          },
          {
            $addFields: {
              distanceKm: null,
              isOpen: {
                $ifNull: ["$runtime.isOnline", false],
              },
            },
          },
          {
            $sort: {
              isOpen: -1,
              "discovery.featuredSortOrder": 1,
              createdAt: -1,
            },
          },
        ]);

        return enrichRestaurantDiscoveryRows(restaurants);
      }

      const geoNearQuery = {
        ...query,
        locationPoint: { $ne: null },
      } as Record<string, unknown>;
      const platformContent = await getPlatformContent();
      const selectedServiceArea = await resolveServiceZoneForCoordinates({
        latitude,
        longitude,
      });
      if (isServiceAreaModeEnabled()) {
        if (!selectedServiceArea) {
          return [];
        }
      }
      const maxDistanceKm = isServiceAreaModeEnabled()
        ? getServiceAreaRestaurantDistanceKm(
            selectedServiceArea?.snapshot,
            platformContent.operations.serviceArea.radiusKm,
          )
        : Math.max(
            0,
            Math.min(
              typeof params?.radiusKm === "number"
                ? params.radiusKm
                : platformContent.operations.serviceArea.radiusKm,
              platformContent.operations.serviceArea.radiusKm,
            ),
          );

      const restaurants = await RestaurantModel.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            distanceField: "distanceMeters",
            maxDistance: maxDistanceKm * 1000,
            spherical: true,
            query: geoNearQuery,
          },
        },
        {
          $addFields: {
            distanceKm: {
              $cond: [
                { $lt: ["$distanceMeters", 100] },
                0,
                { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] },
              ],
            },
            isOpen: {
              $ifNull: ["$runtime.isOnline", false],
            },
          },
        },
        {
          $sort: {
            isOpen: -1,
            "discovery.featuredSortOrder": 1,
            distanceMeters: 1,
            createdAt: -1,
          },
        },
        {
          $project: {
            distanceMeters: 0,
          },
        },
      ]);

      const eligibleRestaurants =
        isServiceAreaModeEnabled() && selectedServiceArea?.snapshot
          ? restaurants.filter((restaurant) =>
              isCoordinateInsideServiceArea({
                latitude: restaurant.location?.latitude,
                longitude: restaurant.location?.longitude,
                serviceArea: selectedServiceArea.snapshot,
              }),
            )
          : restaurants;

      return enrichRestaurantDiscoveryRows(eligibleRestaurants);
    },
  );
}

async function getActiveOfferRestaurantIdSet() {
  const now = new Date();
  const offers = await VoucherModel.find({
    archivedAt: null,
    status: "Active",
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    // Exclude personal (selected_users) vouchers: a restaurant that only has a
    // voucher assigned to one customer must not be flagged as "has offers" for
    // everyone else.
    audienceType: { $ne: "selected_users" },
  })
    .select("restaurantId selectedRestaurantIds scopeType")
    .lean();
  const restaurantIds = new Set<string>();

  offers.forEach((offer) => {
    const scopedIds =
      (offer as any).scopeType === "selected_restaurants"
        ? ((offer as any).selectedRestaurantIds ?? [])
        : [offer.restaurantId];
    scopedIds.forEach((restaurantId: unknown) => {
      const id = restaurantId?.toString?.() ?? "";
      if (id) restaurantIds.add(id);
    });
  });

  return restaurantIds;
}

export async function listDiscoverableRestaurantsPage(params?: {
  search?: string;
  collectionKey?: string;
  restaurantIds?: string[];
  featuredOnly?: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  page?: number;
  pageSize?: number;
  filter?: "all" | "open" | "offers" | "featured";
  sortBy?: "nearest" | "fastest" | "topRated";
  minimumRating?: number;
  maximumLowestPrice?: number;
}): Promise<DiscoverableRestaurantsPageResult> {
  const page = Math.max(1, Math.floor(params?.page ?? 1));
  const pageSize = Math.max(1, Math.min(30, Math.floor(params?.pageSize ?? 12)));
  let restaurants = [...(await listDiscoverableRestaurants(params))];

  if (params?.filter === "open") {
    restaurants = restaurants.filter((restaurant) => restaurant.isOpen !== false);
  } else if (params?.filter === "featured") {
    restaurants = restaurants.filter(
      (restaurant) =>
        restaurant.discovery?.isFeatured === true ||
        typeof restaurant.discovery?.featuredSortOrder === "number",
    );
  } else if (params?.filter === "offers") {
    const offerRestaurantIds = await getActiveOfferRestaurantIdSet();
    restaurants = restaurants.filter((restaurant) =>
      offerRestaurantIds.has(String(restaurant._id)),
    );
  }

  if (typeof params?.minimumRating === "number" && params.minimumRating > 0) {
    restaurants = restaurants.filter(
      (restaurant) => Number(restaurant.avgRating ?? 0) >= params.minimumRating!,
    );
  }

  if (
    typeof params?.maximumLowestPrice === "number" &&
    params.maximumLowestPrice > 0
  ) {
    restaurants = restaurants.filter(
      (restaurant) =>
        typeof restaurant.lowestMenuPrice === "number" &&
        restaurant.lowestMenuPrice <= params.maximumLowestPrice!,
    );
  }

  restaurants.sort((left, right) => {
    if (params?.sortBy === "fastest") {
      return (
        Number(left.preparationTimeMinutes ?? Number.MAX_SAFE_INTEGER) -
        Number(right.preparationTimeMinutes ?? Number.MAX_SAFE_INTEGER)
      );
    }
    if (params?.sortBy === "topRated") {
      return Number(right.avgRating ?? 0) - Number(left.avgRating ?? 0);
    }
    return (
      Number(left.distanceKm ?? Number.MAX_SAFE_INTEGER) -
      Number(right.distanceKm ?? Number.MAX_SAFE_INTEGER)
    );
  });

  const total = restaurants.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const items = restaurants.slice(start, start + pageSize);
  const hasNextPage = safePage < pageCount;

  return {
    items,
    total,
    page: safePage,
    pageSize,
    pageCount,
    hasNextPage,
    nextPage: hasNextPage ? safePage + 1 : null,
  };
}

type HomeRestaurantSectionConfig = {
  isActive?: boolean
  title?: string
  subtitle?: string
  source?: "auto" | "manual"
  selectedRestaurantIds?: string[]
  maxItems?: number
  position?: number
  layout?: "horizontal" | "vertical"
}

type ActiveHomeOffer = Record<string, any>

function getHomeRestaurantSectionLimit(config?: HomeRestaurantSectionConfig) {
  return Math.max(1, Math.min(20, Math.floor(config?.maxItems ?? 6)))
}

function getManualHomeRestaurantIds(config?: HomeRestaurantSectionConfig) {
  return (config?.selectedRestaurantIds ?? [])
    .map((id) => id.trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
}

function orderRestaurantsByIds(
  restaurants: CustomerCacheRecord[],
  restaurantIds: string[],
) {
  const restaurantById = new Map(
    restaurants.map((restaurant) => [String(restaurant._id), restaurant]),
  )
  return restaurantIds
    .map((restaurantId) => restaurantById.get(restaurantId))
    .filter((restaurant): restaurant is CustomerCacheRecord => Boolean(restaurant))
}

function filterExcludedRestaurants(
  restaurants: CustomerCacheRecord[],
  excludedIds: Set<string>,
) {
  return restaurants.filter((restaurant) => !excludedIds.has(String(restaurant._id)))
}

function getOfferRestaurantIds(offer: ActiveHomeOffer) {
  const scopeType = String(offer.scopeType ?? "restaurant")
  const rawIds =
    scopeType === "selected_restaurants"
      ? offer.selectedRestaurantIds ?? []
      : scopeType === "restaurant"
        ? [offer.restaurantId]
        : []

  return rawIds
    .map((restaurantId: unknown) => restaurantId?.toString?.() ?? "")
    .filter(Boolean)
}

function getOfferDisplayPosition(offer: ActiveHomeOffer) {
  const position = Number(offer.display?.position ?? 0)
  return Number.isFinite(position) && position > 0 ? position : Number.MAX_SAFE_INTEGER
}

function getOfferValueScore(offer: ActiveHomeOffer) {
  const discountValue = Number(offer.discountValue ?? 0)
  const maxDiscount = Number(offer.maxDiscountAmount ?? 0)
  if (offer.type === "free_delivery") return 85
  if (offer.type === "percentage") {
    return discountValue * 2 + Math.min(maxDiscount, 250) / 10
  }
  return Math.min(discountValue, 500)
}

function compareHomeOffers(left: ActiveHomeOffer, right: ActiveHomeOffer) {
  const positionDiff = getOfferDisplayPosition(left) - getOfferDisplayPosition(right)
  if (positionDiff !== 0) return positionDiff

  const priorityDiff = Number(right.priority ?? 0) - Number(left.priority ?? 0)
  if (priorityDiff !== 0) return priorityDiff

  const valueDiff = getOfferValueScore(right) - getOfferValueScore(left)
  if (valueDiff !== 0) return valueDiff

  const leftEndsAt = left.endsAt ? new Date(left.endsAt).getTime() : Number.MAX_SAFE_INTEGER
  const rightEndsAt = right.endsAt ? new Date(right.endsAt).getTime() : Number.MAX_SAFE_INTEGER
  if (leftEndsAt !== rightEndsAt) return leftEndsAt - rightEndsAt

  return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime()
}

function buildBestOfferByRestaurantId(offers: ActiveHomeOffer[]) {
  const bestOfferByRestaurantId = new Map<string, ActiveHomeOffer>()

  for (const offer of [...offers].sort(compareHomeOffers)) {
    for (const restaurantId of getOfferRestaurantIds(offer)) {
      if (!bestOfferByRestaurantId.has(restaurantId)) {
        bestOfferByRestaurantId.set(restaurantId, offer)
      }
    }
  }

  return bestOfferByRestaurantId
}

function rankOfferRestaurants(
  restaurants: CustomerCacheRecord[],
  offers: ActiveHomeOffer[],
) {
  const bestOfferByRestaurantId = buildBestOfferByRestaurantId(offers)

  return [...restaurants].sort((left, right) => {
    const leftOffer = bestOfferByRestaurantId.get(String(left._id))
    const rightOffer = bestOfferByRestaurantId.get(String(right._id))

    const positionDiff =
      getOfferDisplayPosition(leftOffer ?? {}) - getOfferDisplayPosition(rightOffer ?? {})
    if (positionDiff !== 0) return positionDiff

    const priorityDiff = Number(rightOffer?.priority ?? 0) - Number(leftOffer?.priority ?? 0)
    if (priorityDiff !== 0) return priorityDiff

    const valueDiff = getOfferValueScore(rightOffer ?? {}) - getOfferValueScore(leftOffer ?? {})
    if (valueDiff !== 0) return valueDiff

    const rightFeatured =
      right.discovery?.isFeatured === true ||
      typeof right.discovery?.featuredSortOrder === "number"
    const leftFeatured =
      left.discovery?.isFeatured === true ||
      typeof left.discovery?.featuredSortOrder === "number"
    if (rightFeatured !== leftFeatured) return rightFeatured ? 1 : -1

    if ((left.isOpen !== false) !== (right.isOpen !== false)) {
      return right.isOpen !== false ? 1 : -1
    }

    const ratingDiff = Number(right.avgRating ?? 0) - Number(left.avgRating ?? 0)
    if (ratingDiff !== 0) return ratingDiff

    const reviewDiff = Number(right.reviewCount ?? 0) - Number(left.reviewCount ?? 0)
    if (reviewDiff !== 0) return reviewDiff

    return (
      Number(left.distanceKm ?? Number.MAX_SAFE_INTEGER) -
      Number(right.distanceKm ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

async function getCustomerOrderedRestaurantIds(customerId?: string) {
  if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
    return new Set<string>()
  }

  const restaurantIds = await OrderModel.distinct("restaurantId", {
    customerId: new mongoose.Types.ObjectId(customerId),
  })
  return new Set(restaurantIds.map((id) => id?.toString?.() ?? "").filter(Boolean))
}

const POPULAR_RESTAURANT_ORDER_STATUSES = [
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
  "Delivered",
]

async function getPopularRestaurantIdsFromOrders(limit = 80) {
  const safeLimit = Math.max(1, Math.min(200, limit))
  return popularRestaurantIdsCache.getOrSet(`popular-order-ids:${safeLimit}`, async () => {
    const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
    const rows = await OrderModel.aggregate<{
      _id: mongoose.Types.ObjectId
      recentOrders: number
      deliveredOrders: number
      totalOrders: number
      deliveredRevenue: number
    }>([
      {
        $match: {
          status: { $in: POPULAR_RESTAURANT_ORDER_STATUSES },
          restaurantId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$restaurantId",
          totalOrders: { $sum: 1 },
          recentOrders: {
            $sum: {
              $cond: [{ $gte: ["$createdAt", since] }, 1, 0],
            },
          },
          deliveredOrders: {
            $sum: {
              $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0],
            },
          },
          deliveredRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "Delivered"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$recentOrders", 140] },
              { $multiply: ["$deliveredOrders", 150] },
              { $multiply: ["$totalOrders", 24] },
              { $min: [{ $divide: ["$deliveredRevenue", 120] }, 180] },
            ],
          },
        },
      },
      { $sort: { score: -1, deliveredOrders: -1, recentOrders: -1, totalOrders: -1 } },
      { $limit: safeLimit },
    ])

    return rows.map((row) => row._id?.toString?.() ?? "").filter(Boolean)
  })
}

async function rankPopularRestaurants(
  restaurants: CustomerCacheRecord[],
) {
  const restaurantObjectIds = restaurants
    .map((restaurant) => String(restaurant._id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id))

  if (!restaurantObjectIds.length) {
    return []
  }

  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const rows = await OrderModel.aggregate<{
    _id: mongoose.Types.ObjectId
    totalOrderCount: number
    deliveredOrderCount: number
    orderCount: number
    deliveredRevenue: number
    lastDeliveredAt: Date | null
  }>([
    {
      $match: {
        restaurantId: { $in: restaurantObjectIds },
        status: { $in: POPULAR_RESTAURANT_ORDER_STATUSES },
      },
    },
    {
      $group: {
        _id: "$restaurantId",
        totalOrderCount: { $sum: 1 },
        deliveredOrderCount: {
          $sum: {
            $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0],
          },
        },
        orderCount: {
          $sum: {
            $cond: [{ $gte: ["$createdAt", since] }, 1, 0],
          },
        },
        deliveredRevenue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "Delivered"] },
              { $ifNull: ["$pricing.total", 0] },
              0,
            ],
          },
        },
        lastDeliveredAt: { $max: "$createdAt" },
      },
    },
  ])
  const orderMetricsByRestaurantId = new Map(
    rows.map((row) => [String(row._id), row]),
  )
  const scoreRestaurant = (restaurant: CustomerCacheRecord) => {
    const metrics = orderMetricsByRestaurantId.get(String(restaurant._id))
    const recentOrders = Number(metrics?.orderCount ?? 0)
    const totalOrders = Number(metrics?.totalOrderCount ?? 0)
    const deliveredOrders = Number(metrics?.deliveredOrderCount ?? 0)
    const reviewCount = Number(restaurant.reviewCount ?? 0)
    const avgRating = Number(restaurant.avgRating ?? 0)
    const lastDeliveredAt = metrics?.lastDeliveredAt
      ? new Date(metrics.lastDeliveredAt).getTime()
      : 0
    const recencyBoost = lastDeliveredAt
      ? Math.max(0, 30 - (Date.now() - lastDeliveredAt) / (24 * 60 * 60 * 1000))
      : 0

    return (
      recentOrders * 140 +
      deliveredOrders * 150 +
      totalOrders * 24 +
      Math.min(Number(metrics?.deliveredRevenue ?? 0) / 120, 180) +
      avgRating * 18 +
      Math.min(reviewCount, 80) * 2.5 +
      recencyBoost +
      (restaurant.isOpen !== false ? 8 : 0)
    )
  }

  return [...restaurants]
    .filter((restaurant) => {
      const metrics = orderMetricsByRestaurantId.get(String(restaurant._id))
      return Number(metrics?.totalOrderCount ?? 0) > 0
    })
    .sort((left, right) => {
      const rightScore = scoreRestaurant(right)
      const leftScore = scoreRestaurant(left)
      if (rightScore !== leftScore) return rightScore - leftScore
      const rightRating = Number(right.avgRating ?? 0)
      const leftRating = Number(left.avgRating ?? 0)
      if (rightRating !== leftRating) return rightRating - leftRating
      const rightReviews = Number(right.reviewCount ?? 0)
      const leftReviews = Number(left.reviewCount ?? 0)
      if (rightReviews !== leftReviews) return rightReviews - leftReviews
      return (
        Number(left.distanceKm ?? Number.MAX_SAFE_INTEGER) -
        Number(right.distanceKm ?? Number.MAX_SAFE_INTEGER)
      )
    })
}

function rankNewRestaurants(
  restaurants: CustomerCacheRecord[],
  orderedRestaurantIds: Set<string>,
) {
  return [...restaurants].sort((left, right) => {
    const leftTried = orderedRestaurantIds.has(String(left._id)) ? 1 : 0
    const rightTried = orderedRestaurantIds.has(String(right._id)) ? 1 : 0
    if (leftTried !== rightTried) return leftTried - rightTried
    if ((left.isOpen !== false) !== (right.isOpen !== false)) {
      return right.isOpen !== false ? 1 : -1
    }
    return (
      new Date(right.createdAt ?? 0).getTime() -
      new Date(left.createdAt ?? 0).getTime()
    )
  })
}

// A voucher targeted at specific customers (audienceType "selected_users") is a
// personal offer. It must only ever surface for a customer inside its
// selectedCustomerIds — never for other customers, and never for guests. This
// keeps personal vouchers out of the shared offer strips / restaurant offer
// labels that everyone can see. (Discovery home is cached per customerId, so it
// is safe to filter here.)
function isPersonalVoucherHiddenFromCustomer(
  offer: Record<string, any>,
  customerId?: string,
) {
  if (offer?.audienceType !== "selected_users") return false;
  const normalizedCustomerId = customerId ? String(customerId) : "";
  if (!normalizedCustomerId) return true;
  const selectedIds = (offer.selectedCustomerIds ?? []).map(
    (id: unknown) => (typeof id === "string" ? id : id?.toString?.() ?? ""),
  );
  return !selectedIds.includes(normalizedCustomerId);
}

export async function getCustomerDiscoveryHome(params?: {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  customerId?: string;
}): Promise<CustomerDiscoveryHomeResult> {
  const dhakaHourDecimal = getDhakaHourDecimal();
  return customerDiscoveryHomeCache.getOrSet(
    buildCustomerDiscoveryHomeCacheKey({
      ...params,
      timeBucket: Math.floor(dhakaHourDecimal),
    }),
    async () => {
      const [
        platformContent,
        featuredCollection,
        flaggedFeaturedRows,
        rawActiveOffers,
        orderedRestaurantIds,
      ] = await Promise.all([
        getPlatformContent(),
        RestaurantCollectionModel.findOne({
          key: "featured_restaurants",
          isActive: true,
        }).lean(),
        RestaurantModel.find({
          ...getDiscoverableRestaurantQuery(),
          "discovery.isFeatured": true,
        })
          .select({ _id: 1 })
          .lean(),
        VoucherModel.find({
          archivedAt: null,
          status: "Active",
          startsAt: { $lte: new Date() },
          endsAt: { $gte: new Date() },
        })
          .sort({
            "display.position": 1,
            priority: -1,
            discountValue: -1,
            endsAt: 1,
            createdAt: -1,
          })
          .limit(20)
          .lean(),
        getCustomerOrderedRestaurantIds(params?.customerId),
      ]);

      // Drop personal (selected_users) vouchers that don't belong to this customer
      // up front, so every downstream use — the "restaurants with offers" section,
      // offer labels, and the returned activeOffers — is scoped to this customer.
      const activeOffers = rawActiveOffers.filter(
        (offer) =>
          !isPersonalVoucherHiddenFromCustomer(
            offer as Record<string, any>,
            params?.customerId,
          ),
      );

      const selectedHomeServiceArea =
        typeof params?.latitude === "number" && typeof params?.longitude === "number"
          ? await assertLocationInsideServiceArea({
              latitude: params.latitude,
              longitude: params.longitude,
              required: false,
            })
          : null;
      const homePlatformContent = applyServiceAreaHomeCmsOverride(
        platformContent,
        selectedHomeServiceArea?.snapshot,
      );
      const homeRestaurantSections =
        homePlatformContent.customerApp.homeCms.restaurantSections;
      const featuredSection = homeRestaurantSections.featured;
      const offersSection = homeRestaurantSections.offers;
      const discoverNewSection = homeRestaurantSections.discoverNew;
      const popularNearYouSection = homeRestaurantSections.popularNearYou;
      const nearbySection = homeRestaurantSections.nearby;

      const collectionFeaturedRestaurantIds =
        featuredCollection?.restaurantIds.map((id) => id.toString()) ?? [];
      const flaggedFeaturedRestaurantIds = flaggedFeaturedRows.map((restaurant) =>
        restaurant._id.toString(),
      );
      const restaurantIdsWithOffers = [
        ...new Set(
          activeOffers
            .sort(compareHomeOffers)
            .flatMap((offer) => getOfferRestaurantIds(offer as ActiveHomeOffer))
            .filter(Boolean),
        ),
      ];
      const manualSectionRestaurantIds = [
        ...getManualHomeRestaurantIds(featuredSection),
        ...getManualHomeRestaurantIds(offersSection),
        ...getManualHomeRestaurantIds(discoverNewSection),
        ...getManualHomeRestaurantIds(popularNearYouSection),
      ];

      const restaurantIdsToLoad = [
        ...new Set([
          ...collectionFeaturedRestaurantIds,
          ...flaggedFeaturedRestaurantIds,
          ...restaurantIdsWithOffers,
          ...manualSectionRestaurantIds,
        ]),
      ];
      const discoverableRestaurants = restaurantIdsToLoad.length
        ? await listDiscoverableRestaurants({
            restaurantIds: restaurantIdsToLoad,
            latitude: params?.latitude,
            longitude: params?.longitude,
            radiusKm: params?.radiusKm,
          })
        : [];
      const restaurantById = new Map(
        discoverableRestaurants.map((restaurant) => [
          restaurant._id.toString(),
          restaurant,
        ]),
      );
      const autoFeaturedRestaurants = [
        ...new Set([
          ...collectionFeaturedRestaurantIds,
          ...flaggedFeaturedRestaurantIds,
        ]),
      ]
        .map((restaurantId) => restaurantById.get(restaurantId))
        .filter((restaurant): restaurant is CustomerCacheRecord => Boolean(restaurant));
      const manualFeaturedRestaurants = orderRestaurantsByIds(
        discoverableRestaurants,
        getManualHomeRestaurantIds(featuredSection),
      );
      const featuredRestaurants =
        featuredSection.isActive === false
          ? []
          : (featuredSection.source === "manual" && manualFeaturedRestaurants.length
              ? manualFeaturedRestaurants
              : autoFeaturedRestaurants
            ).slice(0, getHomeRestaurantSectionLimit(featuredSection));
      const featuredShownRestaurantIds = new Set(
        featuredRestaurants.map((restaurant) => String(restaurant._id)),
      );
      const offerAllowRepeat =
        offersSection.allowRepeatAcrossSections !== false;
      const autoOfferRestaurants = restaurantIdsWithOffers
        .map((restaurantId) => restaurantById.get(restaurantId))
        .filter((restaurant): restaurant is CustomerCacheRecord => Boolean(restaurant));
      const autoOfferSourceRestaurants = offerAllowRepeat
        ? autoOfferRestaurants
        : filterExcludedRestaurants(autoOfferRestaurants, featuredShownRestaurantIds);
      const manualOfferRestaurants = orderRestaurantsByIds(
        offerAllowRepeat
          ? discoverableRestaurants
          : filterExcludedRestaurants(discoverableRestaurants, featuredShownRestaurantIds),
        getManualHomeRestaurantIds(offersSection),
      );
      const shouldShowRestaurantOfferSection =
        homePlatformContent.customerApp.homeCms.offerStrip?.showRestaurantOfferSection !== false &&
        offersSection.isActive !== false;
      const offerRestaurants = shouldShowRestaurantOfferSection
        ? (offersSection.source === "manual" && manualOfferRestaurants.length
            ? manualOfferRestaurants
            : rankOfferRestaurants(autoOfferSourceRestaurants, activeOffers as ActiveHomeOffer[])
          ).slice(0, getHomeRestaurantSectionLimit(offersSection))
        : [];
      const visibleActiveOffers = activeOffers.filter((offer) => {
        const scopedOffer = offer as any;
        if (scopedOffer.scopeType === "all_restaurants") return true;
        const offerRestaurantIds =
          scopedOffer.scopeType === "selected_restaurants"
            ? (scopedOffer.selectedRestaurantIds ?? [])
                .map((restaurantId: unknown) => restaurantId?.toString?.() ?? "")
                .filter(Boolean)
            : [scopedOffer.restaurantId?.toString?.() ?? ""].filter(Boolean);
        return offerRestaurantIds.some((restaurantId: string) => restaurantById.has(restaurantId));
      });

      const shouldLoadDiscoveryCandidates =
        discoverNewSection.isActive !== false || nearbySection.isActive !== false;
      const candidateRestaurants = shouldLoadDiscoveryCandidates
        ? await listDiscoverableRestaurants({
            latitude: params?.latitude,
            longitude: params?.longitude,
            radiusKm: params?.radiusKm,
          })
        : [];
      const nearbyRestaurants =
        nearbySection.isActive === false ? [] : candidateRestaurants.slice(0, 20);
      const shouldLoadPopularCandidates =
        popularNearYouSection.isActive !== false;
      const popularRestaurantIds = shouldLoadPopularCandidates
        ? await getPopularRestaurantIdsFromOrders(80)
        : [];
      const popularCandidateIds = [
        ...new Set([
          ...popularRestaurantIds,
          ...getManualHomeRestaurantIds(popularNearYouSection),
        ]),
      ];
      const popularRestaurantCandidates = shouldLoadPopularCandidates
        ? popularCandidateIds.length
          ? await listDiscoverableRestaurants({
              restaurantIds: popularCandidateIds,
              latitude: params?.latitude,
              longitude: params?.longitude,
              radiusKm: params?.radiusKm,
            })
          : []
        : [];
      const alreadyShownRestaurantIds = new Set(
        [...featuredRestaurants, ...offerRestaurants].map((restaurant) =>
          String(restaurant._id),
        ),
      );
      const discoverNewAllowRepeat =
        discoverNewSection.allowRepeatAcrossSections !== false;
      const candidateRestaurantsForDiscoverNew = discoverNewAllowRepeat
        ? candidateRestaurants
        : filterExcludedRestaurants(candidateRestaurants, alreadyShownRestaurantIds);
      const manualDiscoverNewRestaurants = orderRestaurantsByIds(
        candidateRestaurantsForDiscoverNew,
        getManualHomeRestaurantIds(discoverNewSection),
      );
      const discoverNewRestaurants =
        discoverNewSection.isActive === false
          ? []
          : (discoverNewSection.source === "manual" && manualDiscoverNewRestaurants.length
              ? manualDiscoverNewRestaurants
              : rankNewRestaurants(candidateRestaurantsForDiscoverNew, orderedRestaurantIds)
            ).slice(0, getHomeRestaurantSectionLimit(discoverNewSection));
      const popularNearYouAllowRepeat =
        popularNearYouSection.allowRepeatAcrossSections !== false;
      if (!popularNearYouAllowRepeat) {
        discoverNewRestaurants.forEach((restaurant) =>
          alreadyShownRestaurantIds.add(String(restaurant._id)),
        );
      }
      const manualPopularNearYouRestaurants = orderRestaurantsByIds(
        popularNearYouAllowRepeat
          ? popularRestaurantCandidates
          : filterExcludedRestaurants(popularRestaurantCandidates, alreadyShownRestaurantIds),
        getManualHomeRestaurantIds(popularNearYouSection),
      );
      const popularCandidateRestaurants = popularNearYouAllowRepeat
        ? popularRestaurantCandidates
        : filterExcludedRestaurants(
            popularRestaurantCandidates,
            alreadyShownRestaurantIds,
          );
      const popularFallbackExcludedIds = new Set(
        [...featuredRestaurants, ...offerRestaurants].map((restaurant) =>
          String(restaurant._id),
        ),
      );
      const popularFallbackRestaurants = popularNearYouAllowRepeat
        ? popularRestaurantCandidates
        : filterExcludedRestaurants(
            popularRestaurantCandidates,
            popularFallbackExcludedIds,
          );
      const shouldAutoRankPopular =
        popularNearYouSection.isActive !== false &&
        !(
          popularNearYouSection.source === "manual" &&
          manualPopularNearYouRestaurants.length
        );
      const autoPopularRestaurants = shouldAutoRankPopular
        ? await rankPopularRestaurants(
            popularCandidateRestaurants.length
              ? popularCandidateRestaurants
              : popularFallbackRestaurants.length
                ? popularFallbackRestaurants
                : popularRestaurantCandidates,
          )
        : [];
      const popularNearYouRestaurants =
        popularNearYouSection.isActive === false
          ? []
          : (popularNearYouSection.source === "manual" && manualPopularNearYouRestaurants.length
              ? manualPopularNearYouRestaurants
              : autoPopularRestaurants
            ).slice(0, getHomeRestaurantSectionLimit(popularNearYouSection));
      // Time-based section: pick the window that matches the current Asia/Dhaka
      // hour, then resolve its restaurants (manual ids or auto tag-match), with a
      // graceful fallback to the general nearby pool so it never renders empty.
      const timeBasedConfig =
        homePlatformContent.customerApp.homeCms.timeBasedSection;
      let timeBasedSection: Record<string, any> | null = null;
      if (timeBasedConfig?.isActive !== false) {
        const activeWindow = resolveActiveTimeWindow(
          timeBasedConfig?.windows,
          dhakaHourDecimal,
        );
        if (activeWindow) {
          const timeLimit = Math.max(
            1,
            Math.min(20, Number(timeBasedConfig?.maxItems ?? 8)),
          );
          const manualWindowIds = Array.isArray(activeWindow.selectedRestaurantIds)
            ? activeWindow.selectedRestaurantIds.filter(Boolean)
            : [];
          let windowRestaurants: CustomerCacheRecord[] = [];
          if (timeBasedConfig?.source === "manual" && manualWindowIds.length) {
            const manualRows = await listDiscoverableRestaurants({
              restaurantIds: manualWindowIds,
              latitude: params?.latitude,
              longitude: params?.longitude,
              radiusKm: params?.radiusKm,
            });
            windowRestaurants = orderRestaurantsByIds(manualRows, manualWindowIds);
          } else {
            const pool = candidateRestaurants.length
              ? candidateRestaurants
              : await listDiscoverableRestaurants({
                  latitude: params?.latitude,
                  longitude: params?.longitude,
                  radiusKm: params?.radiusKm,
                });
            const matchTags = Array.isArray(activeWindow.matchTags)
              ? activeWindow.matchTags.filter(Boolean)
              : [];
            const matched = pool.filter((restaurant) =>
              restaurantMatchesTimeTags(restaurant, matchTags),
            );
            windowRestaurants = matched.length ? matched : pool;
          }
          windowRestaurants = windowRestaurants.slice(0, timeLimit);
          if (windowRestaurants.length) {
            timeBasedSection = {
              isActive: true,
              windowId: activeWindow.id,
              title: activeWindow.title,
              subtitle: activeWindow.subtitle ?? "",
              emoji: activeWindow.emoji ?? "",
              icon: activeWindow.icon ?? "time-outline",
              accentColor: activeWindow.accentColor ?? "#FF5C93",
              layout: timeBasedConfig?.layout ?? "horizontal",
              position: Number(timeBasedConfig?.position ?? 1),
              maxItems: timeLimit,
              restaurants: windowRestaurants,
            };
          }
        }
      }
      const hasDeliveredCustomerOrder = params?.customerId
        ? Boolean(
            await OrderModel.exists({
              customerId: params.customerId,
              status: "Delivered",
            }),
          )
        : false;
      const homeCms = JSON.parse(
        JSON.stringify(homePlatformContent.customerApp.homeCms),
      );
      if (
        homeCms.howToOrderGuide?.audience === "new_users" &&
        (!params?.customerId || hasDeliveredCustomerOrder)
      ) {
        homeCms.howToOrderGuide.isActive = false;
      }
      return {
        homeBanner: homePlatformContent.customerApp.homeBanner.isActive
          ? homePlatformContent.customerApp.homeBanner
          : null,
        homeCms,
        timeBasedSection,
        featuredRestaurants,
        restaurantsWithOffers: shouldShowRestaurantOfferSection ? offerRestaurants : [],
        discoverNewRestaurants,
        popularNearYouRestaurants,
        nearbyRestaurants,
        campaignPlacements: [],
        activeOffers: visibleActiveOffers.map((offer) => ({
              _id: offer._id.toString(),
              restaurantId: offer.restaurantId?.toString?.() ?? "",
              restaurantIds:
                (offer as any).scopeType === "selected_restaurants"
                  ? ((offer as any).selectedRestaurantIds ?? [])
                      .map(
                        (restaurantId: unknown) =>
                          restaurantId?.toString?.() ?? "",
                      )
                      .filter(Boolean)
                  : [offer.restaurantId?.toString?.() ?? ""].filter(Boolean),
              scopeType: (offer as any).scopeType,
              audienceType: (offer as any).audienceType,
              name: offer.name,
              code: offer.code,
              type: offer.type,
              mode: offer.mode,
              discountValue: offer.discountValue,
              minimumOrderAmount: offer.minimumOrderAmount,
              display: (offer as any).display ?? {},
            })),
      };
    },
  );
}

export async function getCustomerRestaurantDetails(
  restaurantId: string,
  params?: {
    latitude?: number;
    longitude?: number;
  },
): Promise<CustomerRestaurantDetailsResult> {
  await ensureRestaurantDiscoveryBackfill();
  return customerRestaurantDetailsCache.getOrSet(
    buildCustomerRestaurantDetailsCacheKey(restaurantId, params),
    async () => {
      const restaurant = await RestaurantModel.findOne({
        _id: new mongoose.Types.ObjectId(restaurantId),
        "runtime.isVisible": true,
      })
        .select({
          name: 1,
          slug: 1,
          description: 1,
          cuisineTypes: 1,
          tags: 1,
          logo: 1,
          coverImage: 1,
          address: 1,
          location: 1,
          serviceArea: 1,
          runtime: 1,
          enforcement: 1,
          discovery: 1,
          settings: 1,
          preparationTimeMinutes: 1,
          createdAt: 1,
        })
        .lean<Record<string, any>>();

      if (!restaurant) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          "RESTAURANT_NOT_FOUND",
          "Restaurant not found",
        );
      }

      restaurant.enforcement = getRestaurantEnforcement(restaurant);
      restaurant.isOpen =
        (restaurant.runtime?.isOnline ?? false) && !restaurant.enforcement.isRestricted;
      const platformContent = await getPlatformContent();
      const selectedServiceArea =
        typeof params?.latitude === "number" && typeof params?.longitude === "number"
          ? await assertLocationInsideServiceArea({
              latitude: params.latitude,
              longitude: params.longitude,
              required: false,
            })
          : null;
      const scopedPlatformContent = applyServiceAreaHomeCmsOverride(
        platformContent,
        selectedServiceArea?.snapshot,
      );
      const restaurantServiceArea =
        await resolveRestaurantServiceAreaSnapshot(restaurant);
      restaurant.selectedServiceArea = selectedServiceArea?.snapshot ?? null;
      restaurant.serviceArea = restaurantServiceArea ?? restaurant.serviceArea ?? null;
      const deliveryRadiusKm = Math.max(
        0,
        isServiceAreaModeEnabled()
          ? (selectedServiceArea?.snapshot.radiusKm ??
              restaurantServiceArea?.radiusKm ??
              platformContent.operations.serviceArea.radiusKm)
          : platformContent.operations.serviceArea.radiusKm,
      );
      restaurant.deliveryRadiusKm = deliveryRadiusKm;

      if (
        typeof params?.latitude === "number" &&
        typeof params?.longitude === "number" &&
        typeof restaurant.location?.latitude === "number" &&
        typeof restaurant.location?.longitude === "number"
      ) {
        restaurant.distanceKm = calculateDistanceKm(
          params.latitude,
          params.longitude,
          restaurant.location.latitude,
          restaurant.location.longitude,
        );
        restaurant.isServiceableForSelectedLocation = isServiceAreaModeEnabled()
          ? Boolean(
              selectedServiceArea?.snapshot &&
                isCoordinateInsideServiceArea({
                  latitude: restaurant.location.latitude,
                  longitude: restaurant.location.longitude,
                  serviceArea: selectedServiceArea.snapshot,
                }),
            )
          : restaurant.distanceKm <= deliveryRadiusKm;
      } else {
        restaurant.distanceKm = null;
        restaurant.isServiceableForSelectedLocation = null;
      }

      const [categories, menuItems, activeOffers, markdownRules, reviewFacetRows] =
        await Promise.all([
          CategoryModel.find({
            restaurantId: restaurant._id,
            status: "active",
          })
            .select({
              name: 1,
              slug: 1,
              description: 1,
              displayOrder: 1,
            })
            .sort({ displayOrder: 1 })
            .lean(),
          MenuItemModel.find({
            restaurantId: restaurant._id,
            status: "active",
            availability: "available",
          })
            .select({
              categoryId: 1,
              name: 1,
              slug: 1,
              description: 1,
              images: 1,
              basePrice: 1,
              kind: 1,
              availability: 1,
              isPopular: 1,
              variants: 1,
              addOnGroups: 1,
              recommendedItemIds: 1,
              createdAt: 1,
            })
            .sort({ isPopular: -1, createdAt: -1 })
            .lean(),
          VoucherModel.find({
            archivedAt: null,
            // Offer strip shows checkout vouchers only; markdowns render on item cards.
            surface: { $ne: "menu_markdown" },
            // Personal (selected_users) vouchers must never appear in this shared,
            // per-restaurant offer strip that every customer sees. They surface only
            // in the assigned customer's own offers/notifications.
            audienceType: { $ne: "selected_users" },
            $or: [
              { restaurantId: restaurant._id },
              { scopeType: "all_restaurants" },
              {
                scopeType: "selected_restaurants",
                selectedRestaurantIds: restaurant._id,
              },
            ],
            status: "Active",
            startsAt: { $lte: new Date() },
            endsAt: { $gte: new Date() },
          })
            .select({
              restaurantId: 1,
              name: 1,
              code: 1,
              type: 1,
              mode: 1,
              discountValue: 1,
              minimumOrderAmount: 1,
              display: 1,
            })
            .sort({ priority: -1 })
            .lean(),
          VoucherModel.find(buildActiveMenuMarkdownFilter(restaurant))
            .select({
              scopeType: 1,
              restaurantId: 1,
              selectedRestaurantIds: 1,
              applicability: 1,
              categoryIds: 1,
              itemIds: 1,
              type: 1,
              discountValue: 1,
              maxDiscountAmount: 1,
              minItemPrice: 1,
              priority: 1,
            })
            .lean(),
          ReviewModel.aggregate<{
            recent: Array<Record<string, any>>;
            metrics: Array<{
              _id: null;
              avgRating: number | null;
              reviewCount: number;
            }>;
          }>([
            {
              $match: {
                restaurantId: restaurant._id,
                moderationStatus: "visible",
                isHidden: { $ne: true },
              },
            },
            {
              $facet: {
                recent: [
                  { $sort: { createdAt: -1 } },
                  { $limit: 6 },
                  {
                    $project: {
                      rating: 1,
                      comment: 1,
                      createdAt: 1,
                      customerId: 1,
                      ownerReply: 1,
                    },
                  },
                ],
                metrics: [
                  {
                    $group: {
                      _id: null,
                      avgRating: { $avg: "$rating" },
                      reviewCount: { $sum: 1 },
                    },
                  },
                ],
              },
            },
          ]),
        ]);

      const reviewFacet = reviewFacetRows[0] ?? { recent: [], metrics: [] };
      const recentReviews = reviewFacet.recent ?? [];
      const reviewSummary = reviewFacet.metrics?.[0];

      // Attach platform-funded markdown (strike-through pricing) to each menu item. The
      // helper picks the most specific active rule per item; cart/order recompute the exact
      // amount per selected variant so display and settlement stay in sync.
      const markdownByItem = resolveMenuMarkdownForDisplay(
        menuItems as Parameters<typeof resolveMenuMarkdownForDisplay>[0],
        markdownRules as unknown as MarkdownRule[],
        String(restaurant._id),
      );
      for (const item of menuItems) {
        const markdown = markdownByItem.get(String(item._id));
        (item as Record<string, unknown>).markdown = markdown ?? null;
      }

      restaurant.lowestMenuPrice = menuItems.reduce<number | null>((lowest, item) => {
        const markdown = markdownByItem.get(String(item._id));
        const basePrice =
          typeof item.basePrice === "number" && Number.isFinite(item.basePrice)
            ? item.basePrice
            : null;
        // Use the discounted starting price so list cards and sorting reflect the deal.
        const price =
          markdown && markdown.hasMarkdown ? markdown.effectivePrice : basePrice;
        if (price === null) return lowest;
        return lowest === null ? price : Math.min(lowest, price);
      }, null);
      restaurant.reviewCount = reviewSummary?.reviewCount ?? 0;
      restaurant.avgRating =
        reviewSummary?.reviewCount && typeof reviewSummary.avgRating === "number"
          ? Math.round(reviewSummary.avgRating * 10) / 10
          : null;
      restaurant.orderNote = getCustomerFacingOrderNoteSetting(restaurant);
      delete restaurant.settings;

      const reviewCustomerIds = [
        ...new Set(
          recentReviews.map((review) => review.customerId).filter(Boolean),
        ),
      ];
      const reviewCustomers = reviewCustomerIds.length
        ? await CustomerModel.find({ _id: { $in: reviewCustomerIds } })
            .select("fullName")
            .lean()
        : [];
      const reviewCustomerMap = new Map(
        reviewCustomers.map((customer) => [
          String(customer._id),
          customer.fullName?.trim() || "Foodbela customer",
        ]),
      );

      return {
        restaurant,
        categories,
        menuItems,
        activeOffers,
        cartRecommendations:
          scopedPlatformContent.customerApp.homeCms.cartRecommendations,
        recentReviews: recentReviews.map((review) => ({
          id: String(review._id),
          rating: review.rating,
          comment: review.comment ?? "",
          createdAt: review.createdAt
            ? new Date(review.createdAt).toISOString()
            : undefined,
          customerName:
            reviewCustomerMap.get(review.customerId) ?? "Foodbela customer",
          ownerReply: review.ownerReply?.message
            ? {
                message: review.ownerReply.message,
                createdAt: review.ownerReply.createdAt
                  ? new Date(review.ownerReply.createdAt).toISOString()
                  : null,
                updatedAt: review.ownerReply.updatedAt
                  ? new Date(review.ownerReply.updatedAt).toISOString()
                  : null,
              }
            : null,
        })),
      };
    },
  );
}

export type CartInputItem = {
  itemId: string;
  quantity: number;
  selectedVariantOptions?: Array<{ groupName: string; optionLabel: string }>;
  selectedAddOnOptions?: Array<{ groupName: string; optionLabel: string }>;
};

type CustomerDeliveryAddressInput = {
  label: string;
  addressLine: string;
  addressDetails?: string;
  latitude: number;
  longitude: number;
};

function assertPinnedDeliveryCoordinates(deliveryAddress: CustomerDeliveryAddressInput) {
  const hasLatitude =
    typeof deliveryAddress.latitude === "number" &&
    Number.isFinite(deliveryAddress.latitude);
  const hasLongitude =
    typeof deliveryAddress.longitude === "number" &&
    Number.isFinite(deliveryAddress.longitude);

  if (hasLatitude && hasLongitude) {
    return;
  }

  throw new AppError(
    StatusCodes.BAD_REQUEST,
    "DELIVERY_LOCATION_REQUIRED",
    "Select a pinned delivery location before placing the order.",
  );
}

function normalizeClientOrderId(value?: string | null) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function createOrderNumber() {
  return `FB-${Date.now()}-${crypto.randomInt(1000, 10000)}`;
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

// True when the duplicate-key error came from the single-use-per-customer
// voucher guard (not from the clientOrderId idempotency index).
function isVoucherPerUserDuplicateError(error: unknown) {
  if (!isDuplicateKeyError(error)) return false;
  const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
  if (keyPattern && "voucherSnapshot.customerId" in keyPattern) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("voucherSnapshot.customerId");
}

function buildQuoteFromOrder(order: Record<string, any>) {
  return {
    restaurant: {
      id: String(order.restaurantId ?? ""),
      name: order.restaurantSnapshot?.name ?? "",
    },
    items: Array.isArray(order.itemsSnapshot) ? order.itemsSnapshot : [],
    pricing: order.pricing ?? {},
    appliedVouchers: Array.isArray(order.appliedVouchers)
      ? order.appliedVouchers
      : [],
    serviceArea: order.serviceAreaSnapshot ?? null,
  };
}

function getCustomerOrderNote(order: Record<string, any>) {
  const directNote = trimLimitedString(order.note, "", 240);
  if (directNote) return directNote;

  const placedHistoryNote = Array.isArray(order.history)
    ? order.history.find(
        (entry: Record<string, any>) =>
          entry?.status === "New" && entry?.actor === "customer",
      )?.note
    : "";
  return trimLimitedString(placedHistoryNote, "", 240);
}

function serializeCustomerOrder(order: any) {
  const orderObject =
    order && typeof order.toObject === "function" ? order.toObject() : order;
  return {
    ...(orderObject ?? {}),
    note: getCustomerOrderNote(orderObject ?? {}),
  };
}

async function findIdempotentOrder(customerId: string, clientOrderId: string) {
  if (!clientOrderId) return null;
  return OrderModel.findOne({ customerId, clientOrderId });
}

function ensureCustomerIdentity(customerId?: string) {
  if (!customerId) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "UNAUTHORIZED",
      "Customer authentication required",
    );
  }

  return customerId;
}

async function getCustomerById(customerId: string) {
  const customer = await CustomerModel.findById(customerId);

  if (!customer) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer not found",
    );
  }

  return customer;
}

function assertCustomerAccountAccessible(customer: {
  status?: "active" | "suspended" | "locked" | string | null;
}) {
  if (customer.status === "suspended") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "ACCOUNT_DEACTIVATED",
      "This account has been deactivated. Please contact support if you need help.",
    );
  }

  if (customer.status === "locked") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "ACCOUNT_LOCKED",
      "This account is no longer available. Please contact support for assistance.",
    );
  }
}

type CustomerCustomOfferStatus = "locked" | "eligible" | "requested" | "ready";

function getActiveCustomerPersonalOffer(customer: Record<string, any>) {
  const notifications = Array.isArray(customer.notifications)
    ? customer.notifications
    : [];

  return notifications
    .filter((notification) => notification?.personalOffer === true)
    .filter((notification) => {
      const expiresAt = notification?.voucherExpiresAt
        ? new Date(notification.voucherExpiresAt).getTime()
        : null;
      return !expiresAt || Number.isNaN(expiresAt) || expiresAt > Date.now();
    })
    .sort((left, right) => {
      const leftTime = new Date(left?.createdAt ?? 0).getTime();
      const rightTime = new Date(right?.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    })[0];
}

function buildCustomerCustomOfferSummary(
  customer: Record<string, any>,
  completedOrderCount: number,
) {
  const request = customer.customOfferRequest ?? {};
  const activeOffer = getActiveCustomerPersonalOffer(customer);
  const remainingOrderCount = Math.max(
    CUSTOM_OFFER_TARGET_ORDER_COUNT - completedOrderCount,
    0,
  );
  const requestStatus = String(request.status ?? "none");
  const status: CustomerCustomOfferStatus = activeOffer
    ? "ready"
    : requestStatus === "requested"
      ? "requested"
      : completedOrderCount >= CUSTOM_OFFER_TARGET_ORDER_COUNT
        ? "eligible"
        : "locked";

  return {
    status,
    completedOrderCount,
    targetOrderCount: CUSTOM_OFFER_TARGET_ORDER_COUNT,
    remainingOrderCount,
    progressRatio:
      CUSTOM_OFFER_TARGET_ORDER_COUNT > 0
        ? Math.min(completedOrderCount / CUSTOM_OFFER_TARGET_ORDER_COUNT, 1)
        : 0,
    requestedAt: request.requestedAt ?? null,
    expectedReadyAt: request.expectedReadyAt ?? null,
    fulfilledAt: request.fulfilledAt ?? null,
    voucherId: activeOffer?.voucherId || request.voucherId || "",
    voucherCode: activeOffer?.voucherCode || request.voucherCode || "",
    voucherLabel:
      activeOffer?.voucherLabel ||
      activeOffer?.title ||
      request.voucherLabel ||
      "",
    voucherExpiresAt: activeOffer?.voucherExpiresAt ?? null,
  };
}

export async function getCustomerCustomOfferSummary(customerId: string) {
  const safeCustomerId = ensureCustomerIdentity(customerId);
  const customer = await CustomerModel.findById(safeCustomerId)
    .select("customOfferRequest notifications")
    .lean();

  if (!customer) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer not found",
    );
  }

  const completedOrderCount = await OrderModel.countDocuments({
    customerId: safeCustomerId,
    status: "Delivered",
  });

  return buildCustomerCustomOfferSummary(customer, completedOrderCount);
}

export async function requestCustomerCustomOffer(params: {
  customerId: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const customer = await CustomerModel.findById(safeCustomerId);

  if (!customer) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer not found",
    );
  }

  assertCustomerAccountAccessible(customer);

  const completedOrderCount = await OrderModel.countDocuments({
    customerId: safeCustomerId,
    status: "Delivered",
  });

  if (completedOrderCount < CUSTOM_OFFER_TARGET_ORDER_COUNT) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "CUSTOM_OFFER_NOT_ELIGIBLE",
      "Complete more delivered orders to request my offer.",
    );
  }

  const customerObject = customer.toObject() as Record<string, any>;
  const currentRequest = customerObject.customOfferRequest ?? {};
  const activeOffer = getActiveCustomerPersonalOffer(customerObject);
  if (!activeOffer && currentRequest.status !== "requested") {
    const now = new Date();
    const expectedReadyAt = new Date(
      now.getTime() + CUSTOM_OFFER_ADMIN_RESPONSE_HOURS * 60 * 60 * 1000,
    );
    const history = Array.isArray(currentRequest.history)
      ? currentRequest.history
      : [];

    customer.set("customOfferRequest", {
      ...currentRequest,
      status: "requested",
      requestedAt: now,
      expectedReadyAt,
      fulfilledAt: null,
      lastRequestOrderCount: completedOrderCount,
      history: [
        ...history.slice(-24),
        {
          action: "requested",
          note: "Customer requested my offer from the profile screen.",
          actorId: safeCustomerId,
          actorName: customer.fullName || "Customer",
          createdAt: now,
        },
      ],
    });
    await customer.save();

    await createAdminOperationalAlert({
      alertType: "customer_custom_offer_request",
      severity: "info",
      title: "Customer requested my offer",
      description: `${customer.fullName || customer.phone || "A customer"} completed ${completedOrderCount} delivered orders and requested a personal voucher.`,
      source: "Customer offers",
      entityType: "customer",
      entityId: safeCustomerId,
      path: `/users?customerId=${safeCustomerId}&tab=offers`,
      iconKey: "gift",
      dedupeKey: `customer-custom-offer:${safeCustomerId}`,
      metadata: {
        customerId: safeCustomerId,
        customerName: customer.fullName || "",
        customerPhone: customer.phone || "",
        completedOrderCount,
        targetOrderCount: CUSTOM_OFFER_TARGET_ORDER_COUNT,
        expectedReadyAt: expectedReadyAt.toISOString(),
        couponsPath: `/coupons?customerId=${safeCustomerId}&customerName=${encodeURIComponent(
          customer.fullName || "",
        )}&customerPhone=${encodeURIComponent(customer.phone || "")}&personalOffer=1`,
      },
    });
  }

  const refreshed = await CustomerModel.findById(safeCustomerId)
    .select("customOfferRequest notifications")
    .lean();
  return buildCustomerCustomOfferSummary(
    refreshed ?? customer.toObject(),
    completedOrderCount,
  );
}

function normalizeSavedLocations(
  locations: Array<{
    _id?: mongoose.Types.ObjectId | string;
    label?: string;
    address?: string;
    addressDetails?: string;
    latitude?: number;
    longitude?: number;
    source?: string;
    isDefault?: boolean;
    serviceArea?: Record<string, unknown> | null;
    lastUsedAt?: Date | string | null;
  }>,
) {
  const sorted = [...locations].sort((left, right) => {
    if (left.isDefault && !right.isDefault) return -1;
    if (!left.isDefault && right.isDefault) return 1;

    const leftUsedAt = left.lastUsedAt
      ? new Date(left.lastUsedAt).getTime()
      : 0;
    const rightUsedAt = right.lastUsedAt
      ? new Date(right.lastUsedAt).getTime()
      : 0;
    return rightUsedAt - leftUsedAt;
  });

  return sorted.slice(0, 1).map((location) => ({
    ...location,
    isDefault: true,
  }));
}

export async function getCustomerSavedLocations(customerId: string) {
  const customer = await getCustomerById(ensureCustomerIdentity(customerId));
  const currentLocations = (customer.savedLocations ?? []).map((location) =>
    location.toObject(),
  );
  const normalizedLocations = await refreshSavedLocationServiceAreas(
    normalizeSavedLocations(currentLocations),
  );

  const needsNormalization =
    currentLocations.length !== normalizedLocations.length ||
    currentLocations.some((location, index) => {
      const next = normalizedLocations[index];
      return (
        String(location._id ?? "") !== String(next?._id ?? "") ||
        location.label !== next?.label ||
        location.address !== next?.address ||
        (location.addressDetails ?? "") !== (next?.addressDetails ?? "") ||
        location.latitude !== next?.latitude ||
        location.longitude !== next?.longitude ||
        Boolean(location.isDefault) !== Boolean(next?.isDefault) ||
        serviceAreaComparisonKey(location.serviceArea) !==
          serviceAreaComparisonKey(next?.serviceArea)
      );
    });

  if (needsNormalization) {
    customer.savedLocations = normalizedLocations as typeof customer.savedLocations;
    await customer.save();
  }

  return normalizedLocations.map((location) => mapSavedLocation(location));
}

export async function listCustomerFavoriteRestaurantIds(customerId: string) {
  const customer = await getCustomerById(ensureCustomerIdentity(customerId));

  return (customer.favoriteRestaurantIds ?? []).map((restaurantId) =>
    restaurantId.toString(),
  );
}

export async function listCustomerFavoriteRestaurants(params: {
  customerId: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}) {
  const favoriteRestaurantIds = await listCustomerFavoriteRestaurantIds(
    params.customerId,
  );

  if (!favoriteRestaurantIds.length) {
    return [];
  }

  return listDiscoverableRestaurants({
    restaurantIds: favoriteRestaurantIds,
    latitude: params.latitude,
    longitude: params.longitude,
    radiusKm: params.radiusKm,
  });
}

export async function toggleCustomerFavoriteRestaurant(params: {
  customerId: string;
  restaurantId: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);

  if (!mongoose.Types.ObjectId.isValid(params.restaurantId)) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  const restaurantExists = await RestaurantModel.exists({
    _id: new mongoose.Types.ObjectId(params.restaurantId),
    ...getDiscoverableRestaurantQuery(),
  });

  if (!restaurantExists) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }

  const customer = await getCustomerById(safeCustomerId);
  const currentFavoriteIds = (customer.favoriteRestaurantIds ?? []).map(
    (restaurantId) => restaurantId.toString(),
  );
  const isAlreadyFavorite = currentFavoriteIds.includes(params.restaurantId);

  customer.favoriteRestaurantIds = isAlreadyFavorite
    ? customer.favoriteRestaurantIds.filter(
        (restaurantId) => restaurantId.toString() !== params.restaurantId,
      )
    : [
        ...customer.favoriteRestaurantIds,
        new mongoose.Types.ObjectId(params.restaurantId),
      ];

  await customer.save();

  const favoriteRestaurantIds = customer.favoriteRestaurantIds.map(
    (restaurantId) => restaurantId.toString(),
  );

  return {
    restaurantId: params.restaurantId,
    isFavorite: !isAlreadyFavorite,
    favoriteRestaurantIds,
  };
}

export async function registerCustomerPushToken(params: {
  customerId: string;
  expoPushToken: string;
  platform: "android" | "ios";
  deviceId?: string;
  appVersion?: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const customer = await getCustomerById(safeCustomerId);

  await CustomerModel.updateMany(
    {
      _id: { $ne: customer._id },
      "pushTokens.expoPushToken": params.expoPushToken,
    },
    { $set: { "pushTokens.$[token].disabledAt": new Date() } },
    { arrayFilters: [{ "token.expoPushToken": params.expoPushToken }] },
  );

  const existingToken = customer.pushTokens.find(
    (token) => token.expoPushToken === params.expoPushToken,
  );

  if (existingToken) {
    existingToken.platform = params.platform;
    existingToken.deviceId = params.deviceId ?? existingToken.deviceId ?? "";
    existingToken.appVersion =
      params.appVersion ?? existingToken.appVersion ?? "";
    existingToken.lastSeenAt = new Date();
    existingToken.disabledAt = null;
  } else {
    if (params.deviceId) {
      customer.pushTokens.forEach((token) => {
        if (
          token.deviceId === params.deviceId &&
          token.expoPushToken !== params.expoPushToken
        ) {
          token.disabledAt = new Date();
        }
      });
    }
    customer.pushTokens.push({
      expoPushToken: params.expoPushToken,
      platform: params.platform,
      deviceId: params.deviceId ?? "",
      appVersion: params.appVersion ?? "",
      lastSeenAt: new Date(),
      disabledAt: null,
    } as never);
  }

  pruneCustomerPushTokens(customer);
  if (params.deviceId) {
    customer.lastKnownDeviceId = params.deviceId;
  }
  await customer.save();

  logger.info(
    {
      customerId: safeCustomerId,
      expoPushToken: params.expoPushToken,
      platform: params.platform,
    },
    "Customer push token registered",
  );

  return {
    registered: true,
  };
}

export async function unregisterCustomerPushToken(params: {
  customerId: string;
  expoPushToken: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const customer = await getCustomerById(safeCustomerId);

  const matchedToken = customer.pushTokens.find(
    (token) => token.expoPushToken === params.expoPushToken,
  );

  if (!matchedToken) {
    return { removed: true };
  }

  matchedToken.disabledAt = new Date();
  matchedToken.lastSeenAt = new Date();
  pruneCustomerPushTokens(customer);
  await customer.save();

  logger.info(
    {
      customerId: safeCustomerId,
      expoPushToken: params.expoPushToken,
    },
    "Customer push token disabled",
  );

  return { removed: true };
}

export async function createCustomerSavedLocation(params: {
  customerId: string;
  label: string;
  address: string;
  addressDetails?: string;
  latitude: number;
  longitude: number;
  source?: "gps" | "manual" | "saved";
  isDefault?: boolean;
}) {
  const customer = await getCustomerById(
    ensureCustomerIdentity(params.customerId),
  );
  const existingLocation = customer.savedLocations[0]?.toObject();

  const nextLocation = {
    ...(existingLocation?._id ? { _id: existingLocation._id } : {}),
    label: params.label,
    address: params.address,
    addressDetails: params.addressDetails ?? "",
    latitude: params.latitude,
    longitude: params.longitude,
    source: params.source ?? "saved",
    isDefault: true,
    serviceArea: await resolveSavedLocationServiceArea({
      latitude: params.latitude,
      longitude: params.longitude,
    }),
    lastUsedAt: new Date(),
  };

  customer.savedLocations = [nextLocation] as typeof customer.savedLocations;
  applyCustomerPrimarySavedLocationSnapshot(customer, nextLocation);
  await customer.save();

  return customer.savedLocations.map((location) =>
    mapSavedLocation(location.toObject()),
  );
}

export async function updateCustomerSavedLocation(params: {
  customerId: string;
  locationId: string;
  label?: string;
  address?: string;
  addressDetails?: string;
  latitude?: number;
  longitude?: number;
  source?: "gps" | "manual" | "saved";
  isDefault?: boolean;
}) {
  const customer = await getCustomerById(
    ensureCustomerIdentity(params.customerId),
  );
  const targetLocation =
    customer.savedLocations.id(params.locationId) ?? customer.savedLocations[0];

  if (!targetLocation) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "LOCATION_NOT_FOUND",
      "Saved location not found",
    );
  }

  if (params.label !== undefined) targetLocation.label = params.label;
  if (params.address !== undefined) targetLocation.address = params.address;
  if (params.addressDetails !== undefined)
    targetLocation.addressDetails = params.addressDetails;
  if (params.latitude !== undefined) targetLocation.latitude = params.latitude;
  if (params.longitude !== undefined)
    targetLocation.longitude = params.longitude;
  if (params.source !== undefined) targetLocation.source = params.source;
  if (params.isDefault !== undefined)
    targetLocation.isDefault = params.isDefault;
  targetLocation.lastUsedAt = new Date();

  const normalized = await refreshSavedLocationServiceAreas(
    normalizeSavedLocations(
      customer.savedLocations.map((location) => location.toObject()),
    ),
  );
  customer.savedLocations = normalized as typeof customer.savedLocations;
  applyCustomerPrimarySavedLocationSnapshot(customer, normalized[0] ?? null);
  await customer.save();

  return customer.savedLocations.map((location) =>
    mapSavedLocation(location.toObject()),
  );
}

export async function setDefaultCustomerSavedLocation(params: {
  customerId: string;
  locationId: string;
}) {
  const customer = await getCustomerById(
    ensureCustomerIdentity(params.customerId),
  );
  const nextLocations = customer.savedLocations.map((location) => ({
    ...location.toObject(),
    isDefault: String(location._id ?? "") === params.locationId,
    lastUsedAt:
      String(location._id ?? "") === params.locationId ? new Date() : location.lastUsedAt,
  }));

  if (!nextLocations.some((location) => location.isDefault)) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "LOCATION_NOT_FOUND",
      "Saved location not found",
    );
  }

  customer.savedLocations = (await refreshSavedLocationServiceAreas(
    normalizeSavedLocations(nextLocations),
  )) as typeof customer.savedLocations;
  applyCustomerPrimarySavedLocationSnapshot(
    customer,
    customer.savedLocations[0]?.toObject?.() ?? customer.savedLocations[0] ?? null,
  );
  await customer.save();

  return customer.savedLocations.map((location) =>
    mapSavedLocation(location.toObject()),
  );
}

export async function touchCustomerSavedLocation(params: {
  customerId: string;
  locationId: string;
}) {
  const customer = await getCustomerById(
    ensureCustomerIdentity(params.customerId),
  );
  const targetLocation =
    customer.savedLocations.id(params.locationId) ?? customer.savedLocations[0];

  if (!targetLocation) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "LOCATION_NOT_FOUND",
      "Saved location not found",
    );
  }

  targetLocation.lastUsedAt = new Date();
  customer.savedLocations = (await refreshSavedLocationServiceAreas(
    normalizeSavedLocations(
      customer.savedLocations.map((location) => location.toObject()),
    ),
  )) as typeof customer.savedLocations;
  applyCustomerPrimarySavedLocationSnapshot(
    customer,
    customer.savedLocations[0]?.toObject?.() ?? customer.savedLocations[0] ?? null,
  );
  await customer.save();

  return customer.savedLocations.map((location) =>
    mapSavedLocation(location.toObject()),
  );
}

export async function removeCustomerSavedLocation(params: {
  customerId: string;
  locationId: string;
}) {
  const customer = await getCustomerById(
    ensureCustomerIdentity(params.customerId),
  );
  const hasLocation = customer.savedLocations.some(
    (location) => location.id === params.locationId,
  );

  if (!hasLocation) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "LOCATION_NOT_FOUND",
      "Saved location not found",
    );
  }

  customer.savedLocations = [] as unknown as typeof customer.savedLocations;
  customer.serviceArea = null;
  customer.lastKnownLocation = {
    label: "",
    address: "",
    addressDetails: "",
    latitude: null,
    longitude: null,
    source: "manual",
    updatedAt: null,
  };
  await customer.save();

  return customer.savedLocations.map((location) =>
    mapSavedLocation(location.toObject()),
  );
}




export async function placeCustomerOrder(params: {
  customerId: string;
  restaurantId: string;
  clientOrderId?: string;
  items: CartInputItem[];
  voucherCode?: string;
  paymentMethod: string;
  paymentReference?: {
    provider?: string;
    bkashSessionId?: string;
    walletNumber?: string;
  };
  note?: string;
  deliveryAddress: CustomerDeliveryAddressInput;
}) {
  const customerId = ensureCustomerIdentity(params.customerId);
  const customer = await getCustomerById(customerId);
  const clientOrderId = normalizeClientOrderId(params.clientOrderId);
  const existingOrder = await findIdempotentOrder(customer.id, clientOrderId);
  if (existingOrder) {
    return {
      order: serializeCustomerOrder(existingOrder),
      quote: buildQuoteFromOrder(existingOrder.toObject()),
    };
  }

  assertPinnedDeliveryCoordinates(params.deliveryAddress);

  const quote = await quoteCustomerCart({
    restaurantId: params.restaurantId,
    items: params.items,
    voucherCode: params.voucherCode,
    customerId,
    latitude: params.deliveryAddress.latitude,
    longitude: params.deliveryAddress.longitude,
  });

  const restaurant = await RestaurantModel.findById(params.restaurantId);

  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    );
  }
  if (isRestaurantOrderingRestricted(restaurant)) {
    const enforcement = getRestaurantEnforcement(restaurant);
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RESTAURANT_RESTRICTED",
      enforcement.customerMessage,
    );
  }

  const orderId = new mongoose.Types.ObjectId();
  const paymentSettings = await getPaymentMethodSettings();
  const shouldAutoAcceptOrder = false;
  const orderNote = trimLimitedString(params.note, "", 240);
  let order: any | null = null;
  let createdOrder = false;

  if (params.paymentMethod === "Cash") {
    if (!paymentSettings.cashOnDeliveryEnabled) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "COD_DISABLED",
        "Cash on delivery is not available right now",
      );
    }

  } else if (params.paymentMethod === "Bkash") {
    const bkashSessionId = params.paymentReference?.bkashSessionId;
    if (!bkashSessionId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "BKASH_PAYMENT_REQUIRED",
        "Complete the bKash payment before placing the order",
      );
    }

    if (!paymentSettings.bkashEnabled) {
      const confirmedSessionExists = await BkashSandboxPaymentSessionModel.exists({
        _id: bkashSessionId,
        customerId,
        restaurantId: params.restaurantId,
        status: "confirmed",
        usedAt: null,
        amount: quote.pricing.total,
      });
      if (!confirmedSessionExists) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "BKASH_DISABLED",
          "bKash payment is not available right now",
        );
      }
    }
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PAYMENT_METHOD_NOT_SUPPORTED",
      "Only Cash and bKash are available right now",
    );
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      if (clientOrderId) {
        const existingInsideTransaction = await OrderModel.findOne({
          customerId: customer.id,
          clientOrderId,
        }).session(session);
        if (existingInsideTransaction) {
          order = existingInsideTransaction;
          return;
        }
      }

      let paymentStatus = "pending";
      let paymentSnapshot: Record<string, unknown> = {};

      if (params.paymentMethod === "Bkash") {
        const paymentSession =
          await BkashSandboxPaymentSessionModel.findOneAndUpdate(
            {
              _id: params.paymentReference?.bkashSessionId,
              customerId,
              restaurantId: params.restaurantId,
              status: "confirmed",
              usedAt: null,
              amount: quote.pricing.total,
            },
            {
              $set: {
                orderId,
                usedAt: new Date(),
              },
            },
            {
              new: true,
              session,
            },
          );

        if (!paymentSession) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            "BKASH_PAYMENT_INVALID",
            "The selected bKash payment is not valid anymore",
          );
        }

        paymentStatus = "paid";
        paymentSnapshot = {
          provider: "Bkash",
          sessionId: paymentSession.id,
          paymentAttemptId: paymentSession.paymentAttemptId
            ? String(paymentSession.paymentAttemptId)
            : "",
          paymentID: paymentSession.sandboxPaymentId,
          transactionId: paymentSession.transactionId,
          walletNumber: paymentSession.walletNumber,
          payerReference: paymentSession.payerReference ?? "",
          customerMsisdn: paymentSession.customerMsisdn ?? "",
          confirmedAt: paymentSession.confirmedAt,
        };
      } else {
        paymentSnapshot = {
          provider: "Cash",
        };
      }

      const placedAt = new Date();
      const initialStatus = shouldAutoAcceptOrder ? "Accepted" : "New";
      const initialHistory = [
        {
          status: "New",
          actor: "customer",
          note: orderNote,
          createdAt: placedAt,
        },
        ...(shouldAutoAcceptOrder
          ? [
              {
                status: "Accepted",
                actor: "system",
                note: "Auto-accepted by restaurant settings",
                createdAt: placedAt,
              },
            ]
          : []),
      ];

      const [created] = await OrderModel.create(
        [
          {
            _id: orderId,
            restaurantId: params.restaurantId,
            customerId: customer.id,
            clientOrderId,
            orderNumber: createOrderNumber(),
            status: initialStatus,
            note: orderNote,
            paymentMethod: params.paymentMethod,
            paymentStatus,
            paymentSnapshot,
            pricing: quote.pricing,
            appliedVouchers: quote.appliedVouchers ?? [],
            serviceAreaSnapshot: quote.serviceArea ?? {},
            customerSnapshot: {
              id: customer.id,
              fullName: customer.fullName,
              phone: customer.phone,
              deliveryAddress: params.deliveryAddress,
            },
            itemsSnapshot: quote.items,
            history: initialHistory,
            timestamps: {
              placedAt,
              ...(shouldAutoAcceptOrder ? { Accepted: placedAt, acceptedAt: placedAt } : {}),
            },
          },
        ],
        { session },
      );
      order = created;
      createdOrder = true;

      if (Array.isArray(quote.appliedVouchers) && quote.appliedVouchers.length) {
        const appliedVouchers: CustomerCacheRecord[] = quote.appliedVouchers;
        // Determine which applied vouchers are single-use-per-customer so the
        // partial unique index can race-free guard against concurrent reuse.
        const appliedVoucherIds = appliedVouchers
          .map((voucher) => voucher.id)
          .filter(Boolean);
        const limitedVouchers = await VoucherModel.find(
          { _id: { $in: appliedVoucherIds } },
          { _id: 1, maxUsesPerUser: 1, maxTotalUses: 1 },
        )
          .session(session)
          .lean();
        const singleUseVoucherIds = new Set(
          limitedVouchers
            .filter((voucher) => voucher.maxUsesPerUser === 1)
            .map((voucher) => String(voucher._id)),
        );
        // Race-free global usage cap: atomically claim a slot for every voucher
        // that has a maxTotalUses limit. A concurrent order at the boundary loses
        // the claim (write conflict / guard fails) and the order is rejected.
        const countedVoucherIds = new Set<string>();
        for (const voucher of limitedVouchers) {
          if (
            !(typeof voucher.maxTotalUses === "number" && voucher.maxTotalUses > 0)
          ) {
            continue;
          }
          const claimed = await VoucherModel.findOneAndUpdate(
            {
              _id: voucher._id,
              $expr: { $lt: ["$redeemedCount", "$maxTotalUses"] },
            },
            { $inc: { redeemedCount: 1 } },
            { session, new: true },
          );
          if (!claimed) {
            throw new AppError(
              StatusCodes.CONFLICT,
              "VOUCHER_USAGE_LIMIT_REACHED",
              "This voucher has reached its maximum usage limit",
            );
          }
          countedVoucherIds.add(String(voucher._id));
        }
        await VoucherRedemptionModel.create(
          appliedVouchers.map((voucher: CustomerCacheRecord) => {
            const discountAmount =
              voucher.discountAmount ?? quote.pricing.discountAmount;
            const ownerFundedAmount = Math.round(
              discountAmount * ((voucher.ownerSharePercent ?? 100) / 100),
            );
            const platformFundedAmount = Math.round(
              discountAmount * ((voucher.platformSharePercent ?? 0) / 100),
            );
            return {
              orderId: created._id,
              restaurantId: params.restaurantId,
              voucherId: voucher.id,
              singleUsePerUser: singleUseVoucherIds.has(String(voucher.id)),
              countedTowardTotal: countedVoucherIds.has(String(voucher.id)),
              voucherSnapshot: {
                ...voucher,
                customerId,
              },
              discountBreakdown: {
                discountAmount,
                ownerFundedAmount,
                platformFundedAmount,
                ownerDiscountCost: ownerFundedAmount,
                platformDiscountCost: platformFundedAmount,
              },
            };
          }),
          { session },
        );
      }

      // Platform-funded menu markdowns applied to this order: enforce usage + budget caps
      // race-free (mirroring the voucher guards) and record one redemption per rule for
      // per-user limits and analytics. The owner is unaffected — platform funds all of it.
      const markdownTotals = new Map<string, number>();
      for (const item of (quote.items ?? []) as CustomerCacheRecord[]) {
        const ruleId = item.appliedMarkdownRuleId
          ? String(item.appliedMarkdownRuleId)
          : "";
        const amount = Math.round(
          (Number(item.markdownPerUnit) || 0) * (Number(item.quantity) || 0),
        );
        if (ruleId && amount > 0) {
          markdownTotals.set(ruleId, (markdownTotals.get(ruleId) ?? 0) + amount);
        }
      }

      if (markdownTotals.size) {
        const markdownRuleDocs = await VoucherModel.find(
          { _id: { $in: [...markdownTotals.keys()] } },
          {
            _id: 1,
            name: 1,
            type: 1,
            discountValue: 1,
            maxUsesPerUser: 1,
            maxTotalUses: 1,
            maxTotalDiscountBudget: 1,
          },
        )
          .session(session)
          .lean();

        const markdownRedemptions: Record<string, unknown>[] = [];
        for (const rule of markdownRuleDocs) {
          const ruleId = String(rule._id);
          const markdownAmount = markdownTotals.get(ruleId) ?? 0;

          let countedTowardTotal = false;
          if (typeof rule.maxTotalUses === "number" && rule.maxTotalUses > 0) {
            const claimed = await VoucherModel.findOneAndUpdate(
              { _id: rule._id, $expr: { $lt: ["$redeemedCount", "$maxTotalUses"] } },
              { $inc: { redeemedCount: 1 } },
              { session, new: true },
            );
            if (!claimed) {
              throw new AppError(
                StatusCodes.CONFLICT,
                "MENU_MARKDOWN_LIMIT_REACHED",
                "This offer has reached its usage limit",
              );
            }
            countedTowardTotal = true;
          }

          let countedTowardBudget = false;
          if (
            typeof rule.maxTotalDiscountBudget === "number" &&
            rule.maxTotalDiscountBudget > 0 &&
            markdownAmount > 0
          ) {
            const claimed = await VoucherModel.findOneAndUpdate(
              {
                _id: rule._id,
                $expr: {
                  $lte: [
                    { $add: ["$consumedDiscountBudget", markdownAmount] },
                    "$maxTotalDiscountBudget",
                  ],
                },
              },
              { $inc: { consumedDiscountBudget: markdownAmount } },
              { session, new: true },
            );
            if (!claimed) {
              throw new AppError(
                StatusCodes.CONFLICT,
                "MENU_MARKDOWN_BUDGET_REACHED",
                "This offer's discount budget has been used up",
              );
            }
            countedTowardBudget = true;
          }

          markdownRedemptions.push({
            orderId: created._id,
            restaurantId: params.restaurantId,
            voucherId: rule._id,
            singleUsePerUser: rule.maxUsesPerUser === 1,
            countedTowardTotal,
            countedTowardBudget,
            budgetConsumed: countedTowardBudget ? markdownAmount : 0,
            voucherSnapshot: {
              id: ruleId,
              name: rule.name,
              surface: "menu_markdown",
              type: rule.type,
              discountValue: rule.discountValue,
              customerId,
            },
            discountBreakdown: {
              discountAmount: markdownAmount,
              ownerFundedAmount: 0,
              platformFundedAmount: markdownAmount,
              ownerDiscountCost: 0,
              platformDiscountCost: markdownAmount,
            },
          });
        }

        if (markdownRedemptions.length) {
          await VoucherRedemptionModel.create(markdownRedemptions, { session });
        }
      }

      const subtotal = quote.pricing.subtotal;
      const commissionRate =
        typeof restaurant.commercial?.commissionRate === "number"
          ? restaurant.commercial.commissionRate
          : 15;
      const discountCost =
        quote.pricing.ownerDiscountCost ?? quote.pricing.discountAmount;
      const platformDiscountCost = quote.pricing.platformDiscountCost ?? 0;
      const commissionBase = subtotal;
      const commission = Math.round(commissionBase * (commissionRate / 100));
      const deliveryCost = quote.pricing.deliveryFee;
      const netAmount = subtotal - commission - discountCost;

      await LedgerEntryModel.create(
        [
          {
            restaurantId: params.restaurantId,
            orderId: created._id,
            sourceEntityType: "order",
            sourceEntityId: created.id,
            entryType: "earning",
            grossAmount: subtotal,
            commissionBase,
            commission,
            discountCost,
            platformDiscountCost,
            deliveryCost,
            netAmount,
            serviceAreaSnapshot: quote.serviceArea ?? {},
            settlementStatus: "pending",
            availableAt: null,
          },
        ],
        { session },
      );
    });
  } catch (error) {
    if (isVoucherPerUserDuplicateError(error)) {
      throw new AppError(
        StatusCodes.CONFLICT,
        "VOUCHER_USER_LIMIT_REACHED",
        "You have already used this voucher",
      );
    }

    if (clientOrderId && isDuplicateKeyError(error)) {
      const duplicateOrder = await findIdempotentOrder(customer.id, clientOrderId);
      if (duplicateOrder) {
        return {
          order: serializeCustomerOrder(duplicateOrder),
          quote: buildQuoteFromOrder(duplicateOrder.toObject()),
        };
      }
    }

    throw error;
  } finally {
    await session.endSession();
  }

  if (!order) {
    const latestOrder = await findIdempotentOrder(customer.id, clientOrderId);
    if (latestOrder) {
      return {
        order: serializeCustomerOrder(latestOrder),
        quote: buildQuoteFromOrder(latestOrder.toObject()),
      };
    }
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "ORDER_NOT_CREATED",
      "Order could not be created",
    );
  }

  if (createdOrder) {
    if (Array.isArray(quote.appliedVouchers) && quote.appliedVouchers.length) {
      customerCartQuoteCache.clear();
    }

    if (params.paymentMethod === "Bkash" && params.paymentReference?.bkashSessionId) {
      const paymentSession = await BkashSandboxPaymentSessionModel.findById(
        params.paymentReference.bkashSessionId,
      ).select("paymentAttemptId walletNumber payerReference customerMsisdn");
      if (paymentSession?.paymentAttemptId) {
        await updateBkashPaymentAttempt(paymentSession.paymentAttemptId, {
          event: "order_finalized",
          status: "order_finalized",
          paymentStatus: "paid",
          orderFinalizationStatus: "finalized",
          orderId: order._id,
          walletNumber: paymentSession.walletNumber ?? "",
          payerReference: paymentSession.payerReference ?? "",
          customerMsisdn: paymentSession.customerMsisdn ?? "",
          timestamps: { orderFinalizedAt: new Date() },
        });
      }
    }

    const orderObject = serializeCustomerOrder(order);
    const platformContent = await getPlatformContent();
    const ownerOrderObject = buildOwnerFacingOrderPayload(orderObject, platformContent);

    emitSocketEvent(
      `owner:${restaurant.ownerId.toString()}`,
      "order.updated",
      ownerOrderObject,
    );
    emitSocketEvent(
      `restaurant:${restaurant.id}`,
      "order.updated",
      orderObject,
    );
    emitSocketEvent(
      `customer:${customer.id}`,
      "customer.order.created",
      orderObject,
    );
    emitSocketEvent("admin:ops", "admin.order.updated", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      path: `/orders?orderId=${order.id}`,
    });
    void createAdminOperationalAlert({
      alertType: "order_placed",
      severity: "info",
      title: `${order.orderNumber} placed`,
      description: `${customer.fullName || "Customer"} placed an order from ${restaurant.name || "restaurant"}.`,
      source: "Orders",
      entityType: "order",
      entityId: order.id,
      path: `/orders?orderId=${order.id}`,
      iconKey: "receipt",
      dedupeKey: `order:${order.id}:placed`,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        customerId: customer.id,
        customerName: customer.fullName ?? "",
        customerPhone: customer.phone ?? "",
        restaurantId: restaurant.id,
        restaurantName: restaurant.name ?? "",
        restaurantPhone: restaurant.contact?.phone ?? "",
        deliveryAddress:
          order.customerSnapshot?.deliveryAddress?.addressLine ??
          order.customerSnapshot?.deliveryAddress?.addressDetails ??
          "",
        total: order.pricing?.total ?? 0,
        placedAt: order.createdAt?.toISOString?.() ?? new Date().toISOString(),
      },
    }).catch((error) => {
      logger.warn(
        { error, orderId: order.id },
        "Failed to create admin order placed alert",
      );
    });

    enqueueBackgroundTask("customer.order_created.owner_notification", async () => {
      await createOwnerNotification({
        ownerId: restaurant.ownerId.toString(),
        restaurantId: restaurant.id,
        type: "order",
        eventType: "order.created",
        entityType: "order",
        entityId: order.id,
        title: "New order received",
        description: `Order ${order.orderNumber} has been placed.`,
        titleBn: "নতুন অর্ডার এসেছে",
        descriptionBn: `অর্ডার ${order.orderNumber} প্লেস হয়েছে।`,
        actionPath: `/orders?orderId=${order.id}`,
      });
    })

    enqueueBackgroundTask("customer.order_created.owner_push", async () => {
      await sendLocalizedPushToOwner({
        ownerId: restaurant.ownerId.toString(),
        en: {
          title: "New order received",
          body: `Order ${order.orderNumber} is waiting for action.`,
        },
        bn: {
          title: "নতুন অর্ডার এসেছে",
          body: `অর্ডার ${order.orderNumber} আপনার action-এর অপেক্ষায় আছে।`,
        },
        data: {
          type: "order.created",
          orderId: order.id,
          path: `/orders/${order.id}`
        }
      })
    })
  }

  return {
    order: serializeCustomerOrder(order),
    quote,
  };
}

export async function initiateBkashPayment(params: {
  customerId: string;
  restaurantId: string;
  clientOrderId?: string;
  items: CartInputItem[];
  voucherCode?: string;
  note?: string;
  walletNumber: string;
  deliveryAddress: CustomerDeliveryAddressInput;
}) {
  const customerId = ensureCustomerIdentity(params.customerId);
  await getCustomerById(customerId);
  const paymentSettings = await getPaymentMethodSettings();

  if (!paymentSettings.bkashEnabled) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "BKASH_DISABLED",
      "bKash payment is not available right now",
    );
  }

  if (!/^01\d{9}$/.test(params.walletNumber)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_BKASH_NUMBER",
      "Enter a valid bKash number",
    );
  }

  assertPinnedDeliveryCoordinates(params.deliveryAddress);

  const quote = await quoteCustomerCart({
    restaurantId: params.restaurantId,
    items: params.items,
    voucherCode: params.voucherCode,
    customerId,
    latitude: params.deliveryAddress.latitude,
    longitude: params.deliveryAddress.longitude,
  });

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const payerReference = params.walletNumber;
  const orderNote = trimLimitedString(params.note, "", 240);
  const checkoutSnapshot = {
    clientOrderId: normalizeClientOrderId(params.clientOrderId),
    items: params.items,
    voucherCode: params.voucherCode ?? "",
    note: orderNote,
    deliveryAddress: params.deliveryAddress,
    serviceArea: quote.serviceArea ?? null,
  };
  const session = await BkashSandboxPaymentSessionModel.create({
    customerId,
    restaurantId: params.restaurantId,
    walletNumber: params.walletNumber,
    payerReference,
    amount: quote.pricing.total,
    voucherCode: params.voucherCode ?? "",
    checkoutSnapshot,
    status: "initiated",
    expiresAt,
  });
  const attempt = await BkashPaymentAttemptModel.create({
    customerId,
    restaurantId: params.restaurantId,
    sessionId: session._id,
    clientOrderId: checkoutSnapshot.clientOrderId,
    walletNumber: params.walletNumber,
    walletNumberMasked: maskBkashWalletNumber(params.walletNumber),
    payerReference,
    amount: quote.pricing.total,
    voucherCode: params.voucherCode ?? "",
    status: "initiated",
    paymentStatus: "unpaid",
    orderFinalizationStatus: "not_started",
    checkoutSnapshot,
    initiatedAt: new Date(),
    expiresAt,
    events: [
      {
        event: "payment_initiated",
        status: "initiated",
        paymentStatus: "unpaid",
        note: "Customer opened bKash checkout",
        occurredAt: new Date(),
      },
    ],
  });
  session.paymentAttemptId = attempt._id;
  await session.save();

  const callbackURL = `${env.BACKEND_PUBLIC_URL}${env.API_PREFIX}/customer/payments/bkash/callback?sessionId=${session.id}`;

  let createdPayment: Awaited<ReturnType<typeof createBkashUrlPayment>>;
  try {
    createdPayment = await createBkashUrlPayment({
      amount: quote.pricing.total,
      payerReference,
      merchantInvoiceNumber: `FB-${Date.now()}`,
      callbackURL,
    });
  } catch (error) {
    session.status = "failed";
    await session.save();
    await updateBkashPaymentAttempt(attempt._id, {
      event: "provider_create_failed",
      status: "provider_create_failed",
      paymentStatus: "failed",
      orderFinalizationStatus: "not_applicable",
      failureStage: "create_payment",
      failureReason: getErrorMessage(error),
      reason: getErrorMessage(error),
      timestamps: { failedAt: new Date() },
    });
    throw error;
  }

  session.sandboxPaymentId = createdPayment.paymentID;
  await session.save();
  await updateBkashPaymentAttempt(attempt._id, {
    event: "provider_payment_created",
    status: "provider_created",
    paymentStatus: "unpaid",
    paymentID: createdPayment.paymentID,
    providerResponse: createdPayment,
    timestamps: { providerCreatedAt: new Date() },
  });

  return {
    sessionId: session.id,
    paymentID: createdPayment.paymentID,
    bkashURL: createdPayment.bkashURL,
    amount: quote.pricing.total,
    walletNumber: params.walletNumber,
    expiresAt: expiresAt.toISOString(),
  };
}

function appendBkashReturnParams(
  redirectUrlBase: string,
  params: Record<string, string | undefined>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, value);
  });
  return `${redirectUrlBase}?${searchParams.toString()}`;
}

function getBkashCheckoutSnapshot(session: any) {
  const snapshot = session.checkoutSnapshot ?? {};
  const deliveryAddress = snapshot.deliveryAddress ?? {};
  if (
    !Array.isArray(snapshot.items) ||
    !snapshot.items.length ||
    typeof deliveryAddress.label !== "string" ||
    typeof deliveryAddress.addressLine !== "string" ||
    typeof deliveryAddress.latitude !== "number" ||
    typeof deliveryAddress.longitude !== "number"
  ) {
    return null;
  }

  return {
    clientOrderId: normalizeClientOrderId(snapshot.clientOrderId),
    items: snapshot.items as CartInputItem[],
    voucherCode:
      typeof snapshot.voucherCode === "string" && snapshot.voucherCode.trim()
        ? snapshot.voucherCode.trim()
        : undefined,
    note: typeof snapshot.note === "string" ? snapshot.note : "",
    deliveryAddress: {
      label: deliveryAddress.label,
      addressLine: deliveryAddress.addressLine,
      addressDetails:
        typeof deliveryAddress.addressDetails === "string"
          ? deliveryAddress.addressDetails
          : undefined,
      latitude: deliveryAddress.latitude,
      longitude: deliveryAddress.longitude,
    } satisfies CustomerDeliveryAddressInput,
  };
}

async function finalizeConfirmedBkashSessionOrder(session: any) {
  if (session.orderId) {
    await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "order_already_finalized",
      status: "order_finalized",
      paymentStatus: "paid",
      orderFinalizationStatus: "finalized",
      orderId: session.orderId,
      walletNumber: session.walletNumber ?? "",
      payerReference: session.payerReference ?? "",
      customerMsisdn: session.customerMsisdn ?? "",
      timestamps: { orderFinalizedAt: session.updatedAt ?? new Date() },
    });
    return String(session.orderId);
  }

  const checkoutSnapshot = getBkashCheckoutSnapshot(session);
  if (!checkoutSnapshot) {
    const updatedAttempt = await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "order_finalize_failed",
      status: "order_finalize_failed",
      paymentStatus: "paid",
      orderFinalizationStatus: "failed",
      failureStage: "checkout_snapshot",
      failureReason: "Checkout snapshot is incomplete",
      reason: "Checkout snapshot is incomplete",
      timestamps: { failedAt: new Date() },
    });
    if (updatedAttempt) {
      enqueueAdminBkashPaidWithoutOrderAlert({
        attempt: updatedAttempt.toObject(),
        paymentID: session.sandboxPaymentId ?? "",
        transactionId: session.transactionId ?? "",
        reason: "Checkout snapshot is incomplete",
        failureStage: "checkout_snapshot",
      });
    }
    return "";
  }

  try {
    const result = await placeCustomerOrder({
      customerId: String(session.customerId ?? ""),
      restaurantId: String(session.restaurantId ?? ""),
      clientOrderId: checkoutSnapshot.clientOrderId,
      items: checkoutSnapshot.items,
      voucherCode: checkoutSnapshot.voucherCode,
      note: checkoutSnapshot.note,
      paymentMethod: "Bkash",
      paymentReference: {
        provider: "Bkash",
        bkashSessionId: session.id,
        walletNumber: session.walletNumber,
      },
      deliveryAddress: checkoutSnapshot.deliveryAddress,
    });
    return String(result.order?._id ?? result.order?.id ?? "");
  } catch (error) {
    const updatedAttempt = await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "order_finalize_failed",
      status: "order_finalize_failed",
      paymentStatus: "paid",
      orderFinalizationStatus: "failed",
      failureStage: "order_finalization",
      failureReason: getErrorMessage(error),
      reason: getErrorMessage(error),
      timestamps: { failedAt: new Date() },
    });
    if (updatedAttempt) {
      enqueueAdminBkashPaidWithoutOrderAlert({
        attempt: updatedAttempt.toObject(),
        paymentID: session.sandboxPaymentId ?? "",
        transactionId: session.transactionId ?? "",
        reason: getErrorMessage(error),
        failureStage: "order_finalization",
      });
    }
    logger.error(
      {
        err: error,
        bkashSessionId: session.id,
      },
      "bKash payment confirmed but automatic order finalization failed",
    );
    return "";
  }
}

export async function handleBkashCallback(params: {
  sessionId: string;
  status?: string;
  paymentID?: string;
}) {
  const redirectUrlBase = `${env.BACKEND_PUBLIC_URL}${env.API_PREFIX}/customer/payments/bkash/return`;
  const session = await BkashSandboxPaymentSessionModel.findById(
    params.sessionId,
  );

  if (!session) {
    return `${redirectUrlBase}?status=failed`;
  }

  if (
    session.status === "confirmed" &&
    params.paymentID &&
    session.sandboxPaymentId === params.paymentID
  ) {
    await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "callback_duplicate_success",
      status: "confirmed_paid",
      paymentStatus: "paid",
      paymentID: params.paymentID,
      transactionId: session.transactionId ?? "",
      walletNumber: session.walletNumber,
      payerReference: session.payerReference ?? "",
      customerMsisdn: session.customerMsisdn ?? "",
      note: "bKash sent a duplicate success callback",
      timestamps: { callbackAt: new Date() },
    });
    const orderId = await finalizeConfirmedBkashSessionOrder(session);
    return appendBkashReturnParams(redirectUrlBase, {
      status: "success",
      sessionId: session.id,
      transactionId: session.transactionId ?? "",
      confirmedAt: session.confirmedAt?.toISOString() ?? new Date().toISOString(),
      walletNumber: session.walletNumber,
      paymentID: session.sandboxPaymentId ?? "",
      orderId: orderId || undefined,
    });
  }

  if (params.status !== "success" || !params.paymentID) {
    session.status = params.status === "cancel" ? "cancelled" : "failed";
    await session.save();
    await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: params.status === "cancel" ? "customer_cancelled" : "callback_failed",
      status: params.status === "cancel" ? "customer_cancelled" : "callback_failed",
      paymentStatus: params.status === "cancel" ? "cancelled" : "failed",
      orderFinalizationStatus: "not_applicable",
      paymentID: params.paymentID ?? session.sandboxPaymentId ?? "",
      failureStage: "callback",
      failureReason:
        params.status === "cancel"
          ? "Customer cancelled checkout"
          : `Callback returned ${params.status || "unknown"} status`,
      reason:
        params.status === "cancel"
          ? "Customer cancelled checkout"
          : `Callback returned ${params.status || "unknown"} status`,
      metadata: { callbackStatus: params.status ?? "" },
      timestamps: { callbackAt: new Date(), failedAt: new Date() },
    });
    return `${redirectUrlBase}?status=${params.status === "cancel" ? "cancelled" : "failed"}&sessionId=${session.id}&walletNumber=${encodeURIComponent(
      session.walletNumber,
    )}`;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    session.status = "expired";
    await session.save();
    await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "payment_expired",
      status: "expired",
      paymentStatus: "expired",
      orderFinalizationStatus: "not_applicable",
      paymentID: params.paymentID,
      failureStage: "expiry",
      failureReason: "bKash callback arrived after checkout expiry",
      reason: "bKash callback arrived after checkout expiry",
      timestamps: { callbackAt: new Date(), failedAt: new Date() },
    });
    return `${redirectUrlBase}?status=expired&sessionId=${session.id}&walletNumber=${encodeURIComponent(
      session.walletNumber,
    )}`;
  }

  try {
    await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "callback_success",
      status: "callback_success",
      paymentStatus: "unpaid",
      paymentID: params.paymentID,
      metadata: { callbackStatus: params.status ?? "" },
      timestamps: { callbackAt: new Date() },
    });
    const executeResponse = await executeBkashPayment(params.paymentID);

    session.status = "confirmed";
    session.sandboxPaymentId = params.paymentID;
    session.transactionId = executeResponse.trxID ?? "";
    session.payerReference = executeResponse.payerReference ?? session.payerReference ?? "";
    session.customerMsisdn = executeResponse.customerMsisdn ?? session.customerMsisdn ?? "";
    session.confirmedAt = new Date();
    await session.save();
    await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "payment_executed",
      status: "confirmed_paid",
      paymentStatus: "paid",
      paymentID: params.paymentID,
      transactionId: executeResponse.trxID ?? "",
      walletNumber: session.walletNumber,
      payerReference: session.payerReference ?? "",
      customerMsisdn: session.customerMsisdn ?? "",
      providerResponse: executeResponse,
      timestamps: {
        executedAt: new Date(),
        confirmedAt: session.confirmedAt,
      },
    });
    const orderId = await finalizeConfirmedBkashSessionOrder(session);

    return appendBkashReturnParams(redirectUrlBase, {
      status: "success",
      sessionId: session.id,
      transactionId: session.transactionId,
      confirmedAt: session.confirmedAt.toISOString(),
      walletNumber: session.walletNumber,
      paymentID: session.sandboxPaymentId ?? "",
      orderId: orderId || undefined,
    });
  } catch (error) {
    session.status = "failed";
    await session.save();
    await updateBkashPaymentAttempt(session.paymentAttemptId, {
      event: "execute_failed",
      status: "execute_failed",
      paymentStatus: "failed",
      orderFinalizationStatus: "not_applicable",
      paymentID: params.paymentID,
      failureStage: "execute_payment",
      failureReason: getErrorMessage(error),
      reason: getErrorMessage(error),
      timestamps: { failedAt: new Date() },
    });
    return `${redirectUrlBase}?status=failed&sessionId=${session.id}&walletNumber=${encodeURIComponent(
      session.walletNumber,
    )}`;
  }
}

export async function reconcileBkashPaymentAttemptFromGateway(params: {
  attemptId: string;
  adminId?: string;
  note?: string;
}) {
  const attempt = await BkashPaymentAttemptModel.findById(params.attemptId);

  if (!attempt) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "BKASH_ATTEMPT_NOT_FOUND",
      "bKash payment attempt not found",
    );
  }

  const paymentID = safeStringValue(attempt.paymentID);
  if (!paymentID) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "BKASH_PAYMENT_ID_MISSING",
      "bKash payment ID is not available yet",
    );
  }

  let providerResponse: Awaited<ReturnType<typeof queryBkashPaymentStatus>>;
  try {
    providerResponse = await queryBkashPaymentStatus(paymentID);
  } catch (error) {
    await updateBkashPaymentAttempt(attempt._id, {
      event: "gateway_query_failed",
      status: safeStringValue(attempt.status),
      paymentStatus: safeStringValue(attempt.paymentStatus),
      failureStage: "query_payment",
      failureReason: getErrorMessage(error),
      reason: getErrorMessage(error),
      metadata: {
        adminId: params.adminId ?? "",
        note: params.note ?? "",
      },
      timestamps: { failedAt: new Date() },
    });
    throw error;
  }

  const transactionStatus = safeStringValue(providerResponse.transactionStatus);
  const transactionId = safeStringValue(providerResponse.trxID);
  const payerReference = safeStringValue(providerResponse.payerReference);
  const customerMsisdn = safeStringValue(providerResponse.customerMsisdn);
  const providerEvent = {
    providerResponse,
    metadata: {
      adminId: params.adminId ?? "",
      note: params.note ?? "",
      transactionStatus,
    },
  };

  if (isBkashCompletedTransaction(transactionStatus, providerResponse)) {
    let session = attempt.sessionId
      ? await BkashSandboxPaymentSessionModel.findById(attempt.sessionId)
      : null;

    if (!session) {
      session = await BkashSandboxPaymentSessionModel.findOne({
        sandboxPaymentId: paymentID,
      });
    }

    if (!session) {
      const updatedAttempt = await updateBkashPaymentAttempt(attempt._id, {
        event: "gateway_reconcile_paid_missing_session",
        status: "order_finalize_failed",
        paymentStatus: "paid",
        orderFinalizationStatus: "failed",
        paymentID,
        transactionId,
        payerReference,
        customerMsisdn,
        failureStage: "missing_session",
        failureReason:
          "Gateway says payment is completed, but checkout session is no longer available",
        reason:
          "Gateway says payment is completed, but checkout session is no longer available",
        timestamps: {
          executedAt: new Date(),
          confirmedAt: new Date(),
          failedAt: new Date(),
        },
        ...providerEvent,
      });

      if (updatedAttempt) {
        enqueueAdminBkashPaidWithoutOrderAlert({
          attempt: updatedAttempt.toObject(),
          paymentID,
          transactionId,
          reason:
            "Gateway says payment is completed, but checkout session is no longer available",
          failureStage: "missing_session",
        });
      }

      return {
        status: "paid_without_order",
        paymentID,
        transactionId,
        orderId: "",
        attempt: updatedAttempt?.toObject?.() ?? null,
      };
    }

    session.status = "confirmed";
    session.sandboxPaymentId = paymentID;
    session.transactionId = transactionId || session.transactionId || "";
    session.payerReference = payerReference || session.payerReference || "";
    session.customerMsisdn = customerMsisdn || session.customerMsisdn || "";
    session.confirmedAt = session.confirmedAt ?? new Date();
    await session.save();

    await updateBkashPaymentAttempt(attempt._id, {
      event: "gateway_reconcile_paid",
      status: "confirmed_paid",
      paymentStatus: "paid",
      paymentID,
      transactionId: session.transactionId,
      walletNumber: session.walletNumber ?? "",
      payerReference: session.payerReference ?? "",
      customerMsisdn: session.customerMsisdn ?? "",
      timestamps: {
        executedAt: new Date(),
        confirmedAt: session.confirmedAt,
      },
      ...providerEvent,
    });

    const orderId = await finalizeConfirmedBkashSessionOrder(session);
    const refreshedAttempt = await BkashPaymentAttemptModel.findById(attempt._id);
    if (!orderId && refreshedAttempt) {
      enqueueAdminBkashPaidWithoutOrderAlert({
        attempt: refreshedAttempt.toObject(),
        paymentID,
        transactionId: session.transactionId,
        reason: "Gateway confirmed the bKash payment, but order finalization did not complete.",
        failureStage: "order_finalization",
      });
    }

    return {
      status: orderId ? "order_finalized" : "paid_without_order",
      paymentID,
      transactionId: session.transactionId,
      orderId,
      attempt: refreshedAttempt?.toObject?.() ?? null,
    };
  }

  if (isBkashTerminalFailedTransaction(transactionStatus)) {
    const paymentStatus =
      transactionStatus.trim().toLowerCase().includes("cancel") ? "cancelled" : "failed";
    const status =
      paymentStatus === "cancelled" ? "customer_cancelled" : "callback_failed";
    const updatedAttempt = await updateBkashPaymentAttempt(attempt._id, {
      event: "gateway_reconcile_terminal",
      status,
      paymentStatus,
      orderFinalizationStatus: "not_applicable",
      paymentID,
      failureStage: "query_payment",
      failureReason: `Gateway transaction status is ${transactionStatus || "terminal"}`,
      reason: `Gateway transaction status is ${transactionStatus || "terminal"}`,
      timestamps: { failedAt: new Date() },
      ...providerEvent,
    });

    return {
      status: paymentStatus,
      paymentID,
      transactionId,
      orderId: safeStringValue(attempt.orderId ? String(attempt.orderId) : ""),
      attempt: updatedAttempt?.toObject?.() ?? null,
    };
  }

  const updatedAttempt = await updateBkashPaymentAttempt(attempt._id, {
    event: "gateway_reconcile_pending",
    status: safeStringValue(attempt.status),
    paymentStatus: safeStringValue(attempt.paymentStatus, "unpaid"),
    paymentID,
    note: `Gateway transaction status is ${transactionStatus || "pending"}`,
    ...providerEvent,
  });

  return {
    status: "pending",
    paymentID,
    transactionId,
    orderId: safeStringValue(attempt.orderId ? String(attempt.orderId) : ""),
    attempt: updatedAttempt?.toObject?.() ?? null,
  };
}

export async function processPendingBkashPaymentAttemptReconciliation() {
  if (!hasBkashGatewayConfig()) {
    return { checked: 0, reconciled: 0, failed: 0, skipped: true };
  }

  const now = Date.now();
  const createdBefore = new Date(now - 2 * 60 * 1000);
  const updatedBefore = new Date(now - 5 * 60 * 1000);
  const recentAfter = new Date(now - 2 * 60 * 60 * 1000);
  const attempts = await BkashPaymentAttemptModel.find({
    paymentID: { $exists: true, $type: "string", $gt: "" },
    paymentStatus: "unpaid",
    status: { $in: ["initiated", "provider_created", "callback_success"] },
    createdAt: { $gte: recentAfter, $lte: createdBefore },
    updatedAt: { $lte: updatedBefore },
  })
    .sort({ createdAt: 1 })
    .limit(5)
    .select("_id")
    .lean();

  let reconciled = 0;
  let failed = 0;

  for (const attempt of attempts) {
    try {
      await reconcileBkashPaymentAttemptFromGateway({
        attemptId: String(attempt._id),
        adminId: "system",
        note: "Scheduled bKash payment reconciliation",
      });
      reconciled += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        {
          err: error,
          bkashPaymentAttemptId: String(attempt._id),
        },
        "Scheduled bKash payment reconciliation failed",
      );
    }
  }

  return {
    checked: attempts.length,
    reconciled,
    failed,
    skipped: false,
  };
}

export async function listCustomerOrders(
  customerId: string,
  params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    statusGroup?: "live" | "history";
  },
) {
  const safeCustomerId = ensureCustomerIdentity(customerId);
  const { page, pageSize } = normalizePageBounds(params);
  const statusFilter = params?.status
    ? { status: params.status }
    : params?.statusGroup === "live"
      ? { status: { $in: ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"] } }
      : params?.statusGroup === "history"
        ? { status: { $in: ["Delivered", "Rejected", "Cancelled"] } }
        : {};
  const orderQuery = {
    customerId: safeCustomerId,
    ...statusFilter,
  };
  const shouldLoadReviewFlags =
    params?.status === "Delivered" ||
    params?.statusGroup === "history" ||
    (!params?.status && !params?.statusGroup);
  const orders = await OrderModel.find(orderQuery)
    .select(CUSTOMER_ORDER_LIST_SELECT)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  const orderIds = orders.map((order) => order._id);

  const reviews = shouldLoadReviewFlags && orderIds.length
    ? await ReviewModel.find({
        customerId: safeCustomerId,
        orderId: { $in: orderIds },
      })
        .select("orderId rating")
        .lean()
    : [];

  const reviewedOrderIds = new Set(
    reviews.map((review) => review.orderId?.toString()),
  );
  const restaurantIds = [
    ...new Set(orders.map((order) => String(order.restaurantId ?? "")).filter(Boolean)),
  ];
  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
        .select("_id preparationTimeMinutes")
        .lean()
    : [];
  const restaurantById = new Map(
    restaurants.map((restaurant) => [String(restaurant._id ?? ""), restaurant]),
  );

  return orders.map((order) => {
    const orderObject = order as Record<string, any>;
    return {
      ...orderObject,
      note: getCustomerOrderNote(orderObject),
      preparationTiming: buildOrderPreparationTiming({
        order: orderObject,
        restaurant: restaurantById.get(String(order.restaurantId ?? "")),
      }),
      hasCustomerReview: reviewedOrderIds.has(String(order._id ?? "")),
    };
  });
}

function toLatLng(value: unknown): LatLng | null {
  const point = value as { latitude?: unknown; longitude?: unknown } | null;
  if (
    point &&
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude)
  ) {
    return { latitude: point.latitude, longitude: point.longitude };
  }
  return null;
}

export async function getCustomerOrderDetails(params: {
  customerId: string;
  orderId: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const order = await OrderModel.findOne({
    _id: params.orderId,
    customerId: safeCustomerId,
  });

  if (!order) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  const review = await ReviewModel.findOne({
    orderId: order._id,
    customerId: safeCustomerId,
  });

  const orderObject = order.toObject();
  const restaurant = await RestaurantModel.findById(order.restaurantId).lean();
  const queuedTrackingMeta = await buildQueuedDeliveryTrackingMeta(orderObject);
  const paymentSettings = await getPaymentMethodSettings();

  // Real road route + ETA for the live map. Before pickup we preview the
  // restaurant -> customer leg; once picked up we route from the rider's live
  // position. getRouteMetrics is cached + Haversine-backed, so this stays cheap.
  const customerCoord = toLatLng(orderObject.customerSnapshot?.deliveryAddress);
  const riderCoord = toLatLng(
    (orderObject as Record<string, any>).riderTracking?.currentLocation,
  );
  const restaurantCoord = toLatLng(restaurant?.location);
  const routeOrigin =
    order.status === "PickedUp" && riderCoord ? riderCoord : restaurantCoord;
  const routeToCustomer = customerCoord
    ? await getOrderRouteMetrics({
        orderId: String(order._id),
        origin: routeOrigin,
        destination: customerCoord,
        source: "customer_tracking",
        sessionKey:
          order.status === "PickedUp" && riderCoord ? "delivery_leg" : "preview_customer",
      })
    : null;
  const paymentSnapshot =
    orderObject.paymentSnapshot && typeof orderObject.paymentSnapshot === "object"
      ? {
          ...orderObject.paymentSnapshot,
          refundEtaMinutes: paymentSettings.bkashRefundEtaMinutes,
        }
      : { refundEtaMinutes: paymentSettings.bkashRefundEtaMinutes };

  return {
    ...orderObject,
    note: getCustomerOrderNote(orderObject),
    paymentSnapshot,
    preparationTiming: buildOrderPreparationTiming({
      order: orderObject,
      restaurant,
    }),
    riderTracking: decorateTrackingSnapshot(
      {
        ...((orderObject as Record<string, any>).riderTracking ?? {}),
        ...queuedTrackingMeta,
      },
      order.status,
    ),
    routeToCustomer,
    customerReview: review
      ? {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          ownerReply: review.ownerReply?.message
            ? {
                message: review.ownerReply.message,
                createdAt: review.ownerReply.createdAt,
                updatedAt: review.ownerReply.updatedAt,
              }
            : null,
        }
      : null,
  };
}

export async function cancelCustomerOrder(params: {
  customerId: string;
  orderId: string;
  reason?: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const order = await OrderModel.findOne({
    _id: params.orderId,
    customerId: safeCustomerId,
  });

  if (!order) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  if (order.status !== "New") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_CANCELLATION_NOT_ALLOWED",
      "This order can no longer be cancelled",
    );
  }

  order.status = "Cancelled";
  order.cancelledBy = "customer";
  order.terminalReason = params.reason ?? "customer_cancelled";
  const cancelledAt = new Date();
  if (order.paymentMethod === "Bkash" && order.paymentStatus === "paid") {
    order.paymentStatus = "refund_pending";
    order.paymentSnapshot = {
      ...(order.paymentSnapshot ?? {}),
      refundStatus: "pending",
      refundRequestedAt: cancelledAt,
      refundReason: params.reason ?? "customer_cancelled",
    };
    order.markModified("paymentSnapshot");
  } else if (order.paymentMethod === "Cash" && order.paymentStatus !== "paid") {
    order.paymentStatus = "cancelled";
  }
  order.history.push({
    status: "Cancelled",
    actor: "customer",
    note: params.reason ?? "",
    createdAt: cancelledAt,
  });
  if (order.history.length > MAX_ORDER_HISTORY_ENTRIES) {
    order.history.splice(0, order.history.length - MAX_ORDER_HISTORY_ENTRIES);
  }
  order.timestamps = {
    ...order.timestamps,
    Cancelled: cancelledAt,
    cancelledAt: cancelledAt,
  };

  await order.save();
  await Promise.all([
    syncOrderLedgerForFinalStatus({
      restaurantId: order.restaurantId.toString(),
      orderId: order.id,
      nextStatus: "Cancelled",
      finalizedAt: cancelledAt,
    }),
    releaseVoucherRedemptionsForOrder(order._id, "customer_cancelled"),
  ]);

  const restaurant = await RestaurantModel.findById(order.restaurantId);
  if (restaurant) {
    const platformContent = await getPlatformContent();
    const ownerOrderObject = buildOwnerFacingOrderPayload(
      order.toObject(),
      platformContent,
    );

    enqueueBackgroundTask("customer.order_cancelled.owner_notification", async () => {
      await createOwnerNotification({
        ownerId: restaurant.ownerId.toString(),
        restaurantId: restaurant.id,
        type: "order",
        eventType: "order.updated",
        entityType: "order",
        entityId: order.id,
        title: "Order cancelled by customer",
        description: `Order ${order.orderNumber} was cancelled by the customer.`,
        titleBn: "কাস্টমার অর্ডার ক্যানসেল করেছে",
        descriptionBn: `অর্ডার ${order.orderNumber} কাস্টমার ক্যানসেল করেছে।`,
        actionPath: `/orders?orderId=${order.id}`,
      });
    })

    enqueueBackgroundTask("customer.order_cancelled.owner_push", async () => {
      await sendLocalizedPushToOwner({
        ownerId: restaurant.ownerId.toString(),
        en: {
          title: "Order cancelled",
          body: `Order ${order.orderNumber} was cancelled by the customer. You can stop preparing it.`,
        },
        bn: {
          title: "অর্ডার ক্যানসেল হয়েছে",
          body: `অর্ডার ${order.orderNumber} কাস্টমার ক্যানসেল করেছে। প্রস্তুত করা বন্ধ করতে পারেন।`,
        },
        data: {
          type: "order.cancelled",
          orderId: order.id,
          path: `/orders/${order.id}`,
        },
      })
    })

    emitSocketEvent(
      `owner:${restaurant.ownerId.toString()}`,
      "order.updated",
      ownerOrderObject,
    );
    emitSocketEvent(
      `restaurant:${restaurant.id}`,
      "order.updated",
      order.toObject(),
    );
  }

  emitSocketEvent(
    `customer:${safeCustomerId}`,
    "customer.order.updated",
    order.toObject(),
  );
  emitSocketEvent("admin:ops", "admin.order.updated", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    path: `/orders?orderId=${order.id}`,
  });

  enqueueAdminOrderTerminalExceptionAlert({
    order: order.toObject(),
    actor: "customer",
    nextStatus: "Cancelled",
    previousStatus: "New",
    reason: params.reason,
    occurredAt: cancelledAt,
    refundOnly: true,
  });

  return order;
}

export async function createCustomerReview(params: {
  customerId: string;
  orderId: string;
  rating: number;
  comment?: string;
  riderRating?: number;
  riderComment?: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const order = await OrderModel.findOne({
    _id: params.orderId,
    customerId: safeCustomerId,
    status: "Delivered",
  });

  if (!order) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "REVIEW_NOT_ALLOWED",
      "Reviews can only be added to delivered orders",
    );
  }

  const existingReview = await ReviewModel.findOne({
    orderId: order._id,
    customerId: safeCustomerId,
  });

  if (existingReview) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "REVIEW_ALREADY_EXISTS",
      "A review has already been submitted for this order",
    );
  }

  const review = await ReviewModel.create({
    restaurantId: order.restaurantId,
    customerId: safeCustomerId,
    orderId: order._id,
    rating: params.rating,
    comment: params.comment ?? "",
    riderId: String(order.riderId ?? ""),
    riderRating:
      typeof params.riderRating === "number" ? params.riderRating : null,
    riderComment: params.riderComment ?? "",
  });

  // Stamp the order so the admin orders list can show review state cheaply
  // (without a per-row ReviewModel lookup) and the scheduler stops reminding.
  order.set("reviewRequest", {
    ...((order.get("reviewRequest") ?? {}) as Record<string, unknown>),
    reviewedAt: new Date(),
    rating: params.rating,
    riderRating:
      typeof params.riderRating === "number" ? params.riderRating : null,
  });
  await order.save();

  const restaurant = await RestaurantModel.findById(order.restaurantId);
  if (restaurant) {
    enqueueBackgroundTask("customer.review_created.owner_notification", async () => {
      await createOwnerNotification({
        ownerId: restaurant.ownerId.toString(),
        restaurantId: restaurant.id,
        type: "review",
        eventType: "review.created",
        entityType: "review",
        entityId: review.id,
        title: "New customer review",
        description: `A ${params.rating}-star review was added for order ${order.orderNumber}.`,
        titleBn: "নতুন কাস্টমার রিভিউ",
        descriptionBn: `অর্ডার ${order.orderNumber} এর জন্য ${params.rating}-স্টার রিভিউ যোগ হয়েছে।`,
        actionPath: `/reviews?reviewId=${review.id}`,
      });
    })
  }

  return review;
}

function mapCustomerSupportCase(supportCaseDocument: {
  toObject?: () => Record<string, unknown>;
}) {
  const supportCase =
    typeof supportCaseDocument.toObject === "function"
      ? supportCaseDocument.toObject()
      : supportCaseDocument;

  const supportCaseId = String(
    (supportCase as { _id?: mongoose.Types.ObjectId | string })._id ?? "",
  );
  const attachments = (
    (supportCase as { attachments?: Array<Record<string, unknown>> })
      .attachments ?? []
  ).map((attachment) => ({
    url: String(attachment.url ?? ""),
    publicId: String(attachment.publicId ?? ""),
    fileName: String(attachment.fileName ?? ""),
    fileType: String(attachment.fileType ?? ""),
  }));

  const replies = (
    (supportCase as { replies?: Array<Record<string, unknown>> }).replies ?? []
  )
    .slice(-MAX_SUPPORT_CASE_REPLIES)
    .map((reply, index) => ({
      id: `${supportCaseId}-reply-${index}`,
      senderType: reply.senderType === "customer" ? "customer" : "admin",
      senderName: String(reply.senderName ?? ""),
      message: String(reply.message ?? ""),
      createdAt: new Date(
        typeof reply.createdAt === "string" || reply.createdAt instanceof Date
          ? reply.createdAt
          : Date.now(),
      ).toISOString(),
      attachments: (
        (reply.attachments as Array<Record<string, unknown>> | undefined) ?? []
      ).map((attachment) => ({
        url: String(attachment.url ?? ""),
        publicId: String(attachment.publicId ?? ""),
        fileName: String(attachment.fileName ?? ""),
        fileType: String(attachment.fileType ?? ""),
      })),
    }));

  const createdAt = new Date(
    ((supportCase as { createdAt?: string | Date }).createdAt as
      | string
      | Date
      | undefined) ?? Date.now(),
  ).toISOString();
  const updatedAt = new Date(
    ((supportCase as { updatedAt?: string | Date }).updatedAt as
      | string
      | Date
      | undefined) ?? Date.now(),
  ).toISOString();

  return {
    id: supportCaseId,
    status: String((supportCase as { status?: string }).status ?? "open"),
    subject: String((supportCase as { subject?: string }).subject ?? ""),
    createdAt,
    updatedAt,
    messages: [
      {
        id: `${supportCaseId}-root`,
        senderType: "customer" as const,
        senderName:
          (supportCase as { customerSnapshot?: { fullName?: string } })
            .customerSnapshot?.fullName || "You",
        message: String((supportCase as { message?: string }).message ?? ""),
        createdAt,
        attachments,
      },
      ...replies,
    ],
  };
}

export async function getLatestCustomerSupportCase(customerId: string) {
  const safeCustomerId = ensureCustomerIdentity(customerId);
  const supportCase = await SupportCaseModel.findOne({
    source: "customer",
    customerId: safeCustomerId,
  }).sort({ updatedAt: -1, createdAt: -1 });

  if (!supportCase) {
    return null;
  }

  const mappedSupportCase = mapCustomerSupportCase(supportCase);
  emitSocketEvent(
    `customer:${safeCustomerId}`,
    "customer.support.updated",
    mappedSupportCase,
  );

  return mappedSupportCase;
}

export async function getCustomerSupportCase(params: {
  customerId: string;
  supportCaseId: string;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const supportCase = await SupportCaseModel.findOne({
    _id: params.supportCaseId,
    source: "customer",
    customerId: safeCustomerId,
  });

  if (!supportCase) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "SUPPORT_CASE_NOT_FOUND",
      "Support case not found",
    );
  }

  const mappedSupportCase = mapCustomerSupportCase(supportCase);
  emitSocketEvent(
    `customer:${safeCustomerId}`,
    "customer.support.updated",
    mappedSupportCase,
  );

  return mappedSupportCase;
}

export async function createCustomerSupportCase(params: {
  customerId: string;
  message: string;
  attachments?: Array<{
    url?: string;
    publicId?: string;
    fileName?: string;
    fileType?: string;
  }>;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const customer = await CustomerModel.findById(safeCustomerId);

  if (!customer) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CUSTOMER_NOT_FOUND",
      "Customer not found",
    );
  }

  const message = params.message.trim();
  const supportCase = await SupportCaseModel.create({
    source: "customer",
    customerId: customer._id,
    customerSnapshot: {
      fullName: customer.fullName ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
    },
    requesterSnapshot: {
      fullName: customer.fullName ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      role: "customer",
    },
    kind: "question",
    subject: message.slice(0, 80) || "Customer live chat",
    categoryId: "live_chat",
    message,
    status: "open",
    priority: "medium",
    slaDueAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    history: [
      {
        action: "created",
        actorId: customer.id,
        actorName: customer.fullName ?? "Customer",
        note: message.slice(0, 120),
        createdAt: new Date(),
      },
    ],
    attachments:
      params.attachments?.map((attachment) => ({
        url: attachment.url ?? "",
        publicId: attachment.publicId ?? "",
        fileName: attachment.fileName ?? "",
        fileType: attachment.fileType ?? "",
      })) ?? [],
  });

  await createAdminOperationalAlert({
    alertType: "support_case_created",
    severity: "warning",
    title: `Customer support: ${message.slice(0, 80) || "Live chat"}`,
    description: message.slice(0, 180),
    source: "Support",
    entityType: "support_case",
    entityId: supportCase.id,
    path: `/support?caseId=${supportCase.id}`,
    iconKey: "headphones",
    dedupeKey: `support:${supportCase.id}:created`,
    metadata: {
      supportCaseId: supportCase.id,
      source: "customer",
      priority: "medium",
    },
  });

  return mapCustomerSupportCase(supportCase);
}

export async function appendCustomerSupportCaseMessage(params: {
  customerId: string;
  supportCaseId: string;
  message: string;
  attachments?: Array<{
    url?: string;
    publicId?: string;
    fileName?: string;
    fileType?: string;
  }>;
}) {
  const safeCustomerId = ensureCustomerIdentity(params.customerId);
  const supportCase = await SupportCaseModel.findOne({
    _id: params.supportCaseId,
    source: "customer",
    customerId: safeCustomerId,
  });

  if (!supportCase) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "SUPPORT_CASE_NOT_FOUND",
      "Support case not found",
    );
  }

  const currentReplies =
    (supportCase.toObject().replies as unknown as
      | Array<Record<string, unknown>>
      | undefined) ?? [];

  const nextReplies = currentReplies
    .concat({
      message: params.message.trim(),
      senderType: "customer",
      senderId: safeCustomerId,
      senderName: supportCase.customerSnapshot?.fullName || "Customer",
      attachments:
        params.attachments?.map((attachment) => ({
          url: attachment.url ?? "",
          publicId: attachment.publicId ?? "",
          fileName: attachment.fileName ?? "",
          fileType: attachment.fileType ?? "",
        })) ?? [],
      createdAt: new Date(),
    })
    .slice(-MAX_SUPPORT_CASE_REPLIES);

  supportCase.set("replies", nextReplies);
  if (supportCase.status === "resolved" || supportCase.status === "closed") {
    supportCase.status = "open";
  }
  await supportCase.save();

  const message = params.message.trim();
  const latestReply = nextReplies[nextReplies.length - 1] as
    | Record<string, unknown>
    | undefined;
  await createAdminOperationalAlert({
    alertType: "support_customer_message",
    severity: "warning",
    title: `Customer replied: ${message.slice(0, 80) || "Support message"}`,
    description: message.slice(0, 180),
    source: "Support",
    entityType: "support_case",
    entityId: supportCase.id,
    path: `/support?caseId=${supportCase.id}`,
    iconKey: "headphones",
    dedupeKey: `support:${supportCase.id}:customer_message:${new Date(
      latestReply?.createdAt instanceof Date ||
        typeof latestReply?.createdAt === "string"
        ? latestReply.createdAt
        : Date.now(),
    ).getTime()}`,
    metadata: {
      supportCaseId: supportCase.id,
      source: "customer",
      customerId: safeCustomerId,
      customerName: supportCase.customerSnapshot?.fullName || "Customer",
      customerPhone: supportCase.customerSnapshot?.phone || "",
      replyCount: nextReplies.length,
    },
  });

  return mapCustomerSupportCase(supportCase);
}

const discoverableRestaurantsCache =
  createInMemoryAsyncCache<DiscoverableRestaurantsResult>({
    ttlMs: CUSTOMER_READ_CACHE_TTL_MS,
    maxEntries: CUSTOMER_READ_CACHE_MAX_ENTRIES,
    staleWhileRevalidateMs: 60_000,
  })

const customerDiscoveryHomeCache =
  createInMemoryAsyncCache<CustomerDiscoveryHomeResult>({
    ttlMs: CUSTOMER_READ_CACHE_TTL_MS,
    maxEntries: CUSTOMER_READ_CACHE_MAX_ENTRIES,
    staleWhileRevalidateMs: 60_000,
  })

const popularRestaurantIdsCache =
  createInMemoryAsyncCache<string[]>({
    ttlMs: 2 * 60_000,
    maxEntries: 8,
    staleWhileRevalidateMs: 5 * 60_000,
  })

const customerRestaurantDetailsCache =
  createInMemoryAsyncCache<CustomerRestaurantDetailsResult>({
    ttlMs: CUSTOMER_READ_CACHE_TTL_MS,
    maxEntries: CUSTOMER_READ_CACHE_MAX_ENTRIES,
  })


export function invalidateCustomerRestaurantAvailabilityCaches() {
  discoverableRestaurantsCache.clear();
  customerDiscoveryHomeCache.clear();
  customerRestaurantDetailsCache.clear();
  customerCartQuoteCache.clear();
}

registerPlatformContentInvalidationListener(() => {
  invalidateCustomerRestaurantAvailabilityCaches();
});
