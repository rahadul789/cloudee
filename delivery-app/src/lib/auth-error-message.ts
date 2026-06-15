export function getDeliveryAuthErrorMessage(
  error: unknown,
  fallbackMessage: string
) {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const message = error.message.trim();

  if (!message) {
    return fallbackMessage;
  }

  if (/^too many /i.test(message)) {
    return message;
  }

  if (message === "Invalid OTP code") {
    return "That OTP code did not match. Please try again.";
  }

  if (message === "OTP has expired") {
    return "This OTP has expired. Request a new one and try again.";
  }

  return message;
}

export function isDeliveryRateLimitMessage(message: string) {
  return /^too many /i.test(message.trim());
}
