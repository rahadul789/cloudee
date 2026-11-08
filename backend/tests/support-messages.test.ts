jest.mock("../src/modules/customer/support-telegram.service", () => ({ sendSupportCaseToTelegram: jest.fn().mockResolvedValue({ sent: true }) }));
jest.mock("../src/modules/admin/admin-alert.service", () => ({ createAdminOperationalAlert: jest.fn().mockResolvedValue({ created: true }), resolveAdminOperationalAlertByDedupeKey: jest.fn() }));

import { getSupportActivity } from "../src/modules/admin/support-activity";
import { appendCustomerSupportCaseMessage } from "../src/modules/customer/customer.service";
import { SupportCaseModel } from "../src/modules/owner/experience.model";
import { sendSupportCaseToTelegram } from "../src/modules/customer/support-telegram.service";

describe("support message notifications", () => {
  afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

  it("badges today's unanswered customer reply even on an older conversation", () => {
    const now = new Date("2026-11-08T00:15:00+06:00");
    const item = { source: "customer", status: "open", createdAt: "2026-11-01", replies: [{ senderType: "customer", createdAt: "2026-11-08T00:01:00+06:00" }] };
    expect(getSupportActivity(item, now).isNewToday).toBe(true);
    expect(getSupportActivity({ ...item, replies: [{ senderType: "customer", createdAt: "2026-11-07T23:59:00+06:00" }] }, now).isNewToday).toBe(false);
    expect(getSupportActivity({ ...item, lastAdminMessageAt: "2026-11-08T00:10:00+06:00" }, now).isNewToday).toBe(false);
    expect(getSupportActivity({ ...item, status: "resolved" }, now).isNewToday).toBe(false);
  });

  it("does not badge an admin-initiated conversation until the customer replies", () => {
    const now = new Date("2026-11-08T12:00:00+06:00");
    expect(getSupportActivity({ source: "customer", openedByAdmin: true, status: "open", createdAt: now }, now).isNewToday).toBe(false);
  });

  it("notifies Telegram for every message and appends without overwriting concurrent replies", async () => {
    const id = "507f1f77bcf86cd799439011";
    const item: any = { id, _id: id, source: "customer", status: "open", subject: "Help", message: "First", customerSnapshot: { fullName: "Customer", phone: "test" }, serviceAreaSnapshot: { zoneId: "zone-a", zoneName: "Zone A" }, replies: [],
      toObject() { return { ...this }; } };
    jest.spyOn(SupportCaseModel, "findOne").mockResolvedValue(item);
    const update = jest.spyOn(SupportCaseModel, "findOneAndUpdate").mockImplementation((_filter: any, change: any) => {
      item.replies.push(...change.$push.replies.$each);
      return Promise.resolve(item) as any;
    });
    for (const message of ["Second message", "Third message"]) {
      await appendCustomerSupportCaseMessage({ customerId: id, supportCaseId: id, message });
    }
    expect(sendSupportCaseToTelegram).toHaveBeenCalledTimes(2);
    expect(sendSupportCaseToTelegram).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Third message", isReply: true, areaName: "Zone A" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ customerId: id }), expect.objectContaining({ $push: { replies: { $each: [expect.objectContaining({ senderType: "customer" })], $slice: -300 } } }), { new: true });
    expect(item.replies.map((reply: any) => reply.message)).toEqual(["Second message", "Third message"]);
  });
});
