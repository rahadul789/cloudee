import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import { AppError } from "../../common/utils/app-error";
import { OrderModel } from "../owner/operational.model";
import { VoucherModel, VoucherRedemptionModel } from "./customer.model";

// Voucher eligibility, discount calculation and redemption lifecycle.
// Extracted from customer.service.ts. Depends only on models + shared utils,
// so there is no import cycle back into customer.service.ts.

// Batched active-redemption counts for many vouchers in a single aggregation.
// Returns a Map of voucherId -> active (non-released, non-cancelled) redemptions.
// Replaces the previous per-voucher query so checkout runs O(1) aggregations
// instead of O(vouchers).
async function countActiveVoucherRedemptionsByVoucher(params: {
  voucherIds: mongoose.Types.ObjectId[];
  customerId?: string;
}): Promise<Map<string, number>> {
  if (!params.voucherIds.length) return new Map();

  const match: Record<string, unknown> = {
    voucherId: { $in: params.voucherIds },
    releasedAt: null,
  };
  if (params.customerId) {
    match["voucherSnapshot.customerId"] = params.customerId;
  }

  const rows = await VoucherRedemptionModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
  }>([
    { $match: match },
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "orderDocs",
      },
    },
    {
      $addFields: {
        relatedOrderStatus: {
          $let: {
            vars: { relatedOrder: { $arrayElemAt: ["$orderDocs", 0] } },
            in: "$$relatedOrder.status",
          },
        },
      },
    },
    {
      $match: {
        relatedOrderStatus: { $nin: ["Cancelled", "Rejected"] },
      },
    },
    { $group: { _id: "$voucherId", count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
}

export async function releaseVoucherRedemptionsForOrder(
  orderId: unknown,
  reason: string,
  session?: mongoose.ClientSession,
) {
  // Capture which redemptions counted toward a voucher's global usage cap or a
  // menu-markdown budget so we can give those slots/spend back when the order is
  // released (cancelled/rejected).
  const counted = await VoucherRedemptionModel.find(
    {
      orderId,
      releasedAt: null,
      $or: [{ countedTowardTotal: true }, { countedTowardBudget: true }],
    },
    { voucherId: 1, countedTowardTotal: 1, countedTowardBudget: 1, budgetConsumed: 1 },
    session ? { session } : undefined,
  ).lean();

  await VoucherRedemptionModel.updateMany(
    { orderId, releasedAt: null },
    {
      $set: {
        releasedAt: new Date(),
        releaseReason: reason,
        singleUsePerUser: false,
      },
    },
    session ? { session } : undefined,
  );

  if (counted.length) {
    await VoucherModel.bulkWrite(
      counted.map((redemption) => {
        const dec: Record<string, number> = {};
        if (redemption.countedTowardTotal) dec.redeemedCount = -1;
        if (redemption.countedTowardBudget && redemption.budgetConsumed) {
          dec.consumedDiscountBudget = -redemption.budgetConsumed;
        }
        return {
          updateOne: {
            filter: { _id: redemption.voucherId },
            update: { $inc: dec },
          },
        };
      }),
      session ? { session } : {},
    );
  }
}

export async function resolveActiveVoucher(params: {
  restaurantId: string;
  voucherCode?: string;
  subtotal: number;
  customerId?: string;
  items: Array<{ itemId: string; categoryId: string }>;
}) {
  const now = new Date();
  const requestedVoucherCode = params.voucherCode?.trim().toUpperCase() ?? "";
  let requestedCouponError:
    | { statusCode: number; code: string; message: string }
    | null = null;
  const [previousOrderCount, activeVouchers] = await Promise.all([
    params.customerId
      ? OrderModel.countDocuments({ customerId: params.customerId })
      : Promise.resolve(0),
    VoucherModel.find({
      archivedAt: null,
      // Menu markdowns are applied at the item level, never as a checkout voucher —
      // excluding them here prevents a markdown from discounting the order total twice.
      surface: { $ne: "menu_markdown" },
      $or: [
        { restaurantId: params.restaurantId },
        { scopeType: "all_restaurants" },
        {
          scopeType: "selected_restaurants",
          selectedRestaurantIds: params.restaurantId,
        },
      ],
      status: "Active",
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    })
      .select({
        restaurantId: 1,
        selectedRestaurantIds: 1,
        selectedCustomerIds: 1,
        categoryIds: 1,
        itemIds: 1,
        code: 1,
        name: 1,
        type: 1,
        mode: 1,
        fundedBy: 1,
        scopeType: 1,
        audienceType: 1,
        applicability: 1,
        minimumOrderAmount: 1,
        discountValue: 1,
        maxDiscountAmount: 1,
        maxTotalUses: 1,
        maxUsesPerUser: 1,
        stackingRule: 1,
        priority: 1,
        ownerSharePercent: 1,
        platformSharePercent: 1,
        archivedAt: 1,
      })
      .sort({ priority: -1, createdAt: 1 })
      .lean(),
  ]);

  const eligibleVouchers = [];
  const itemIdSet = new Set(params.items.map((item) => item.itemId));
  const categoryIdSet = new Set(params.items.map((item) => item.categoryId));

  // Pre-compute usage counts in two batched aggregations (instead of two per
  // voucher) so checkout stays fast regardless of how many vouchers are active.
  const totalLimitedVoucherIds = activeVouchers
    .filter((voucher) => (voucher.maxTotalUses ?? 0) > 0)
    .map((voucher) => voucher._id);
  const perUserLimitedVoucherIds = activeVouchers
    .filter((voucher) => (voucher.maxUsesPerUser ?? 0) > 0)
    .map((voucher) => voucher._id);
  const [totalUsesByVoucher, customerUsesByVoucher] = await Promise.all([
    countActiveVoucherRedemptionsByVoucher({ voucherIds: totalLimitedVoucherIds }),
    params.customerId
      ? countActiveVoucherRedemptionsByVoucher({
          voucherIds: perUserLimitedVoucherIds,
          customerId: params.customerId,
        })
      : Promise.resolve(new Map<string, number>()),
  ]);

  for (const voucher of activeVouchers) {
    if (voucher.archivedAt) continue;
    const scopedVoucher = voucher as any;
    const isRequestedCoupon =
      Boolean(requestedVoucherCode) &&
      voucher.mode === "coupon" &&
      String(voucher.code ?? "").toUpperCase() === requestedVoucherCode;
    if (scopedVoucher.audienceType === "new_users" && previousOrderCount > 0) {
      if (isRequestedCoupon) {
        requestedCouponError = {
          statusCode: StatusCodes.BAD_REQUEST,
          code: "VOUCHER_NOT_FOR_THIS_CUSTOMER",
          message: "This voucher is only available for new customers",
        };
      }
      continue;
    }
    if (
      scopedVoucher.audienceType === "returning_users" &&
      previousOrderCount === 0
    ) {
      if (isRequestedCoupon) {
        requestedCouponError = {
          statusCode: StatusCodes.BAD_REQUEST,
          code: "VOUCHER_NOT_FOR_THIS_CUSTOMER",
          message: "This voucher is only available for returning customers",
        };
      }
      continue;
    }
    if (
      scopedVoucher.audienceType === "selected_users" &&
      (!params.customerId ||
        !(scopedVoucher.selectedCustomerIds ?? []).some(
          (customerId: unknown) =>
            customerId?.toString?.() === params.customerId,
        ))
    ) {
      if (isRequestedCoupon) {
        requestedCouponError = {
          statusCode: StatusCodes.FORBIDDEN,
          code: "VOUCHER_NOT_FOR_THIS_CUSTOMER",
          message: "This voucher is not available for your account",
        };
      }
      continue;
    }
    if (voucher.minimumOrderAmount > params.subtotal) {
      if (isRequestedCoupon) {
        requestedCouponError = {
          statusCode: StatusCodes.BAD_REQUEST,
          code: "VOUCHER_MINIMUM_ORDER_NOT_MET",
          message: `Add Tk ${Math.ceil(voucher.minimumOrderAmount - params.subtotal)} more to use this voucher`,
        };
      }
      continue;
    }

    if (
      (scopedVoucher.scopeType ?? "restaurant") === "restaurant" &&
      voucher.applicability === "categories" &&
      !voucher.categoryIds.some((categoryId) =>
        categoryIdSet.has(categoryId.toString()),
      )
    ) {
      if (isRequestedCoupon) {
        requestedCouponError = {
          statusCode: StatusCodes.BAD_REQUEST,
          code: "VOUCHER_CATEGORY_NOT_ELIGIBLE",
          message: "This voucher is not available for the selected items",
        };
      }
      continue;
    }

    if (
      (scopedVoucher.scopeType ?? "restaurant") === "restaurant" &&
      voucher.applicability === "items" &&
      !voucher.itemIds.some((itemId) => itemIdSet.has(itemId.toString()))
    ) {
      if (isRequestedCoupon) {
        requestedCouponError = {
          statusCode: StatusCodes.BAD_REQUEST,
          code: "VOUCHER_ITEM_NOT_ELIGIBLE",
          message: "This voucher is not available for the selected items",
        };
      }
      continue;
    }

    if (voucher.maxTotalUses > 0) {
      const totalUses = totalUsesByVoucher.get(String(voucher._id)) ?? 0;
      if (totalUses >= voucher.maxTotalUses) {
        if (isRequestedCoupon) {
          requestedCouponError = {
            statusCode: StatusCodes.CONFLICT,
            code: "VOUCHER_USAGE_LIMIT_REACHED",
            message: "This voucher has reached its maximum usage limit",
          };
        }
        continue;
      }
    }

    if (params.customerId && voucher.maxUsesPerUser > 0) {
      const customerUses = customerUsesByVoucher.get(String(voucher._id)) ?? 0;
      if (customerUses >= voucher.maxUsesPerUser) {
        if (isRequestedCoupon) {
          requestedCouponError = {
            statusCode: StatusCodes.CONFLICT,
            code: "VOUCHER_USER_LIMIT_REACHED",
            message: "You have already used this voucher",
          };
        }
        continue;
      }
    }

    eligibleVouchers.push(voucher);
  }

  const autoVoucher =
    eligibleVouchers.find((voucher) => voucher.mode === "auto") ?? null;

  if (!params.voucherCode) {
    return autoVoucher ? [autoVoucher] : [];
  }

  const couponVoucher = eligibleVouchers.find(
    (voucher) =>
      voucher.mode === "coupon" && voucher.code === params.voucherCode,
  );

  if (!couponVoucher) {
    if (requestedCouponError) {
      throw new AppError(
        requestedCouponError.statusCode,
        requestedCouponError.code,
        requestedCouponError.message,
      );
    }
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "VOUCHER_NOT_FOUND",
      "Voucher code is invalid",
    );
  }

  if (!autoVoucher) {
    return [couponVoucher];
  }

  if (
    autoVoucher.stackingRule === "stackable" &&
    couponVoucher.stackingRule === "stackable"
  ) {
    return [autoVoucher, couponVoucher].sort((a, b) => b.priority - a.priority);
  }

  return [couponVoucher];
}

