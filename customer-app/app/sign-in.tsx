import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CustomerOtpField,
  type CustomerOtpFieldHandle,
} from "@/src/components/customer-otp-field";
import { Screen } from "@/src/components/screen";
import {
  type CustomerAuthLocationSnapshot,
  useCustomerPasswordResetMutation,
  useCustomerPasswordResetOtpVerifyMutation,
  useCustomerPasswordResetStartMutation,
  useCustomerPasswordSigninMutation,
  useCustomerPhoneStartMutation,
} from "@/src/hooks/use-customer-api";
import {
  useSafeAnimationFrame,
  useSafeTimeout,
} from "@/src/hooks/use-safe-timeout";
import {
  getCustomerAuthErrorMessage,
  isCustomerOtpRequestRateLimitMessage,
  isCustomerOtpVerificationLockMessage,
  isCustomerRateLimitMessage,
} from "@/src/lib/auth-error-message";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { resolvePostAuthRedirect } from "@/src/lib/auth-navigation";
import { getStableCustomerInstallId } from "@/src/lib/customer-install-id";
import {
  OTP_REQUEST_RATE_LIMIT_SECONDS,
  OTP_VERIFY_LOCK_SECONDS,
  formatOtpCountdown,
  resolveOtpResendSeconds,
} from "@/src/lib/otp-timing";
import { maskPhoneForDisplay } from "@/src/lib/phone-display";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type { SavedLocation } from "@/src/types/location";

function sanitizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(0, 11);
}

const CUSTOMER_AUTH_OTP_CODE_LENGTH = 4;
const foodbelaLogo = require("../assets/images/icon.png");

function shouldReplaceAuthStack(redirectTo?: string | null) {
  const target = redirectTo?.trim().toLowerCase() ?? "";
  return target === "/checkout" || target.startsWith("/checkout?");
}

type AuthStep = "phone" | "password" | "resetOtp" | "resetPassword";

