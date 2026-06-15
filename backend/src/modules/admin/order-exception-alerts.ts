import { enqueueBackgroundTask } from "../../common/utils/background-task";
import { createAdminOperationalAlert } from "./admin-alert.service";
import { recordBusinessEvent } from "./business-event.service";

type OrderExceptionStatus = "Rejected" | "Cancelled";
type OrderExceptionActor = "owner" | "customer" | "system" | "rider" | "admin";

type OrderLike = {
  _id?: unknown;
  id?: unknown;
  orderNumber?: unknown;
  status?: unknown;
  restaurantId?: unknown;
  customerId?: unknown;
  paymentMethod?: unknown;
  paymentStatus?: unknown;
  pricing?: {
    total?: unknown;
  };
  customerSnapshot?: {
    fullName?: unknown;
    name?: unknown;
    phone?: unknown;
  };
};

type BkashAttemptLike = {
  _id?: unknown;
  id?: unknown;
  paymentID?: unknown;
  transactionId?: unknown;
  amount?: unknown;
  customerId?: unknown;
  restaurantId?: unknown;
  orderFinalizationStatus?: unknown;
  status?: unknown;
  paymentStatus?: unknown;
  failureStage?: unknown;
  failureReason?: unknown;
};

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function objectIdValue(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return String(value);
}

function orderIdValue(order: OrderLike) {
  return objectIdValue(order._id ?? order.id);
}

function actorLabel(actor: OrderExceptionActor) {
  switch (actor) {
    case "owner":
      return "restaurant owner";
    case "customer":
      return "customer";
    case "rider":
      return "rider";
    case "admin":
      return "admin";
    default:
      return "system";
  }
}

function statusLabel(status: OrderExceptionStatus) {
  return status === "Rejected" ? "rejected" : "cancelled";
}

function isBkashRefundRequired(order: OrderLike) {
  const paymentMethod = stringValue(order.paymentMethod);
  const paymentStatus = stringValue(order.paymentStatus);
  return (
    paymentMethod.toLowerCase() === "bkash" &&
    ["paid", "refund_pending"].includes(paymentStatus)
  );
}

async function createAdminOrderTerminalExceptionAlert(params: {
  order: OrderLike;
  actor: OrderExceptionActor;
  nextStatus: OrderExceptionStatus;
  previousStatus?: string;
  reason?: string;
  occurredAt?: Date;
}) {
  const order = params.order;
  const orderId = orderIdValue(order);
  if (!orderId) return;

  const orderNumber = stringValue(order.orderNumber, "Order");
  const nextStatusLabel = statusLabel(params.nextStatus);
  const actorName = actorLabel(params.actor);
  const paymentMethod = stringValue(order.paymentMethod, "Unknown");
  const paymentStatus = stringValue(order.paymentStatus, "unknown");
  const refundRequired = isBkashRefundRequired(order);
  const alertType = refundRequired
    ? "payment_bkash_refund_required"
    : `order_${params.actor}_${nextStatusLabel}`;
  const title = refundRequired
    ? `${orderNumber} ${nextStatusLabel} - bKash refund required`
    : `${orderNumber} ${nextStatusLabel} by ${actorName}`;
  const description = refundRequired
    ? `${orderNumber} was ${nextStatusLabel} by ${actorName}. The customer paid by bKash, so admin must review and complete the refund.`
    : `${orderNumber} was ${nextStatusLabel} by ${actorName}.${params.reason ? ` Reason: ${params.reason}` : ""}`;

  await createAdminOperationalAlert({
    alertType,
    severity: refundRequired ? "critical" : params.actor === "system" ? "critical" : "warning",
    title,
    description,
    source: refundRequired ? "Payments" : "Orders",
    entityType: "order",
    entityId: orderId,
    path: `/orders?orderId=${orderId}`,
    iconKey: refundRequired ? "credit-card" : params.nextStatus === "Rejected" ? "ban" : "x-circle",
    dedupeKey: refundRequired
      ? `order:${orderId}:bkash_refund_required`
      : `order:${orderId}:${params.actor}:${nextStatusLabel}`,
    metadata: {
      orderId,
      orderNumber,
      actor: params.actor,
      previousStatus: params.previousStatus ?? "",
      nextStatus: params.nextStatus,
      reason: params.reason ?? "",
      restaurantId: objectIdValue(order.restaurantId),
      customerId: objectIdValue(order.customerId),
      customerName: stringValue(
        order.customerSnapshot?.fullName ?? order.customerSnapshot?.name,
      ),
      customerPhone: stringValue(order.customerSnapshot?.phone),
      paymentMethod,
      paymentStatus,
      total: numberValue(order.pricing?.total),
      refundRequired,
      occurredAt: (params.occurredAt ?? new Date()).toISOString(),
    },
  });

  await recordBusinessEvent({
    event: `order.${params.actor}_${nextStatusLabel}`,
    category: "orders",
    severity: refundRequired || params.actor === "system" ? "critical" : "warning",
    title,
    description,
    entityType: "order",
    entityId: orderId,
    actorType: params.actor,
    metadata: {
      orderNumber,
      previousStatus: params.previousStatus ?? "",
      nextStatus: params.nextStatus,
      reason: params.reason ?? "",
      restaurantId: objectIdValue(order.restaurantId),
      customerId: objectIdValue(order.customerId),
      paymentMethod,
      paymentStatus,
      refundRequired,
    },
  });
}

