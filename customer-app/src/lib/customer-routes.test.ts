import { resolveCustomerPushRoute, resolveCustomerRoute } from "./customer-routes";

describe("customer routes (admin link targets)", () => {
  it("accepts the targets the admin link picker produces", () => {
    expect(resolveCustomerRoute("/(tabs)")).toBe("/(tabs)");
    expect(resolveCustomerRoute("/search?query=biryani")).toBe("/search?query=biryani");
    expect(resolveCustomerRoute("/restaurants/abc123")).toBe("/restaurants/abc123");
    expect(resolveCustomerRoute("/offers")).toBe("/offers");
    expect(resolveCustomerRoute("/(tabs)/favorites")).toBe("/(tabs)/favorites");
    expect(resolveCustomerRoute("/(tabs)/hype")).toBe("/(tabs)/hype");
    expect(resolveCustomerRoute("/watch/65a1b2c3d4e5f60718293a4b")).toBe(
      "/watch/65a1b2c3d4e5f60718293a4b",
    );
  });

  it("rejects unknown or unsafe targets", () => {
    expect(resolveCustomerRoute("https://evil.example", null)).toBeNull();
    expect(resolveCustomerRoute("/not-a-screen", null)).toBeNull();
  });

  it("routes special pushes", () => {
    expect(resolveCustomerPushRoute({ type: "cart_reminder" })).toBe("/(tabs)/cart");
    expect(resolveCustomerPushRoute({ type: "open_notify" })).toBe("/(tabs)");
  });
});
