import { enqueueBackgroundTask } from "../../common/utils/background-task";
import { emitSocketEvent } from "../../config/socket";
import { OwnerModel } from "../auth/auth.model";
import { sendTransactionalSms } from "../auth/otp-sms.service";
import { NotificationModel } from "../owner/operational.model";
import { sendPushToOwner } from "../owner/push.service";

type PayoutOwnerNotificationStatus = "processing" | "completed" | "failed";

function formatMoney(value: number) {
  return `Tk ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;
}

function formatStatus(status: PayoutOwnerNotificationStatus) {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "processing";
}

function buildTitle(status: PayoutOwnerNotificationStatus) {
  if (status === "completed") return "Payout completed";
  if (status === "failed") return "Payout failed";
  return "Payout processing";
}

function buildSmsMessage(params: {
  amount: number;
  restaurantName?: string;
  status: PayoutOwnerNotificationStatus;
  reference?: string;
}) {
  const restaurantName = params.restaurantName?.trim() || "your restaurant";
  const reference = params.reference?.trim();
  const refText = reference ? ` Ref: ${reference}.` : "";

  return `Foodbela: ${formatMoney(params.amount)} payout for ${restaurantName} is ${formatStatus(
    params.status,
  )}.${refText}`;
}

export async function notifyOwnerPayoutStatus(params: {
  ownerId: string;
  restaurantId: string;
  payoutId: string;
  amount: number;
  status: PayoutOwnerNotificationStatus;
  restaurantName?: string;
  reference?: string;
  sendSms?: boolean;
}) {
  const title = buildTitle(params.status);
  const description = `Your payout for ${formatMoney(params.amount)} is now ${formatStatus(
    params.status,
  )}.`;

  const notification = await NotificationModel.create({
    ownerId: params.ownerId,
    restaurantId: params.restaurantId,
    type: "payout",
    eventType: `payout.${params.status}`,
    entityType: "payout",
    entityId: params.payoutId,
    title,
    description,
    actionPath: "/payouts",
  });

  emitSocketEvent(`owner:${params.ownerId}`, "notification.created", notification.toObject());

  enqueueBackgroundTask("owner.payout.push", async () => {
    await sendPushToOwner({
      ownerId: params.ownerId,
      payload: {
        title,
        body: description,
        data: {
          path: "/(tabs)/payouts",
          type: "payout",
          payoutId: params.payoutId,
          status: params.status,
        },
      },
    });
  });

  if (params.sendSms) {
    enqueueBackgroundTask("owner.payout.sms", async () => {
      const owner = await OwnerModel.findById(params.ownerId).select({ phone: 1 }).lean();
      if (!owner?.phone) return;

      await sendTransactionalSms({
        phone: owner.phone,
        message: buildSmsMessage(params),
      });
    });
  }
}