export function calculateVoucherDiscount(params: {
  voucher: {
    type?: string;
    discountValue?: number;
    maxDiscountAmount?: number;
  };
  subtotal: number;
  deliveryFee: number;
}) {
  if (params.voucher.type === "flat") {
    return Math.min(params.voucher.discountValue ?? 0, params.subtotal);
  }

  if (params.voucher.type === "percentage") {
    const rawDiscount =
      ((params.voucher.discountValue ?? 0) / 100) * params.subtotal;
    const cappedDiscount =
      params.voucher.maxDiscountAmount && params.voucher.maxDiscountAmount > 0
        ? Math.min(rawDiscount, params.voucher.maxDiscountAmount)
        : rawDiscount;
    return Math.min(cappedDiscount, params.subtotal);
  }

  if (params.voucher.type === "free_delivery") {
    return Math.min(params.deliveryFee, params.deliveryFee);
  }

  return 0;
}

export function summarizeAppliedVouchers(
  vouchers: Array<{
    id: string;
    code?: string;
    name: string;
    type: string;
    mode: string;
    fundedBy?: string;
    scopeType?: string;
    audienceType?: string;
    ownerSharePercent?: number;
    platformSharePercent?: number;
    discountAmount?: number;
  }>,
) {
  return vouchers.map((voucher) => ({
    id: voucher.id,
    code: voucher.code,
    name: voucher.name,
    type: voucher.type,
    mode: voucher.mode,
    fundedBy: voucher.fundedBy,
    scopeType: (voucher as any).scopeType,
    audienceType: (voucher as any).audienceType,
    ownerSharePercent: voucher.ownerSharePercent,
    platformSharePercent: voucher.platformSharePercent,
    discountAmount: voucher.discountAmount,
  }));
}
