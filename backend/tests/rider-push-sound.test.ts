jest.mock("../src/config/socket", () => ({ emitSocketEvent: jest.fn() }));
jest.mock("../src/common/utils/fetch-with-timeout", () => ({ fetchWithTimeout: jest.fn() }));

import { RiderModel } from "../src/modules/auth/auth.model";
import { fetchWithTimeout } from "../src/common/utils/fetch-with-timeout";
import { sendPushToRider } from "../src/modules/rider/push.service";
import { emitSocketEvent } from "../src/config/socket";

describe("rider push sounds", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["new-order-headsup", "new_order.mp3"],
    ["new-order-placed", "new_order_placed.mp3"],
    ["new-delivery", "new_delivery.mp3"],
    ["delivery-late", "delivery_hurry.mp3"],
    ["general", "common.mp3"],
  ])("sends %s with sound %s for iOS and the Android channel", async (channelId, sound) => {
    jest.spyOn(RiderModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as any);
    jest.spyOn(RiderModel, "findById").mockReturnValue({
      select: () => Promise.resolve({ pushTokens: [{ expoPushToken: "ExpoPushToken[test-rider]" }] }),
    } as any);
    jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "ok" }] }) } as any);
    await sendPushToRider({ riderId: "rider-1", payload: { title: "Order", body: "Incoming order", channelId } });
    const request = jest.mocked(fetchWithTimeout).mock.calls.at(-1)?.[1];
    expect(JSON.parse(String(request?.body))).toEqual([
      expect.objectContaining({ sound, channelId, priority: "high", data: expect.objectContaining({ channelId, notificationId: expect.any(String) }) }),
    ]);
    const message = JSON.parse(String(request?.body))[0];
    expect(emitSocketEvent).toHaveBeenCalledWith("rider:rider-1", "rider.notification.created", expect.objectContaining({ channelId, notificationId: message.data.notificationId }));
  });
});