export function enqueueAdminOrderTerminalExceptionAlert(params: {
  order: OrderLike;
  actor: OrderExceptionActor;
  nextStatus: OrderExceptionStatus;
  previousStatus?: string;
  reason?: string;
  occurredAt?: Date;
  alwaysNotify?: boolean;
  refundOnly?: boolean;
}) {
  if (params.refundOnly && !isBkashRefundRequired(params.order)) {
    return false;
  }

  if (!params.alwaysNotify && params.actor === "customer" && !isBkashRefundRequired(params.order)) {
    return false;
  }

  return enqueueBackgroundTask("admin.order_terminal_exception_alert", async () => {
    await createAdminOrderTerminalExceptionAlert(params);
  });
}

async function createAdminBkashPaidWithoutOrderAlert(params: {
  attempt: BkashAttemptLike;
  paymentID?: string;
  transactionId?: string;
  reason?: string;
  failureStage?: string;
}) {
  const attempt = params.attempt;
  const attemptId = objectIdValue(attempt._id ?? attempt.id);
  if (!attemptId) return;

  const paymentID = params.paymentID || stringValue(attempt.paymentID);
  const transactionId = params.transactionId || stringValue(attempt.transactionId);
  const failureReason =
    params.reason ||
    stringValue(attempt.failureReason) ||
    "bKash payment is paid, but order finalization did not complete.";

  await createAdminOperationalAlert({
    alertType: "payment_bkash_paid_without_order",
    severity: "critical",
    title: "bKash paid but order was not created",
    description: failureReason,
    source: "Payments",
    entityType: "bkash_payment_attempt",
    entityId: attemptId,
    path: "/payments",
    iconKey: "credit-card",
    dedupeKey: `bkash:${attemptId}:paid_without_order`,
    metadata: {
      attemptId,
      paymentID,
      transactionId,
      amount: numberValue(attempt.amount),
      customerId: objectIdValue(attempt.customerId),
      restaurantId: objectIdValue(attempt.restaurantId),
      status: stringValue(attempt.status),
      paymentStatus: stringValue(attempt.paymentStatus),
      orderFinalizationStatus: stringValue(attempt.orderFinalizationStatus),
      failureStage: params.failureStage || stringValue(attempt.failureStage),
      failureReason,
    },
  });

  await recordBusinessEvent({
    event: "payment.bkash_paid_without_order",
    category: "system",
    severity: "critical",
    title: "bKash paid but order was not created",
    description: failureReason,
    entityType: "bkash_payment_attempt",
    entityId: attemptId,
    metadata: {
      attemptId,
      paymentID,
      transactionId,
      amount: numberValue(attempt.amount),
      customerId: objectIdValue(attempt.customerId),
      restaurantId: objectIdValue(attempt.restaurantId),
    },
  });
}

export function enqueueAdminBkashPaidWithoutOrderAlert(params: {
  attempt: BkashAttemptLike;
  paymentID?: string;
  transactionId?: string;
  reason?: string;
  failureStage?: string;
}) {
  return enqueueBackgroundTask("admin.bkash_paid_without_order_alert", async () => {
    await createAdminBkashPaidWithoutOrderAlert(params);
  });
}
