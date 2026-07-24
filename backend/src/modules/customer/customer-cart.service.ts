import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import {
  getPlatformContent,
  getPlatformServiceHours,
} from "../public/content.service";
import { RestaurantModel } from "../auth/auth.model";
import { CategoryModel, MenuItemModel } from "../owner/operational.model";
import { VoucherModel } from "./customer.model";
import {
  computeMarkdownAmount,
  pickRuleForItem,
  type MarkdownRule,
} from "../promotions/menu-markdown";
import { buildActiveMenuMarkdownFilter } from "../promotions/menu-markdown-query";
import { evaluateFirstOrderDiscount } from "./first-order-discount.service";
import {
  applyServiceAreaDeliveryPricing,
  assertLocationInsideServiceArea,
  assertRestaurantMatchesDeliveryServiceArea,
  getServiceAreaRestaurantDistanceKm,
  getServiceHoursOverrideForZone,
  isServiceAreaModeEnabled,
  resolveRestaurantServiceAreaSnapshot,
} from "../service-area/service-area.service";
import { evaluateServiceWindowForOverride } from "../service-area/service-hours";
import {
  buildCacheKey,
  calculateDistanceKm,
  CUSTOMER_READ_CACHE_MAX_ENTRIES,
  CUSTOMER_READ_CACHE_TTL_MS,
  normalizeCacheString,
  roundCacheCoordinate,
  roundCurrencyAmount,
  trimLimitedString,
} from "./customer-shared.util";
import {
  calculateVoucherDiscount,
  resolveActiveVoucher,
  summarizeAppliedVouchers,
} from "./customer-voucher.service";
import type {
  CartInputItem,
  CustomerCacheRecord,
  CustomerCartQuoteResult,
} from "./customer.service";

// Cart pricing & quote: resolves menu items, delivery fee, service-area and
// applied vouchers into a priced quote. Extracted from customer.service.ts.
// Imports only leaf utils / sibling services (no runtime cycle back into
// customer.service.ts — the only customer.service dependency is type-only).

export function getCustomerFacingOrderNoteSetting(restaurant: Record<string, any>) {
  const note = restaurant.settings?.orderSettings?.customerNote ?? {};
  return {
    enabled: note.enabled === true,
    label: trimLimitedString(note.label, "Order note", 80),
    placeholder: trimLimitedString(
      note.placeholder,
      "Cake name, message, or any restaurant instruction",
      160,
    ),
  };
}

function buildCustomerCartQuoteCacheKey(params: {
  restaurantId: string;
  items: Array<{
    itemId: string;
    quantity: number;
    selectedVariantOptions?: Array<{ groupName: string; optionLabel: string }>;
    selectedAddOnOptions?: Array<{ groupName: string; optionLabel: string }>;
  }>;
  voucherCode?: string;
  customerId?: string;
  latitude?: number;
  longitude?: number;
}) {
  return buildCacheKey("customer-cart-quote", {
    restaurantId: normalizeCacheString(params.restaurantId),
    customerId: normalizeCacheString(params.customerId),
    voucherCode: normalizeCacheString(params.voucherCode),
    latitude: roundCacheCoordinate(params.latitude),
    longitude: roundCacheCoordinate(params.longitude),
    items: params.items.map((item) => ({
      itemId: normalizeCacheString(item.itemId),
      quantity: item.quantity,
      selectedVariantOptions: item.selectedVariantOptions ?? [],
      selectedAddOnOptions: item.selectedAddOnOptions ?? [],
    })),
  });
}

function getVisibleRestaurantQuery() {
  return {
    "runtime.isVisible": true,
    "runtime.isOnline": true,
    $or: [
      { "enforcement.status": { $exists: false } },
      { "enforcement.status": { $in: ["active", "under_review"] } },
      { "enforcement.expiresAt": { $lte: new Date() } },
    ],
  };
}

