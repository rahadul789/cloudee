import { redirectSystemPath } from "../../app/+native-intent";
describe("Foodbela website App Links", () => {
  it("opens the app home for the public website root", () => {
    expect(redirectSystemPath({ path: "https://foodbela.com/", initial: true })).toBe("/(tabs)");
  });
  it("keeps restaurant/order IDs and query parameters", () => {
    expect(redirectSystemPath({ path: "https://foodbela.com/restaurants/abc?source=web", initial: false })).toBe("/restaurants/abc?source=web");
    expect(redirectSystemPath({ path: "https://foodbela.com/orders/order_123", initial: true })).toBe("/orders/order_123");
  });
  it("preserves existing custom scheme paths", () => {
    expect(redirectSystemPath({ path: "foodbela:///checkout", initial: true })).toBe("foodbela:///checkout");
    expect(redirectSystemPath({ path: "/(tabs)/browse", initial: false })).toBe("/(tabs)/browse");
  });
  it("does not route untrusted website links into protected screens", () => {
    expect(redirectSystemPath({ path: "https://evil.example/orders/123", initial: true })).toBe("/(tabs)");
    expect(redirectSystemPath({ path: "https://foodbela.com/admin", initial: true })).toBe("/(tabs)");
  });
});
