import request from "supertest";

import { createApp } from "../src/app";

const app = createApp();

describe("health and metrics endpoints", () => {
  it("returns health status and a request id", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);

    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("ok");
  });

  it("returns readiness status without requiring a live database", async () => {
    const response = await request(app).get("/api/v1/health/ready");

    expect([200, 503]).toContain(response.status);
    expect(response.body.success).toBe(true);
    expect(["ready", "not_ready"]).toContain(response.body.data.status);
    expect(["ok", "failed"]).toContain(response.body.data.databasePing);
  });

  it("exposes Prometheus metrics", async () => {
    await request(app).get("/api/v1/health").expect(200);

    const response = await request(app).get("/metrics").expect(200);

    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("foodbela_http_requests_total");
    expect(response.text).toContain("foodbela_mongodb_connected");
  });

  it("collapses unmatched paths into one bounded metrics label", async () => {
    await request(app).get("/api/v1/random-probe-alpha").expect(404);
    await request(app).get("/api/v1/random-probe-beta").expect(404);

    const response = await request(app).get("/metrics").expect(200);

    expect(response.text).toContain('route="/unmatched"');
    expect(response.text).not.toContain("random-probe-alpha");
    expect(response.text).not.toContain("random-probe-beta");
  });
});