function calculateConfiguredDeliveryFee(params: {
  baseFeeTaka: number;
  distanceSurchargeEnabled: boolean;
  surchargeStartsAfterKm: number;
  surchargeStepMeters: number;
  surchargeAmountTaka: number;
  distanceKm?: number | null;
}) {
  const baseFee = roundCurrencyAmount(params.baseFeeTaka);
  if (!params.distanceSurchargeEnabled) {
    return baseFee;
  }

  const distanceKm =
    typeof params.distanceKm === "number" && Number.isFinite(params.distanceKm)
      ? Math.max(0, params.distanceKm)
      : null;

  if (distanceKm === null || distanceKm <= params.surchargeStartsAfterKm) {
    return baseFee;
  }

  const additionalMeters = (distanceKm - params.surchargeStartsAfterKm) * 1000;
  const steps = Math.ceil(
    additionalMeters / Math.max(params.surchargeStepMeters, 1),
  );
  return baseFee + steps * roundCurrencyAmount(params.surchargeAmountTaka);
}

function roundDistanceKm(distanceKm?: number | null) {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  return Math.round(Math.max(0, distanceKm) * 10) / 10;
}

// Customer-facing breakdown of HOW the delivery fee was reached, so the cart can show
// why the fee is what it is (fee transparency = trust). The base fee covers up to
// `baseCoversKm`; anything beyond is the distance surcharge (`extraDistanceFee`, which is
// 0 while `distanceSurchargeEnabled` is off — the current setup). Derived purely from the
// already-computed `deliveryFee`, so it can never disagree with the amount charged.
function buildDeliveryFeeBreakdown(params: {
  config: {
    baseFeeTaka: number;
    distanceSurchargeEnabled: boolean;
    surchargeStartsAfterKm: number;
    surchargeStepMeters: number;
    surchargeAmountTaka: number;
  };
  distanceKm?: number | null;
  deliveryFee: number;
}) {
  const baseFee = roundCurrencyAmount(params.config.baseFeeTaka);
  const totalFee = roundCurrencyAmount(params.deliveryFee);
  const extraDistanceFee = Math.max(0, roundCurrencyAmount(totalFee - baseFee));
  const distanceKm = roundDistanceKm(params.distanceKm);
  const baseCoversKm = Math.max(0, params.config.surchargeStartsAfterKm);
  const surchargeActive =
    params.config.distanceSurchargeEnabled === true && extraDistanceFee > 0;
  const extraDistanceKm =
    surchargeActive && distanceKm !== null
      ? Math.round(Math.max(0, distanceKm - baseCoversKm) * 10) / 10
      : 0;

  return {
    distanceKm,
    baseFee,
    baseCoversKm,
    distanceSurchargeEnabled: params.config.distanceSurchargeEnabled === true,
    extraDistanceKm,
    extraDistanceFee,
    surchargeStepMeters: Math.max(1, params.config.surchargeStepMeters ?? 0),
    surchargeAmountTaka: roundCurrencyAmount(params.config.surchargeAmountTaka ?? 0),
    totalFee,
  };
}

function resolveDeliveryPricingConfig(params: {
  platformContent: Awaited<ReturnType<typeof getPlatformContent>>;
  restaurant: Record<string, any>;
}) {
  const globalPricing = params.platformContent.operations.deliveryPricing;
  const override = params.restaurant.commercial?.deliveryPricingOverride;

  if (!override || override.enabled !== true) {
    return globalPricing;
  }

  return {
    baseFeeTaka:
      typeof override.baseFeeTaka === "number"
        ? override.baseFeeTaka
        : globalPricing.baseFeeTaka,
    distanceSurchargeEnabled:
      typeof override.distanceSurchargeEnabled === "boolean"
        ? override.distanceSurchargeEnabled
        : globalPricing.distanceSurchargeEnabled,
    surchargeStartsAfterKm:
      typeof override.surchargeStartsAfterKm === "number"
        ? override.surchargeStartsAfterKm
        : globalPricing.surchargeStartsAfterKm,
    surchargeStepMeters:
      typeof override.surchargeStepMeters === "number"
        ? override.surchargeStepMeters
        : globalPricing.surchargeStepMeters,
    surchargeAmountTaka:
      typeof override.surchargeAmountTaka === "number"
        ? override.surchargeAmountTaka
        : globalPricing.surchargeAmountTaka,
  };
}

