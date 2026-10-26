import { getCustomerPaymentReturnBase } from "../src/modules/customer/customer-payment-return";
const origins = { websiteOrigin: "https://foodbela.com/", backendOrigin: "https://api.foodbela.com", apiPrefix: "/api/v1" };
describe("customer payment return", () => {
  it("returns web payments to the configured storefront", () => {
    expect(getCustomerPaymentReturnBase({ ...origins, clientPlatform: "web" })).toBe("https://foodbela.com/payment-return");
  });
  it.each([undefined, "app", "https://evil.example"]) ("preserves the existing app return for %s", (clientPlatform) => {
    expect(getCustomerPaymentReturnBase({ ...origins, clientPlatform })).toBe("https://api.foodbela.com/api/v1/customer/payments/bkash/return");
  });
});
