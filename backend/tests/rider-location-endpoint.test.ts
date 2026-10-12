import request from "supertest";
import { createApp } from "../src/app";
import * as sessions from "../src/modules/auth/session-control.service";
import { signAccessToken } from "../src/modules/auth/auth.utils";
import * as riders from "../src/modules/rider/rider.service";
import * as content from "../src/modules/public/content.service";

jest.mock("../src/modules/rider/rider.service", () => ({
  updateRiderLastKnownLocation: jest.fn(),
}));

describe("production rider location endpoint", () => {
  beforeEach(() => {
    jest.spyOn(content, "getAuthRateLimitSettings").mockResolvedValue(content.defaultAuthRateLimitSettings);
  });
  afterEach(() => jest.restoreAllMocks());

  it("accepts legacy native metadata over HTTP and forwards usable coordinates", async () => {
    jest.spyOn(sessions, "isAccessSessionActive").mockResolvedValue(true);
    const upload = jest.spyOn(riders, "updateRiderLastKnownLocation").mockResolvedValue({
      id: "rider-http", fullName: "Test Rider", phone: "test", activeTrackingOrderId: "order-http",
    } as any);
    const token = signAccessToken({ subject: "rider-http", role: "rider", tokenId: "session-http" });
    const response = await request(createApp())
      .patch("/api/v1/rider/profile/location")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: 23.8, longitude: 90.4, heading: -1, accuracyMeters: -1 })
      .expect(200);
    expect(response.body.success).toBe(true);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ riderId: "rider-http", latitude: 23.8 }));
    expect(upload.mock.calls[0][0].heading).toBeUndefined();
    expect(upload.mock.calls[0][0].accuracyMeters).toBeUndefined();
  });

  it("refuses unauthenticated location writes", async () => {
    const upload = jest.spyOn(riders, "updateRiderLastKnownLocation");
    await request(createApp()).patch("/api/v1/rider/profile/location")
      .send({ latitude: 23.8, longitude: 90.4 }).expect(401);
    expect(upload).not.toHaveBeenCalled();
  });
});
