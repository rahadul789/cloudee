import { logger } from "../../config/logger"
import { RiderModel } from "../auth/auth.model"
import { LedgerEntryModel, PlatformFinanceEntryModel } from "../owner/finance.model"
import { getPlatformContent } from "../public/content.service"
import { RiderPayrollCycleModel } from "./rider-payroll.model"

export type FailedDeliveryReason =
  | "customer_no_response"
  | "wrong_item"
  | "others"

export type FailedDeliveryFault = "customer" | "restaurant" | "unknown"

export type FailedDeliveryFinanceSettings = {
  /** % of the order refunded to the customer when the failure is the customer's fault
   *  (the remainder is a no-show fee). Full refund applies for restaurant/unknown fault. */
  customerFaultRefundPercent: number
  /** % of the food subtotal paid to the restaurant when the failure is the customer's
   *  fault (the food was made but the customer was a no-show). */
  restaurantCompensationPercent: number
  /** Flat pay credited to the rider for a failed trip that was not their fault. */
  riderFailedTripPay: number
}

// Sensible defaults — all overridable from the admin finance settings.
export const DEFAULT_FAILED_DELIVERY_FINANCE_SETTINGS: FailedDeliveryFinanceSettings = {
  customerFaultRefundPercent: 80,
  restaurantCompensationPercent: 100,
  riderFailedTripPay: 30,
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

export async function getFailedDeliveryFinanceSettings(): Promise<FailedDeliveryFinanceSettings> {
  const content = await getPlatformContent()
  const cfg = ((content.operations as Record<string, any>)?.failedDelivery ?? {}) as Record<
    string,
    unknown
  >
  return {
    customerFaultRefundPercent: clampNumber(
      cfg.customerFaultRefundPercent,
      DEFAULT_FAILED_DELIVERY_FINANCE_SETTINGS.customerFaultRefundPercent,
      0,
      100,
    ),
    restaurantCompensationPercent: clampNumber(
      cfg.restaurantCompensationPercent,
      DEFAULT_FAILED_DELIVERY_FINANCE_SETTINGS.restaurantCompensationPercent,
      0,
      200,
    ),
    riderFailedTripPay: clampNumber(
      cfg.riderFailedTripPay,
      DEFAULT_FAILED_DELIVERY_FINANCE_SETTINGS.riderFailedTripPay,
      0,
      100_000,
    ),
  }
}

export function deriveFailedDeliveryFault(
  reason: FailedDeliveryReason,
): FailedDeliveryFault {
  if (reason === "wrong_item") return "restaurant"
  if (reason === "customer_no_response") return "customer"
  return "unknown"
}

function currentPayrollMonth() {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Applies the failed-delivery compensation policy AFTER the order has already been
 * cancelled (which itself handles the customer refund + restaurant earning removal via
 * the shared terminal pipeline). This layer is additive and best-effort: a failure here
 * never undoes the already-committed cancel/refund. Every money movement is recorded in
 * the platform finance ledger so admin finance stays in sync.
 *
 * - Rider failed-trip pay: a reimbursement on the rider's payroll cycle (none of the
 *   supported reasons is the rider's fault), mirrored as a rider_payroll debit.
 * - Restaurant compensation (customer-fault only): a restaurant ledger adjustment that
 *   flows into their payout, mirrored as a restaurant_payout debit.
 *
 * NOTE: a partial customer refund (no-show fee) is intentionally NOT executed here yet —
 * the cancel pipeline issues a full refund; charging the fee requires changes in the
 * refund processor and is tracked as a follow-up.
 */
export async function applyFailedDeliveryFinance(params: {
  order: Record<string, any>
  reason: FailedDeliveryReason
}) {
  try {
    const { order, reason } = params
    // External deliveries settle through their own off-platform flow — never apply the
    // platform's failed-delivery compensation (rider trip pay / restaurant ledger comp).
    if (order.source === "external") return
    const fault = deriveFailedDeliveryFault(reason)
    const settings = await getFailedDeliveryFinanceSettings()
    const orderId = String(order._id ?? "")
    const orderNumber = String(order.orderNumber ?? orderId)
    const riderId = order.riderId ? String(order.riderId) : ""
    const subtotal = Number(order.pricing?.subtotal ?? 0)

    // 1) Rider failed-trip pay (reimbursement) — not the rider's fault for any reason.
    if (riderId && settings.riderFailedTripPay > 0) {
      const amount = Math.round(settings.riderFailedTripPay)
      const rider = await RiderModel.findById(riderId).lean()
      const baseSalary = Number(rider?.payroll?.monthlySalary ?? 0)
      await RiderPayrollCycleModel.findOneAndUpdate(
        { riderId, month: currentPayrollMonth() },
        {
          $setOnInsert: {
            riderId,
            month: currentPayrollMonth(),
            baseSalary,
            status: "draft",
          },
          $push: {
            adjustments: {
              type: "reimbursement",
              amount,
              note: `Failed trip pay - ${orderNumber} (${reason})`,
              createdByAdminId: "system",
              createdAt: new Date(),
            },
          },
        },
        { upsert: true },
      )
      await PlatformFinanceEntryModel.create({
        direction: "debit",
        category: "rider_payroll",
        amount,
        sourceEntityType: "order",
        sourceEntityId: orderId,
        note: `Failed-delivery rider trip pay (${reason})`,
        createdByAdminId: "system",
      })
    }

    // 2) Restaurant compensation — only when the customer is at fault (food was made).
    if (
      fault === "customer" &&
      subtotal > 0 &&
      settings.restaurantCompensationPercent > 0 &&
      order.restaurantId
    ) {
      const compAmount = Math.round(
        (subtotal * settings.restaurantCompensationPercent) / 100,
      )
      if (compAmount > 0) {
        await LedgerEntryModel.create({
          restaurantId: order.restaurantId,
          orderId: order._id,
          sourceEntityType: "order",
          sourceEntityId: orderId,
          entryType: "adjustment",
          grossAmount: compAmount,
          netAmount: compAmount,
          serviceAreaSnapshot: order.serviceAreaSnapshot ?? {},
          settlementStatus: "pending",
          availableAt: null,
        })
        await PlatformFinanceEntryModel.create({
          direction: "debit",
          category: "restaurant_payout",
          amount: compAmount,
          sourceEntityType: "order",
          sourceEntityId: orderId,
          note: `Failed-delivery restaurant compensation (${reason})`,
          createdByAdminId: "system",
        })
      }
    }
  } catch (error) {
    logger.warn(
      { error, orderId: String(params.order?._id ?? "") },
      "Failed to apply failed-delivery compensation finance",
    )
  }
}
