import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache";
import { getPlatformContent } from "../public/content.service";
import { RestaurantModel } from "../auth/auth.model";
import { CategoryModel, MenuItemModel } from "../owner/operational.model";
import { VoucherModel } from "./customer.model";
import {
  computeMarkdownAmount,
  pickRuleForItem,
  type MarkdownRule,
} from "../promotions/menu-markdown";
import { buildActiveMenuMarkdownFilter } from "../promotions/menu-markdown-query";
import {
  applyServiceAreaDeliveryPricing,
  assertLocationInsideServiceArea,
  assertRestaurantMatchesDeliveryServiceArea,
  getServiceAreaRestaurantDistanceKm,
  isServiceAreaModeEnabled,
  resolveRestaurantServiceAreaSnapshot,
} from "../service-area/service-area.service";
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

export async function quoteCustomerCart(params: {
  restaurantId: string;
  items: CartInputItem[];
  voucherCode?: string;
  customerId?: string;
  latitude?: number;
  longitude?: number;
}): Promise<CustomerCartQuoteResult> {
  return customerCartQuoteCache.getOrSet(
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
      // Markdown is applied first; coupons then evaluate against the reduced subtotal so the
      // two never double-count and minimum-order checks reflect what the customer pays.
      const vouchers: CustomerCacheRecord[] = await resolveActiveVoucher({
        restaurantId: String(restaurant._id),
        voucherCode: params.voucherCode,
        subtotal: customerSubtotal,
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
        customerSubtotal + deliveryFee - discountAmount,
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

      return {
        restaurant: {
          id: String(restaurant._id),
          name: restaurant.name,
          orderNote: getCustomerFacingOrderNoteSetting(restaurant),
        },
        serviceArea: serviceAreaSnapshot,
        items: resolvedItems,
        pricing: {
          subtotal,
          menuMarkdownAmount,
          deliveryFee,
          discountAmount,
          ownerDiscountCost,
          platformDiscountCost,
          total,
        },
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
}

