import { enqueueBackgroundTask } from "../../common/utils/background-task";
import { emitSocketEvent } from "../../config/socket";
import { OwnerModel } from "../auth/auth.model";
import { sendTransactionalSms } from "../auth/otp-sms.service";
import { NotificationModel } from "../owner/operational.model";
import { sendLocalizedPushToOwner } from "../owner/push.service";

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

function buildTitleBn(status: PayoutOwnerNotificationStatus) {
  if (status === "completed") return "পেআউট সম্পন্ন হয়েছে";
  if (status === "failed") return "পেআউট ব্যর্থ হয়েছে";
  return "পেআউট প্রসেস হচ্ছে";
}

function buildDescriptionBn(amount: number, status: PayoutOwnerNotificationStatus) {
  const money = formatMoney(amount);
  if (status === "completed") return `আপনার ${money} পেআউট সম্পন্ন হয়েছে।`;
  if (status === "failed") return `আপনার ${money} পেআউট ব্যর্থ হয়েছে।`;
  return `আপনার ${money} পেআউট এখন প্রসেস হচ্ছে।`;
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
  const titleBn = buildTitleBn(params.status);
  const descriptionBn = buildDescriptionBn(params.amount, params.status);

  const owner = await OwnerModel.findById(params.ownerId)
    .select({ phone: 1, preferredLanguage: 1 })
    .lean();
  const useBangla = owner?.preferredLanguage !== "en";

  const notification = await NotificationModel.create({
    ownerId: params.ownerId,
    restaurantId: params.restaurantId,
    type: "payout",
    eventType: `payout.${params.status}`,
    entityType: "payout",
    entityId: params.payoutId,
    title: useBangla ? titleBn : title,
    description: useBangla ? descriptionBn : description,
    actionPath: "/payouts",
  });

  emitSocketEvent(`owner:${params.ownerId}`, "notification.created", notification.toObject());

  enqueueBackgroundTask("owner.payout.push", async () => {
    await sendLocalizedPushToOwner({
      ownerId: params.ownerId,
      en: { title, body: description },
      bn: { title: titleBn, body: descriptionBn },
      data: {
        path: "/(tabs)/payouts",
        type: "payout",
        payoutId: params.payoutId,
        status: params.status,
      },
    });
  });

  if (params.sendSms && owner?.phone) {
    const ownerPhone = owner.phone;
    enqueueBackgroundTask("owner.payout.sms", async () => {
      await sendTransactionalSms({
        phone: ownerPhone,
        message: buildSmsMessage(params),
      });
    });
  }
}