function assertRestaurantServiceableForDelivery(params: {
  platformContent: Awaited<ReturnType<typeof getPlatformContent>>;
  restaurant: Record<string, any>;
  latitude?: number;
  longitude?: number;
  serviceArea?: Record<string, any> | null;
}) {
  if (
    typeof params.latitude !== "number" ||
    typeof params.longitude !== "number"
  ) {
    return null;
  }

  if (
    typeof params.restaurant.location?.latitude !== "number" ||
    typeof params.restaurant.location?.longitude !== "number"
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESTAURANT_OUT_OF_DELIVERY_AREA",
      "This restaurant does not deliver to your selected location.",
    );
  }

  const deliveryDistanceKm = calculateDistanceKm(
    params.latitude,
    params.longitude,
    params.restaurant.location.latitude,
    params.restaurant.location.longitude,
  );
  const deliveryRadiusKm = getServiceAreaRestaurantDistanceKm(
    params.serviceArea,
    params.platformContent.operations.serviceArea.radiusKm,
  );

  if (deliveryDistanceKm > deliveryRadiusKm) {
    if (isServiceAreaModeEnabled()) {
      return deliveryDistanceKm;
    }

    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RESTAURANT_OUT_OF_DELIVERY_AREA",
      "This restaurant does not deliver to your selected location.",
    );
  }

  return deliveryDistanceKm;
}

function resolveSelectedVariantPrice(
  variants: Array<{
    name?: string;
    options?: Array<{ label?: string; priceDelta?: number }>;
  }>,
  selectedVariantOptions?: Array<{ groupName: string; optionLabel: string }>,
) {
  if (!selectedVariantOptions?.length) return 0;

  return selectedVariantOptions.reduce((total, selectedOption) => {
    const group = variants.find(
      (variant) => variant.name === selectedOption.groupName,
    );
    const option = group?.options?.find(
      (item) => item.label === selectedOption.optionLabel,
    );
    return total + (option?.priceDelta ?? 0);
  }, 0);
}

function resolveSelectedAddOnPrice(
  addOnGroups: Array<{
    name?: string;
    options?: Array<{ label?: string; price?: number }>;
  }>,
  selectedAddOnOptions?: Array<{ groupName: string; optionLabel: string }>,
) {
  if (!selectedAddOnOptions?.length) return 0;

  return selectedAddOnOptions.reduce((total, selectedOption) => {
    const group = addOnGroups.find(
      (addOnGroup) => addOnGroup.name === selectedOption.groupName,
    );
    const option = group?.options?.find(
      (item) => item.label === selectedOption.optionLabel,
    );
    return total + (option?.price ?? 0);
  }, 0);
}

export const customerCartQuoteCache = createInMemoryAsyncCache<CustomerCartQuoteResult>({
  ttlMs: CUSTOMER_READ_CACHE_TTL_MS,
  maxEntries: CUSTOMER_READ_CACHE_MAX_ENTRIES,
})

/**
 * THE single source of truth for a restaurant's effective minimum order amount. Both
 * the cart quote (display) and the place-order gate (enforcement) call this, so they can
 * never disagree. null/undefined override → inherit the platform default; a number
 * overrides it (0 = no minimum for that restaurant).
 */
export function resolveMinimumOrderAmount(
  override: unknown,
  platformDefault: unknown,
): number {
  const base =
    typeof platformDefault === "number" && Number.isFinite(platformDefault)
      ? Math.max(0, platformDefault)
      : 0;
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(0, override);
  }
  return base;
}

