export function getCustomerAuthErrorMessage(
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

  if (message === "Internal server error") {
    return "Something went wrong on our side. Please try again in a few seconds.";
  }

  if (message === "Request failed with status 500") {
    return "We could not complete verification right now. Please try again shortly.";
  }

  if (message === "Server returned a non-JSON response.") {
    return "The server returned an unexpected response. Please try again.";
  }

  if (message === "Validation failed") {
    return "Please check the phone number or OTP code and try again.";
  }

  if (message === "This phone number or password is incorrect") {
    return "This phone number or password is incorrect. Please try again.";
  }

  if (message === "OTP has expired") {
    return "This OTP has expired. Request a new one and try again.";
  }

  if (message === "Invalid OTP code") {
    return "That OTP code did not match. Please try again.";
  }

  if (/^too many /i.test(message)) {
    return message;
  }

  if (
    message === "Use at least 6 characters for your password" ||
    message === "Use at least 8 characters for your password"
  ) {
    return "Use at least 6 characters for your password.";
  }

  if (message === "Enter your name to finish creating this account") {
    return "Enter your name to finish creating the account.";
  }

  if (message === "Verify the OTP first before finishing registration") {
    return "Please verify the OTP first, then finish the account details.";
  }

  return message;
}

export function isCustomerRateLimitMessage(message: string) {
  return /^too many /i.test(message.trim());
}

export function isCustomerOtpRequestRateLimitMessage(message: string) {
  const normalized = message.trim().toLowerCase();

  return (
    normalized.startsWith("too many otp requests") ||
    normalized.includes("requesting another code") ||
    normalized.startsWith("too many password recovery attempts")
  );
}

export function isCustomerOtpVerificationLockMessage(message: string) {
  const normalized = message.trim().toLowerCase();

  return (
    normalized.startsWith("too many verification attempts") ||
    normalized.includes("incorrect otp attempts")
  );
}