function buildAuthLocationSnapshot(
  location?: SavedLocation | null
): CustomerAuthLocationSnapshot | undefined {
  if (
    !location ||
    typeof location.latitude !== "number" ||
    typeof location.longitude !== "number"
  ) {
    return undefined;
  }

  return {
    label: location.label,
    address: location.address,
    addressDetails: location.addressDetails,
    latitude: location.latitude,
    longitude: location.longitude,
    source: location.source,
    serviceArea: location.serviceArea ?? null,
  };
}

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    redirectTo?: string;
  }>();
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const customer = useCustomerAuthStore((state) => state.customer);
  const setPendingPhoneAuth = useCustomerAuthStore(
    (state) => state.setPendingPhoneAuth,
  );
  const startPhoneMutation = useCustomerPhoneStartMutation();
  const passwordSigninMutation = useCustomerPasswordSigninMutation();
  const passwordResetStartMutation = useCustomerPasswordResetStartMutation();
  const passwordResetOtpVerifyMutation =
    useCustomerPasswordResetOtpVerifyMutation();
  const passwordResetMutation = useCustomerPasswordResetMutation();
  const [step, setStep] = useState<AuthStep>("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetOtpCode, setResetOtpCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [passwordResetSessionId, setPasswordResetSessionId] = useState("");
  const [passwordResetResendCountdown, setPasswordResetResendCountdown] =
    useState(0);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [existingCustomerName, setExistingCustomerName] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [resetOtpLockCountdown, setResetOtpLockCountdown] = useState(0);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [resetPasswordFocused, setResetPasswordFocused] = useState(false);
  const [resetConfirmFocused, setResetConfirmFocused] = useState(false);
  const resetOtpFieldRef = useRef<CustomerOtpFieldHandle | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const resetPasswordInputRef = useRef<TextInput | null>(null);
  const resetConfirmInputRef = useRef<TextInput | null>(null);
  const scheduleTimeout = useSafeTimeout();
  const scheduleAnimationFrame = useSafeAnimationFrame();

  const scrollToPhoneField = useCallback(() => {
    scheduleAnimationFrame(() => {
      scheduleTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Platform.OS === "android" ? 96 : 118,
          animated: true,
        });
      }, 80);
    });
  }, [scheduleAnimationFrame, scheduleTimeout]);

  const scrollToPasswordField = useCallback(() => {
    scheduleAnimationFrame(() => {
      scheduleTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Platform.OS === "android" ? 104 : 124,
          animated: true,
        });
      }, 80);
    });
  }, [scheduleAnimationFrame, scheduleTimeout]);

  const scrollToResetOtpField = useCallback(() => {
    scheduleAnimationFrame(() => {
      scheduleTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Platform.OS === "android" ? 88 : 104,
          animated: true,
        });
      }, 80);
    });
  }, [scheduleAnimationFrame, scheduleTimeout]);

  const scrollToResetPasswordField = useCallback(() => {
    scheduleAnimationFrame(() => {
      scheduleTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Platform.OS === "android" ? 124 : 146,
          animated: true,
        });
      }, 80);
    });
  }, [scheduleAnimationFrame, scheduleTimeout]);

  const primaryActionBusy =
    (step === "phone" && startPhoneMutation.isPending) ||
    (step === "password" && passwordSigninMutation.isPending) ||
    (step === "resetOtp" && passwordResetOtpVerifyMutation.isPending) ||
    (step === "resetPassword" && passwordResetMutation.isPending);
  const phoneIsValid = useMemo(() => /^01\d{9}$/.test(phone), [phone]);
  const passwordIsReady = password.trim().length > 0;
  const resetPasswordIsValid =
    resetPassword.trim().length >= 6 &&
    resetPassword === resetConfirmPassword;
  const resetOtpIsLocked = resetOtpLockCountdown > 0;
  const actionIsDisabled =
    primaryActionBusy ||
    (step === "phone" && !phoneIsValid) ||
    (step === "password" && !passwordIsReady) ||
    (step === "resetOtp" &&
      (resetOtpCode.length !== CUSTOMER_AUTH_OTP_CODE_LENGTH ||
        resetOtpIsLocked));
  const screenTitle = "Welcome to Foodbela";
  const isPasswordRecoveryStep =
    step === "resetOtp" || step === "resetPassword";
  const resetOtpHasError = Boolean(
    errorText && step === "resetOtp" && !isCustomerRateLimitMessage(errorText)
  );

  useEffect(() => {
    if (customer) {
      router.replace(resolvePostAuthRedirect(params.redirectTo) as never);
    }
  }, [customer, params.redirectTo, router]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
      if (step === "phone") {
        scrollToPhoneField();
      }
      if (step === "password") {
        scrollToPasswordField();
      }
      if (step === "resetOtp") {
        scrollToResetOtpField();
      }
      if (step === "resetPassword") {
        scrollToResetPasswordField();
      }
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [
    scrollToPasswordField,
    scrollToPhoneField,
    scrollToResetOtpField,
    scrollToResetPasswordField,
    step,
  ]);

  useEffect(() => {
    if (step !== "resetOtp" || passwordResetResendCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setPasswordResetResendCountdown((current) =>
        current <= 1 ? 0 : current - 1,
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [passwordResetResendCountdown, step]);

  useEffect(() => {
    if (step !== "resetOtp" || resetOtpLockCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResetOtpLockCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resetOtpLockCountdown, step]);

  useEffect(() => {
    if (
      step === "resetOtp" &&
      resetOtpLockCountdown === 0 &&
      isCustomerOtpVerificationLockMessage(errorText)
    ) {
      setErrorText("");
    }
  }, [errorText, resetOtpLockCountdown, step]);

  useEffect(() => {
    if (
      step === "resetOtp" &&
      passwordResetResendCountdown === 0 &&
      isCustomerOtpRequestRateLimitMessage(errorText)
    ) {
      setErrorText("");
    }
  }, [errorText, passwordResetResendCountdown, step]);

  useEffect(() => {
    if (step !== "resetPassword") {
      return;
    }

    const cancelFocusTimer = scheduleTimeout(() => {
      resetPasswordInputRef.current?.focus();
    }, 250);

    return cancelFocusTimer;
  }, [scheduleTimeout, step]);

  function focusInput(input: TextInput | null) {
    if (!input) {
      return;
    }

    if (Platform.OS === "android" && input.isFocused() && !isKeyboardVisible) {
      input.blur();
      scheduleTimeout(() => input.focus(), 40);
      return;
    }

    input.focus();
  }

  function focusResetPasswordInput() {
    focusInput(resetPasswordInputRef.current);
  }

  function focusResetConfirmInput() {
    focusInput(resetConfirmInputRef.current);
  }

  function continueWithOtpSession(
    cleanPhone: string,
    data: {
      verificationSessionId?: string;
      expiresInSeconds?: number;
      resendAvailableInSeconds?: number;
      customer?: { fullName?: string; email?: string } | null;
    },
  ) {
    if (!data.verificationSessionId) {
      setErrorText(
        "We could not start verification right now. Please try again.",
      );
      return;
    }

    setPendingPhoneAuth({
      phone: cleanPhone,
      verificationSessionId: data.verificationSessionId,
      redirectTo: params.redirectTo,
      fullName: data.customer?.fullName?.trim() || "",
      email: data.customer?.email?.trim() || "",
      otpVerified: false,
      expiresInSeconds: data.expiresInSeconds,
      resendAvailableInSeconds: resolveOtpResendSeconds(
        data.resendAvailableInSeconds,
      ),
    });
    void trackCustomerEvent({
      eventType: "signup_started",
      path: "/sign-in",
      screenName: "sign-in",
      metadata: {
        redirectTo: params.redirectTo ?? "",
      },
    });
    if (shouldReplaceAuthStack(params.redirectTo)) {
      router.replace("/verify");
      return;
    }

    router.push("/verify");
  }

  async function handleContinue() {
    const cleanPhone = sanitizePhone(phone);

    if (!/^01\d{9}$/.test(cleanPhone)) {
      setErrorText("Enter a valid 11-digit phone number starting with 01.");
      return;
    }

    setErrorText("");

    try {
      const data = await startPhoneMutation.mutateAsync({ phone: cleanPhone });

      if (data.flow === "password") {
        setPhone(cleanPhone);
        setStep("password");
        setExistingCustomerName(data.customer?.fullName?.trim() || "");
        setPassword("");
        setSuccessText("");
        return;
      }

      continueWithOtpSession(cleanPhone, data);
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not continue right now."),
      );
    }
  }

  async function handleLoginWithOtp() {
    const cleanPhone = sanitizePhone(phone);

    if (!/^01\d{9}$/.test(cleanPhone)) {
      setErrorText("Enter a valid phone number before requesting OTP.");
      return;
    }

    setErrorText("");
    setSuccessText("");

    try {
      const data = await startPhoneMutation.mutateAsync({
        phone: cleanPhone,
        useOtp: true,
      });
      continueWithOtpSession(cleanPhone, data);
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not send OTP right now."),
      );
    }
  }

  async function handlePasswordLogin() {
    if (!password.trim()) {
      setErrorText("Enter your password to sign in.");
      return;
    }

    setErrorText("");
    setSuccessText("");

    try {
      await passwordSigninMutation.mutateAsync({
        phone,
        password: password.trim(),
        installId: await getStableCustomerInstallId(),
        currentLocation: buildAuthLocationSnapshot(selectedLocation),
      });
      router.replace(resolvePostAuthRedirect(params.redirectTo) as never);
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not sign you in right now."),
      );
    }
  }

  async function handleForgotPassword() {
    if (step === "resetOtp" && resetOtpIsLocked) {
      return;
    }

    const cleanPhone = sanitizePhone(phone);

    if (!/^01\d{9}$/.test(cleanPhone)) {
      setErrorText("Enter a valid phone number before resetting password.");
      return;
    }

    setErrorText("");
    setSuccessText("");

    try {
      const data = await passwordResetStartMutation.mutateAsync({
        phone: cleanPhone,
      });
      setPhone(data.phone || cleanPhone);
      setPasswordResetSessionId(data.verificationSessionId);
      setPasswordResetResendCountdown(
        resolveOtpResendSeconds(data.resendAvailableInSeconds),
      );
      setResetOtpLockCountdown(0);
      setResetOtpCode("");
      setResetPassword("");
      setResetConfirmPassword("");
      setStep("resetOtp");
    } catch (error) {
      const message = getCustomerAuthErrorMessage(
        error,
        "Could not send password reset OTP right now.",
      );
      setErrorText(message);

      if (isCustomerOtpVerificationLockMessage(message)) {
        setResetOtpLockCountdown(OTP_VERIFY_LOCK_SECONDS);
        Keyboard.dismiss();
        resetOtpFieldRef.current?.blur();
      } else if (isCustomerOtpRequestRateLimitMessage(message)) {
        setPasswordResetResendCountdown(OTP_REQUEST_RATE_LIMIT_SECONDS);
      }
    }
  }

  async function handleVerifyResetOtp() {
    if (resetOtpIsLocked) {
      return;
    }

    if (resetOtpCode.length !== CUSTOMER_AUTH_OTP_CODE_LENGTH) {
      setErrorText(
        `Enter the ${CUSTOMER_AUTH_OTP_CODE_LENGTH}-digit OTP sent to this phone number.`,
      );
      resetOtpFieldRef.current?.forceFocus();
      return;
    }

    setErrorText("");

    try {
      const data = await passwordResetOtpVerifyMutation.mutateAsync({
        verificationSessionId: passwordResetSessionId,
        otpCode: resetOtpCode,
      });
      setPasswordResetSessionId(data.verificationSessionId);
      setStep("resetPassword");
    } catch (error) {
      setResetOtpCode("");
      const message = getCustomerAuthErrorMessage(
        error,
        "Could not verify this OTP.",
      );
      setErrorText(message);

      if (isCustomerOtpVerificationLockMessage(message)) {
        setResetOtpLockCountdown(OTP_VERIFY_LOCK_SECONDS);
        Keyboard.dismiss();
        resetOtpFieldRef.current?.blur();
        return;
      }

      resetOtpFieldRef.current?.forceFocus();
    }
  }

  async function handleResetPassword() {
    if (resetPassword.trim().length < 6) {
      setErrorText("Use at least 6 characters for your password.");
      return;
    }

    if (resetPassword !== resetConfirmPassword) {
      setErrorText("Passwords do not match yet. Please recheck them.");
      return;
    }

    setErrorText("");

    try {
      await passwordResetMutation.mutateAsync({
        verificationSessionId: passwordResetSessionId,
        newPassword: resetPassword.trim(),
      });
      setPassword("");
      setResetOtpCode("");
      setResetPassword("");
      setResetConfirmPassword("");
      setPasswordResetSessionId("");
      setPasswordResetResendCountdown(0);
      setResetOtpLockCountdown(0);
      setSuccessText("Password updated. Sign in with your new password.");
      setStep("password");
    } catch (error) {
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not reset your password."),
      );
    }
  }

  function handleResetOtpChange(value: string) {
    if (resetOtpIsLocked) {
      return;
    }

    setResetOtpCode(value);
    setErrorText("");
  }

  function getPrimaryActionLabel() {
    if (step === "password") return "Sign in";
    if (step === "resetOtp") {
      return resetOtpIsLocked
        ? `Try again in ${formatOtpCountdown(resetOtpLockCountdown)}`
        : "Verify OTP";
    }
    if (step === "resetPassword") return "Update password";
    return "Continue";
  }

  function handlePrimaryAction() {
    if (step === "password") {
      void handlePasswordLogin();
      return;
    }

    if (step === "resetOtp") {
      void handleVerifyResetOtp();
      return;
    }

    if (step === "resetPassword") {
      void handleResetPassword();
      return;
    }

    void handleContinue();
  }

  function handleBack() {
    if (isPasswordRecoveryStep) {
      setStep("password");
      setResetOtpCode("");
      setResetOtpLockCountdown(0);
      setResetPassword("");
      setResetConfirmPassword("");
      setResetPasswordVisible(false);
      setResetConfirmVisible(false);
      setErrorText("");
      return;
    }

    if (step === "password") {
      setStep("phone");
      setPassword("");
      setPasswordVisible(false);
      setExistingCustomerName("");
      setErrorText("");
      setSuccessText("");
      return;
    }

    router.back();
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          keyboardShouldPersistTaps="always"
          bounces={false}
          scrollEnabled
          contentContainerStyle={[
            styles.container,
            {
              paddingBottom: isKeyboardVisible
                ? Math.max(insets.bottom, 16) + 92
                : Math.max(insets.bottom, 16),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              onPress={handleBack}
              style={styles.backButton}
              android_ripple={{ color: "#F7E1EA" }}
            >
              <Ionicons
                name="chevron-back"
                size={21}
                color={palette.foreground}
              />
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroVisual}>
              <View style={styles.heroVisualShadow} />
              <View style={styles.heroVisualCard}>
                <View style={styles.heroVisualTop}>
                  <View style={styles.heroVisualDash} />
                  <Ionicons name="sparkles" size={16} color={palette.amber} />
                </View>
                <View style={styles.heroIcon}>
                  <Image
                    source={foodbelaLogo}
                    style={styles.heroLogo}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                </View>
                <View style={styles.heroMiniBadge}>
                  <Ionicons
                    name={
                      step === "password"
                        ? "lock-closed-outline"
                        : "log-in-outline"
                    }
                    size={12}
                    color={palette.foreground}
                  />
                </View>
              </View>
              <View style={[styles.floatingIcon, styles.floatingIconLeft]}>
                <Ionicons
                  name="bag-handle-outline"
                  size={18}
                  color={palette.foreground}
                />
              </View>
              <View style={[styles.floatingIcon, styles.floatingIconRight]}>
                <Ionicons
                  name="flash-outline"
                  size={17}
                  color={palette.foreground}
                />
              </View>
            </View>
            <Text style={styles.title}>{screenTitle}</Text>
          </View>

          <View style={styles.authPanel}>
            {step !== "phone" ? (
              <View style={styles.accountPreview}>
                <View style={styles.accountPreviewIcon}>
                  <Ionicons
                    name={isPasswordRecoveryStep ? "key-outline" : "person-outline"}
                    size={18}
                    color={palette.primary}
                  />
                </View>
                <View style={styles.accountPreviewCopy}>
                  <Text style={styles.accountPreviewLabel}>
                    {isPasswordRecoveryStep ? "Reset password" : "Account found"}
                  </Text>
                  <Text style={styles.accountPreviewValue}>
                    {step === "resetOtp" ? maskPhoneForDisplay(phone) : phone}
                  </Text>
                  {isPasswordRecoveryStep ? (
                    <Text style={styles.accountPreviewMeta}>
                      {step === "resetOtp"
                        ? "Enter the OTP sent to this number"
                        : "Create a new password"}
                    </Text>
                  ) : existingCustomerName ? (
                    <Text style={styles.accountPreviewMeta}>
                      {existingCustomerName}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    setStep("phone");
                    setPassword("");
                    setPasswordVisible(false);
                    setResetOtpCode("");
                    setResetOtpLockCountdown(0);
                    setResetPassword("");
                    setResetConfirmPassword("");
                    setResetPasswordVisible(false);
                    setResetConfirmVisible(false);
                    setErrorText("");
                    setSuccessText("");
                  }}
                  style={styles.changeNumberButton}
                >
                  <Ionicons
                    name="create-outline"
                    size={13}
                    color={palette.foreground}
                  />
                  <Text style={styles.changeNumberButtonText}>Change</Text>
                </Pressable>
              </View>
            ) : null}

            {step === "phone" ? (
              <>
                <View
                  style={[
                    styles.fieldCard,
                    phoneFocused ? styles.fieldCardFocused : null,
                    errorText ? styles.fieldCardError : null,
                  ]}
                >
                  <View style={styles.fieldCardHeader}>
                    <View style={styles.fieldCardIcon}>
                      <Ionicons
                        name="call"
                        size={16}
                        color={palette.secondary}
                      />
                    </View>
                    <Text style={styles.label}>Phone number</Text>
                    {phoneIsValid ? (
                      <View style={styles.validBadge}>
                        <Ionicons
                          name="checkmark"
                          size={13}
                          color="#FFFFFF"
                        />
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.inputShell,
                      phoneFocused ? styles.inputShellFocused : null,
                    ]}
                  >
                    <View style={styles.dialCodePill}>
                      <Text style={styles.dialCodeText}>BD</Text>
                    </View>
                    <TextInput
                      value={phone}
                      onChangeText={(value) => {
                        setPhone(sanitizePhone(value));
                        setErrorText("");
                      }}
                      placeholder="01XXXXXXXXX"
                      placeholderTextColor={palette.placeholder}
                      keyboardType="number-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      returnKeyType="done"
                      onFocus={() => {
                        setPhoneFocused(true);
                        scrollToPhoneField();
                      }}
                      onBlur={() => setPhoneFocused(false)}
                      style={styles.input}
                    />
                  </View>
                </View>

              </>
            ) : step === "password" ? (
              <View
                style={[
                  styles.fieldCard,
                  passwordFocused ? styles.fieldCardFocused : null,
                  errorText ? styles.fieldCardError : null,
                ]}
              >
                <View style={styles.fieldCardHeader}>
                  <View style={styles.fieldCardIcon}>
                    <Ionicons
                      name="lock-closed"
                      size={15}
                      color={palette.secondary}
                    />
                  </View>
                  <Text style={styles.label}>Password</Text>
                </View>
                <View
                  style={[
                    styles.inputShell,
                    passwordFocused ? styles.inputShellFocused : null,
                  ]}
                >
                  <TextInput
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      setErrorText("");
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor={palette.placeholder}
                    secureTextEntry={!passwordVisible}
                    textContentType="password"
                    autoComplete="password"
                    autoCapitalize="none"
                    returnKeyType="done"
                    onFocus={() => {
                      setPasswordFocused(true);
                      scrollToPasswordField();
                    }}
                    onBlur={() => setPasswordFocused(false)}
                    style={styles.input}
                  />
                  <Pressable
                    accessibilityLabel={
                      passwordVisible ? "Hide password" : "Show password"
                    }
                    hitSlop={8}
                    onPress={() => setPasswordVisible((current) => !current)}
                    style={styles.visibilityButton}
                  >
                    <Ionicons
                      name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={palette.mutedForeground}
                    />
                  </Pressable>
                </View>
                <View style={styles.passwordActionRow}>
                  <Pressable
                    style={styles.forgotPasswordButton}
                    onPress={handleLoginWithOtp}
                    disabled={startPhoneMutation.isPending}
                  >
                    {startPhoneMutation.isPending ? (
                      <ActivityIndicator
                        size="small"
                        color={palette.foreground}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="keypad-outline"
                          size={15}
                          color={palette.foreground}
                        />
                        <Text style={styles.forgotPasswordText}>
                          Continue with OTP
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.forgotPasswordButton}
                    onPress={handleForgotPassword}
                    disabled={passwordResetStartMutation.isPending}
                  >
                    {passwordResetStartMutation.isPending ? (
                      <ActivityIndicator
                        size="small"
                        color={palette.foreground}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="help-circle-outline"
                          size={15}
                          color={palette.foreground}
                        />
                        <Text style={styles.forgotPasswordText}>
                          Forgot?
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : step === "resetOtp" ? (
              <View style={styles.resetSection}>
                <CustomerOtpField
                  ref={resetOtpFieldRef}
                  disabled={resetOtpIsLocked}
                  hasError={resetOtpHasError}
                  length={CUSTOMER_AUTH_OTP_CODE_LENGTH}
                  onChange={handleResetOtpChange}
                  onFocus={scrollToResetOtpField}
                  value={resetOtpCode}
                />
                <Pressable
                  style={[
                    styles.primaryButton,
                    actionIsDisabled ? styles.primaryButtonDisabled : null,
                  ]}
                  onPress={handlePrimaryAction}
                  disabled={actionIsDisabled}
                >
                  {primaryActionBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.primaryButtonContent}>
                      <Text style={styles.primaryButtonText}>
                        {getPrimaryActionLabel()}
                      </Text>
                      <Ionicons name="arrow-forward" size={17} color="#fff" />
                    </View>
                  )}
                </Pressable>
                {errorText ? (
                  <View
                    style={[
                      styles.errorCard,
                      isCustomerRateLimitMessage(errorText)
                        ? styles.warningCard
                        : null,
                    ]}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={17}
                      color={
                        isCustomerRateLimitMessage(errorText)
                          ? palette.warningText
                          : "#B4234A"
                      }
                    />
                    <Text
                      style={[
                        styles.errorText,
                        isCustomerRateLimitMessage(errorText)
                          ? styles.warningText
                          : null,
                      ]}
                    >
                      {errorText}
                    </Text>
                  </View>
                ) : null}
                <Pressable
                  style={[
                    styles.resendButton,
                    resetOtpIsLocked ||
                    passwordResetResendCountdown > 0 ||
                    passwordResetStartMutation.isPending
                      ? styles.resendButtonDisabled
                      : null,
                  ]}
                  onPress={handleForgotPassword}
                  disabled={
                    resetOtpIsLocked ||
                    passwordResetResendCountdown > 0 ||
                    passwordResetStartMutation.isPending
                  }
                >
                  <Text style={styles.resendButtonText}>
                    {resetOtpIsLocked
                      ? `Locked ${formatOtpCountdown(resetOtpLockCountdown)}`
                      : passwordResetResendCountdown > 0
                        ? `Resend in ${formatOtpCountdown(passwordResetResendCountdown)}`
                        : "Resend code"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.resetSection}>
                <View
                  style={[
                    styles.fieldCard,
                    resetPasswordFocused ? styles.fieldCardFocused : null,
                    errorText ? styles.fieldCardError : null,
                  ]}
                >
                  <View style={styles.fieldCardHeader}>
                    <View style={styles.fieldCardIcon}>
                      <Ionicons
                        name="lock-closed"
                        size={15}
                        color={palette.secondary}
                      />
                    </View>
                    <Text style={styles.label}>New password</Text>
                  </View>
                  <Pressable
                    style={[
                      styles.inputShell,
                      resetPasswordFocused ? styles.inputShellFocused : null,
                    ]}
                    onPress={focusResetPasswordInput}
                  >
                    <TextInput
                      ref={resetPasswordInputRef}
                      value={resetPassword}
                      onChangeText={(value) => {
                        setResetPassword(value);
                        setErrorText("");
                      }}
                      placeholder="At least 6 characters"
                      placeholderTextColor={palette.placeholder}
                      secureTextEntry={!resetPasswordVisible}
                      textContentType="newPassword"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      returnKeyType="next"
                      showSoftInputOnFocus
                      onPressIn={() => {
                        if (!isKeyboardVisible) {
                          focusResetPasswordInput();
                        }
                      }}
                      onFocus={() => {
                        setResetPasswordFocused(true);
                        scrollToResetPasswordField();
                      }}
                      onBlur={() => setResetPasswordFocused(false)}
                      onSubmitEditing={focusResetConfirmInput}
                      style={styles.input}
                    />
                    <Pressable
                      accessibilityLabel={
                        resetPasswordVisible
                          ? "Hide password"
                          : "Show password"
                      }
                      hitSlop={8}
                      onPress={() =>
                        setResetPasswordVisible((current) => !current)
                      }
                      style={styles.visibilityButton}
                    >
                      <Ionicons
                        name={
                          resetPasswordVisible
                            ? "eye-off-outline"
                            : "eye-outline"
                        }
                        size={20}
                        color={palette.mutedForeground}
                      />
                    </Pressable>
                  </Pressable>
                </View>
                <View
                  style={[
                    styles.fieldCard,
                    resetConfirmFocused ? styles.fieldCardFocused : null,
                    errorText ? styles.fieldCardError : null,
                  ]}
                >
                  <View style={styles.fieldCardHeader}>
                    <View style={styles.fieldCardIcon}>
                      <Ionicons
                        name="shield-checkmark"
                        size={15}
                        color={palette.secondary}
                      />
                    </View>
                    <Text style={styles.label}>Confirm password</Text>
                    {resetPasswordIsValid ? (
                      <View style={styles.validBadge}>
                        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    style={[
                      styles.inputShell,
                      resetConfirmFocused ? styles.inputShellFocused : null,
                    ]}
                    onPress={focusResetConfirmInput}
                  >
                    <TextInput
                      ref={resetConfirmInputRef}
                      value={resetConfirmPassword}
                      onChangeText={(value) => {
                        setResetConfirmPassword(value);
                        setErrorText("");
                      }}
                      placeholder="Re-enter password"
                      placeholderTextColor={palette.placeholder}
                      secureTextEntry={!resetConfirmVisible}
                      textContentType="newPassword"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      returnKeyType="done"
                      showSoftInputOnFocus
                      onPressIn={() => {
                        if (!isKeyboardVisible) {
                          focusResetConfirmInput();
                        }
                      }}
                      onFocus={() => {
                        setResetConfirmFocused(true);
                        scrollToResetPasswordField();
                      }}
                      onBlur={() => setResetConfirmFocused(false)}
                      style={styles.input}
                    />
                    <Pressable
                      accessibilityLabel={
                        resetConfirmVisible ? "Hide password" : "Show password"
                      }
                      hitSlop={8}
                      onPress={() =>
                        setResetConfirmVisible((current) => !current)
                      }
                      style={styles.visibilityButton}
                    >
                      <Ionicons
                        name={
                          resetConfirmVisible
                            ? "eye-off-outline"
                            : "eye-outline"
                        }
                        size={20}
                        color={palette.mutedForeground}
                      />
                    </Pressable>
                  </Pressable>
                </View>
              </View>
            )}

            {successText ? (
              <View style={styles.successCard}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={17}
                  color={palette.successText}
                />
                <Text style={styles.successText}>{successText}</Text>
              </View>
            ) : null}

            {errorText && step !== "resetOtp" ? (
              <View
                style={[
                  styles.errorCard,
                  isCustomerRateLimitMessage(errorText)
                    ? styles.warningCard
                    : null,
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={17}
                  color={
                    isCustomerRateLimitMessage(errorText)
                      ? palette.warningText
                      : "#B4234A"
                  }
                />
                <Text
                  style={[
                    styles.errorText,
                    isCustomerRateLimitMessage(errorText)
                      ? styles.warningText
                      : null,
                  ]}
                >
                  {errorText}
                </Text>
              </View>
            ) : null}

            {step !== "resetOtp" ? (
              <Pressable
                style={[
                  styles.primaryButton,
                  actionIsDisabled ? styles.primaryButtonDisabled : null,
                ]}
                onPress={handlePrimaryAction}
                disabled={actionIsDisabled}
              >
                {primaryActionBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.primaryButtonContent}>
                    <Text style={styles.primaryButtonText}>
                      {getPrimaryActionLabel()}
                    </Text>
                    <Ionicons name="arrow-forward" size={17} color="#fff" />
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 28,
    justifyContent: "flex-start",
    gap: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 2,
  },
  hero: {
    alignItems: "center",
    gap: 11,
    paddingTop: 2,
  },
  heroVisual: {
    width: 116,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  heroVisualShadow: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: "#CFF5E9",
    right: 10,
    bottom: 9,
    transform: [{ rotate: "9deg" }],
  },
  heroVisualCard: {
    width: 82,
    height: 84,
    borderRadius: 24,
    backgroundColor: palette.foreground,
    padding: 10,
    justifyContent: "space-between",
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 5,
    transform: [{ rotate: "-6deg" }],
  },
  heroVisualTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroVisualDash: {
    width: 23,
    height: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)",
  },
  heroLogo: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  heroMiniBadge: {
    position: "absolute",
    right: 9,
    bottom: 9,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.foreground,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  floatingIcon: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 3,
  },
  floatingIconLeft: {
    left: 3,
    top: 43,
    transform: [{ rotate: "-10deg" }],
  },
  floatingIconRight: {
    right: 1,
    top: 17,
    backgroundColor: "#FFF3D8",
    transform: [{ rotate: "12deg" }],
  },
  title: {
    maxWidth: 260,
    fontSize: 31,
    fontWeight: "800",
    color: palette.foreground,
    lineHeight: 36,
    textAlign: "center",
  },
  authPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: palette.surface,
    padding: 18,
    gap: 16,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 3,
  },
  accountPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FFE2D5",
    backgroundColor: "#FFF9F5",
    padding: 14,
  },
  accountPreviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFF0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  accountPreviewCopy: {
    flex: 1,
    gap: 2,
  },
  accountPreviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  accountPreviewValue: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  accountPreviewMeta: {
    fontSize: 13,
    color: palette.mutedForeground,
  },
  changeNumberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  changeNumberButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.foreground,
  },
  forgotPasswordButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: "#F7F5F3",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  passwordActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.foreground,
  },
  resetSection: {
    gap: 12,
  },
  resendButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "#F7F5F3",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  resendButtonDisabled: {
    opacity: 0.72,
  },
  resendButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.foreground,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.foreground,
  },
  fieldCard: {
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F0E8E3",
    backgroundColor: "#FFFDFB",
    padding: 14,
  },
  fieldCardFocused: {
    borderColor: "#FFD4C3",
    backgroundColor: "#FFF9F5",
  },
  fieldCardError: {
    borderColor: "#F1B8C7",
    backgroundColor: "#FFFAFC",
  },
  fieldCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  fieldCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 13,
    backgroundColor: "#FFF0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  validBadge: {
    marginLeft: "auto",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.successText,
    alignItems: "center",
    justifyContent: "center",
  },
  optionalBadge: {
    marginLeft: "auto",
    borderRadius: 999,
    backgroundColor: "#F7F5F3",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  optionalBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  inputShell: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "#F7F5F3",
    paddingHorizontal: 12,
  },
  inputShellFocused: {
    borderColor: "rgba(255, 122, 89, 0.26)",
    backgroundColor: "#FFFFFF",
  },
  dialCodePill: {
    minWidth: 38,
    height: 32,
    borderRadius: 12,
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  dialCodeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 15,
    fontSize: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  visibilityButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#FFF1F5",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  warningCard: {
    backgroundColor: palette.warningSurface,
  },
  successCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    backgroundColor: palette.successSurface,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#B4234A",
  },
  warningText: {
    color: palette.warningText,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: palette.successText,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: palette.secondary,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(255, 99, 146, 0.42)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 3,
  },
  primaryButtonDisabled: {
    backgroundColor: "#D8D2D4",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