export async function quoteCustomerCart(params: {
  restaurantId: string;
  items: CartInputItem[];
  voucherCode?: string;
  customerId?: string;
  installId?: string;
  latitude?: number;
  longitude?: number;
}): Promise<CustomerCartQuoteResult> {
  const baseQuote = await customerCartQuoteCache.getOrSet(
    buildCustomerCartQuoteCacheKey(params),
    async () => {
      const [platformContent, restaurant] = await Promise.all([
        getPlatformContent(),
        RestaurantModel.findOne({
          _id: params.restaurantId,
          ...getVisibleRestaurantQuery(),
        })
          .select({
            name: 1,
            runtime: 1,
            location: 1,
            serviceArea: 1,
            cuisineTypes: 1,
            commercial: 1,
            settings: 1,
          })
          .lean<Record<string, any>>(),
      ]);

      if (!restaurant) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          "RESTAURANT_NOT_FOUND",
          "Restaurant not found",
        );
      }

      // Service-window write gate. The visible-restaurant query above already
      // enforces the owner's online toggle; the platform/zone service window is
      // time-based (not query-able), so it is checked here. This covers both the
      // cart quote and order placement (placement re-quotes through this function).
      // Behaves like the owner-offline path the app already handles.
      const cartServiceWindow = evaluateServiceWindowForOverride(
        await getServiceHoursOverrideForZone(restaurant.serviceArea?.zoneId),
        await getPlatformServiceHours(),
      );
      if (!cartServiceWindow.isOpen) {
        throw new AppError(
          StatusCodes.CONFLICT,
          "RESTAURANT_OUTSIDE_SERVICE_HOURS",
          "This restaurant is closed right now. Please order during service hours.",
        );
      }

      if (!params.items.length) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "CART_EMPTY",
          "Add at least one item to continue",
        );
      }

      const menuItemIds = params.items.map((item) => item.itemId);
      const menuItems = await MenuItemModel.find({
        _id: { $in: menuItemIds },
        restaurantId: restaurant._id,
        status: "active",
        availability: "available",
      })
        .select({
          categoryId: 1,
          name: 1,
          slug: 1,
          images: 1,
          basePrice: 1,
          variants: 1,
          addOnGroups: 1,
        })
        .lean();

      const menuItemMap = new Map(menuItems.map((item) => [String(item._id), item]));
      // Active platform-funded menu markdowns for this restaurant. Resolved here (not from
      // the cached menu payload) so cart pricing is always authoritative and live.
      const markdownRules = (await VoucherModel.find(
        buildActiveMenuMarkdownFilter(restaurant),
      )
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
        .lean()) as unknown as MarkdownRule[];
      const restaurantIdString = String(restaurant._id);
      const categoryIds = [
        ...new Set(menuItems.map((item) => item.categoryId.toString())),
      ];
      const categories = categoryIds.length
        ? await CategoryModel.find(
            { _id: { $in: categoryIds }, restaurantId: restaurant._id },
            { name: 1, slug: 1 },
          ).lean()
        : [];
      const categoryMap = new Map(
        categories.map((category) => [category._id.toString(), category]),
      );

      const resolvedItems = params.items.map((cartItem) => {
        const menuItem = menuItemMap.get(cartItem.itemId);

        if (!menuItem) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            "MENU_ITEM_NOT_AVAILABLE",
            "One or more selected items are not available",
          );
        }

        const variantPrice = resolveSelectedVariantPrice(
          (menuItem.variants ?? []).map((variant) => ({
            name: variant.name,
            options: (variant.options ?? []).map((option) => ({
              label: option.label,
              priceDelta: option.priceDelta,
            })),
          })),
          cartItem.selectedVariantOptions,
        );

        const addOnPrice = resolveSelectedAddOnPrice(
          (menuItem.addOnGroups ?? []).map((group) => ({
            name: group.name,
            options: (group.options ?? []).map((option) => ({
              label: option.label,
              price: option.price,
            })),
          })),
          cartItem.selectedAddOnOptions,
        );

        const unitPrice = menuItem.basePrice + variantPrice + addOnPrice;
        const lineTotal = unitPrice * cartItem.quantity;
        const categoryId = menuItem.categoryId.toString();
        const category = categoryMap.get(categoryId);
        const image = Array.isArray(menuItem.images) ? menuItem.images[0] : null;

        // Platform-funded markdown applies to the (base + variant) portion only — add-ons
        // are always charged in full. Owner is settled on the full unitPrice (Option A); the
        // platform absorbs markdownPerUnit. Threshold is evaluated on the exact selection.
        const markdownableUnit = menuItem.basePrice + variantPrice;
        const markdownRule = pickRuleForItem(
          menuItem as unknown as Parameters<typeof pickRuleForItem>[0],
          markdownRules,
          restaurantIdString,
        );
        const markdownPerUnit = markdownRule
          ? computeMarkdownAmount(markdownableUnit, markdownRule)
          : 0;
        const effectiveUnitPrice = unitPrice - markdownPerUnit;

        return {
          itemId: String(menuItem._id),
          categoryId,
          itemName: menuItem.name,
          name: menuItem.name,
          itemSlug: menuItem.slug,
          categoryName: category?.name ?? "",
          categorySlug: category?.slug ?? "",
          imageUrl: image?.url ?? "",
          quantity: cartItem.quantity,
          unitPrice,
          lineTotal,
          // Markdown view: full price the owner is paid on vs. what the customer pays.
          markdownPerUnit,
          effectiveUnitPrice,
          effectiveLineTotal: effectiveUnitPrice * cartItem.quantity,
          appliedMarkdownRuleId:
            markdownPerUnit > 0 && markdownRule ? String(markdownRule._id) : "",
          selectedVariantOptions: cartItem.selectedVariantOptions ?? [],
          selectedAddOnOptions: cartItem.selectedAddOnOptions ?? [],
        };
      });

      // Owner subtotal stays at full price (drives commission + payout in settlement). The
      // markdown is a platform-funded reduction of what the customer actually pays.
      const subtotal = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const menuMarkdownAmount = resolvedItems.reduce(
        (sum, item) => sum + item.markdownPerUnit * item.quantity,
        0,
      );
      const customerSubtotal = Math.max(subtotal - menuMarkdownAmount, 0);
      const deliveryServiceArea = await assertLocationInsideServiceArea({
        latitude: params.latitude,
        longitude: params.longitude,
        required:
          typeof params.latitude === "number" ||
          typeof params.longitude === "number",
      });
      const restaurantServiceArea =
        await resolveRestaurantServiceAreaSnapshot(restaurant);
      assertRestaurantMatchesDeliveryServiceArea({
        restaurantServiceArea,
        deliveryServiceArea: deliveryServiceArea?.snapshot ?? null,
        restaurantLatitude: restaurant.location?.latitude,
        restaurantLongitude: restaurant.location?.longitude,
      });
      const serviceAreaSnapshot =
        deliveryServiceArea?.snapshot ?? restaurantServiceArea ?? null;
      const deliveryPricingConfig = applyServiceAreaDeliveryPricing(
        resolveDeliveryPricingConfig({
          platformContent,
          restaurant,
        }),
        serviceAreaSnapshot,
      );
      const deliveryDistanceKm = assertRestaurantServiceableForDelivery({
        platformContent,
        restaurant,
        latitude: params.latitude,
        longitude: params.longitude,
        serviceArea: serviceAreaSnapshot,
      });
      const deliveryFee = calculateConfiguredDeliveryFee({
        baseFeeTaka: deliveryPricingConfig.baseFeeTaka,
        distanceSurchargeEnabled: deliveryPricingConfig.distanceSurchargeEnabled,
        surchargeStartsAfterKm: deliveryPricingConfig.surchargeStartsAfterKm,
        surchargeStepMeters: deliveryPricingConfig.surchargeStepMeters,
        surchargeAmountTaka: deliveryPricingConfig.surchargeAmountTaka,
        distanceKm: deliveryDistanceKm,
      });
      // Bad-weather surcharge: a flat per-order fee the admin can switch on for a
      // service area/zone. Kept separate from the delivery fee so it shows as its
      // own line and is not waived by a free-delivery voucher.
      const rainSurcharge =
        (serviceAreaSnapshot as Record<string, any> | null)?.delivery
          ?.rainSurchargeEnabled === true
          ? roundCurrencyAmount(
              Math.max(
                0,
                Number(
                  (serviceAreaSnapshot as Record<string, any>).delivery
                    .rainSurchargeTaka,
                ) || 0,
              ),
            )
          : 0;
      // Markdown is applied first; coupons then evaluate against the reduced subtotal so the
      // two never double-count and minimum-order checks reflect what the customer pays.
      const vouchers: CustomerCacheRecord[] = await resolveActiveVoucher({
        restaurantId: String(restaurant._id),
        voucherCode: params.voucherCode,
        subtotal: customerSubtotal,
        deliveryFee,
        customerId: params.customerId,
        items: resolvedItems.map((item) => ({
          itemId: item.itemId,
          categoryId: item.categoryId,
        })),
      });

      const voucherDiscounts = new Map<string, number>();
      const discountAmount = vouchers.reduce((totalDiscount, voucher) => {
        const baseDeliveryFee = voucher.type === "free_delivery" ? deliveryFee : 0;
        const currentDiscount = calculateVoucherDiscount({
          voucher,
          subtotal: Math.max(customerSubtotal - totalDiscount, 0),
          deliveryFee: baseDeliveryFee,
        });
        voucherDiscounts.set(String(voucher._id), currentDiscount);
        return totalDiscount + currentDiscount;
      }, 0);

      const total = Math.max(
        customerSubtotal + deliveryFee + rainSurcharge - discountAmount,
        0,
      );
      const ownerDiscountCost = vouchers.reduce((totalOwnerCost, voucher) => {
        const voucherDiscount = voucherDiscounts.get(String(voucher._id)) ?? 0;
        return (
          totalOwnerCost +
          Math.round(
            voucherDiscount * (((voucher as any).ownerSharePercent ?? 100) / 100),
          )
        );
      }, 0);
      // Platform absorbs both the platform share of any voucher and the full menu markdown.
      const platformDiscountCost =
        vouchers.reduce((totalPlatformCost, voucher) => {
          const voucherDiscount = voucherDiscounts.get(String(voucher._id)) ?? 0;
          return (
            totalPlatformCost +
            Math.round(
              voucherDiscount * (((voucher as any).platformSharePercent ?? 0) / 100),
            )
          );
        }, 0) + menuMarkdownAmount;

      const minimumOrderAmount = resolveMinimumOrderAmount(
        restaurant.commercial?.minimumOrderAmount,
        platformContent.operations.minimumOrderAmount,
      );

      return {
        restaurant: {
          id: String(restaurant._id),
          name: restaurant.name,
          orderNote: getCustomerFacingOrderNoteSetting(restaurant),
        },
        serviceArea: serviceAreaSnapshot,
        items: resolvedItems,
        // Minimum-order gate on the customer item value (after menu markdown, before
        // delivery + checkout voucher). Same object powers the cart UI and the
        // place-order block, so they can never drift apart.
        minimumOrder: {
          amount: minimumOrderAmount,
          subtotal: customerSubtotal,
          isMet: minimumOrderAmount <= 0 || customerSubtotal >= minimumOrderAmount,
          amountShort: Math.max(0, minimumOrderAmount - customerSubtotal),
        },
        pricing: {
          subtotal,
          menuMarkdownAmount,
          deliveryFee,
          rainSurcharge,
          discountAmount,
          ownerDiscountCost,
          platformDiscountCost,
          total,
        },
        // Transparency: how the delivery fee splits (base vs distance surcharge) + distance.
        deliveryBreakdown: buildDeliveryFeeBreakdown({
          config: deliveryPricingConfig,
          distanceKm: deliveryDistanceKm,
          deliveryFee,
        }),
        appliedVouchers: summarizeAppliedVouchers(
          vouchers.map((voucher) => ({
            id: String(voucher._id),
            code: voucher.code,
            name: voucher.name,
            type: voucher.type,
            mode: voucher.mode,
            fundedBy: voucher.fundedBy,
            scopeType: (voucher as any).scopeType,
            audienceType: (voucher as any).audienceType,
            ownerSharePercent: voucher.ownerSharePercent,
            platformSharePercent: voucher.platformSharePercent,
            discountAmount: voucherDiscounts.get(String(voucher._id)) ?? 0,
          })),
        ),
      };
    },
  );

  return applyFirstOrderDiscountToQuote(
    baseQuote,
    params.customerId,
    params.installId,
    Boolean(params.voucherCode?.trim()),
  );
}

