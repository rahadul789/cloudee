import { enqueueBackgroundTask } from "../../common/utils/background-task"
import { OrderModel } from "../owner/operational.model"
import { sendPushToCustomer } from "./push.service"

export async function notifyCustomerLiveTrackingStartedOnce(params: {
  orderId: string
  source: "rider" | "admin" | "system"
}) {
  const orderId = params.orderId.trim()
  if (!orderId) return false

  const order = await OrderModel.findOneAndUpdate(
    {
      _id: orderId,
      status: "PickedUp",
      customerId: { $exists: true, $ne: "" },
      $or: [
        { "riderTracking.liveTrackingNotifiedAt": { $exists: false } },
        { "riderTracking.liveTrackingNotifiedAt": null },
      ],
    },
    {
      $set: {
        "riderTracking.liveTrackingNotifiedAt": new Date(),
      },
    },
    { new: false },
  )
    .select("_id customerId")
    .lean()

  const customerId = String(order?.customerId ?? "").trim()
  if (!order || !customerId) return false

  enqueueBackgroundTask("customer.live_tracking_started.push", async () => {
    await sendPushToCustomer({
      customerId,
      payload: {
        title: "Live tracking started",
        body: "Your rider is now sharing live location. Follow the route on the map.",
        data: {
          type: "rider_live_tracking",
          orderId,
          path: `/orders/${orderId}/tracking`,
          liveTrackingSource: params.source,
        },
      },
    })
  })

  return true
}
