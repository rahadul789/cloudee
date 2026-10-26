export function getCustomerPaymentReturnBase(params: {
  clientPlatform?: string;
  websiteOrigin: string;
  backendOrigin: string;
  apiPrefix: string;
}) {
  if (params.clientPlatform === "web") {
    // The origin comes from server configuration, never from a payment request.
    return `${params.websiteOrigin.replace(/\/+$/, "")}/payment-return`;
  }
  return `${params.backendOrigin.replace(/\/+$/, "")}${params.apiPrefix}/customer/payments/bkash/return`;
}