// Layers the instant, platform-funded first-order (welcome) discount on top of the
// cached base quote. Kept OUTSIDE the cache because eligibility is per-customer and
// changes after their first order. Never mutates the cached object — clones pricing.
//
// Exactly ONE discount ever applies:
//  - A coupon the customer explicitly entered always wins (respect their choice).
//  - Otherwise, between an AUTO voucher and the first-order discount, apply whichever
//    saves the customer more — the customer-friendly choice.
async function applyFirstOrderDiscountToQuote(
  baseQuote: CustomerCartQuoteResult,
  customerId?: string,
  installId?: string,
  hasCoupon = false,
): Promise<CustomerCartQuoteResult> {
  if (!customerId) return baseQuote;

  const pricing = (baseQuote as Record<string, any>).pricing ?? {};
  const voucherDiscount = Number(pricing.discountAmount ?? 0);

  // An explicitly entered coupon always wins; never override it or advertise first-order.
  if (hasCoupon && voucherDiscount > 0) {
    return baseQuote;
  }

  const customerSubtotal = Math.max(
    0,
    Number(pricing.subtotal ?? 0) - Number(pricing.menuMarkdownAmount ?? 0),
  );

  const result = await evaluateFirstOrderDiscount({
    customerId,
    subtotalTaka: customerSubtotal,
    deviceId: installId,
  });

  // Not a first-order customer at all — nothing to apply or hint.
  if (!result.candidate) {
    return baseQuote;
  }

  // Metadata the app uses to drive the "add X more to unlock" progress bar. Attached
  // whenever the customer is a candidate, even below the threshold. `applied` reflects
  // whether it actually changed the pricing.
  const buildMeta = (applied: boolean) => ({
    applied,
    eligible: result.eligible,
    amount: result.amount,
    minimumOrderAmount: result.minimumOrderAmount,
    remaining: result.remaining,
    title: result.settings.bannerTitle.replace("{{amount}}", String(result.amount)),
    subtitle: result.settings.bannerSubtitle.replace(
      "{{minimum}}",
      String(result.minimumOrderAmount),
    ),
  });

  // Below threshold, or threshold met but an auto voucher already saves as much/more:
  // expose the hint but don't change pricing.
  if (!result.eligible || voucherDiscount >= result.amount) {
    return {
      ...(baseQuote as Record<string, any>),
      firstOrderDiscount: buildMeta(false),
    } as CustomerCartQuoteResult;
  }

  const amount = result.amount;

  // First-order wins and there's no voucher — simply add the first-order discount.
  if (voucherDiscount <= 0) {
    return {
      ...(baseQuote as Record<string, any>),
      pricing: {
        ...pricing,
        firstOrderDiscountAmount: amount,
        platformDiscountCost: Number(pricing.platformDiscountCost ?? 0) + amount,
        total: Math.max(0, Number(pricing.total ?? 0) - amount),
      },
      firstOrderDiscount: buildMeta(true),
    } as CustomerCartQuoteResult;
  }

  // First-order beats the auto voucher — drop the weaker voucher and apply first-order
  // instead (still exactly one discount). Add the voucher discount back, take the
  // first-order off, reset the voucher's owner/platform split (markdown stays).
  return {
    ...(baseQuote as Record<string, any>),
    appliedVouchers: [],
    pricing: {
      ...pricing,
      discountAmount: 0,
      ownerDiscountCost: 0,
      platformDiscountCost: Number(pricing.menuMarkdownAmount ?? 0) + amount,
      firstOrderDiscountAmount: amount,
      total: Math.max(0, Number(pricing.total ?? 0) + voucherDiscount - amount),
    },
    firstOrderDiscount: buildMeta(true),
  } as CustomerCartQuoteResult;
}

