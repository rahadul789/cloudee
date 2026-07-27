import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/screen";
import {
  CustomerOtpField,
  type CustomerOtpFieldHandle,
} from "@/src/components/customer-otp-field";
import {
  type CustomerAuthLocationSnapshot,
  useCustomerOtpCallRequestMutation,
  useCustomerOtpWhatsappMutation,
  useCustomerPhoneOtpVerifyMutation,
  useCustomerPhoneStartMutation,
  useCustomerPhoneVerifyMutation,
} from "@/src/hooks/use-customer-api";
import { useSafeTimeout } from "@/src/hooks/use-safe-timeout";
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
  DEFAULT_OTP_RESEND_SECONDS,
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

const CUSTOMER_AUTH_OTP_CODE_LENGTH = 4;

function buildAuthLocationSnapshot(
  location?: SavedLocation | null,
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

export default function VerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const customer = useCustomerAuthStore((state) => state.customer);
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const pendingPhoneAuth = useCustomerAuthStore(
    (state) => state.pendingPhoneAuth,
  );
  const setPendingPhoneAuth = useCustomerAuthStore(
    (state) => state.setPendingPhoneAuth,
  );
  const verifyOtpMutation = useCustomerPhoneOtpVerifyMutation();
  const resendMutation = useCustomerPhoneStartMutation();
  const callRequestMutation = useCustomerOtpCallRequestMutation();
  const whatsappMutation = useCustomerOtpWhatsappMutation();
  const registerMutation = useCustomerPhoneVerifyMutation();
  const [resendCount, setResendCount] = useState(0);
  const [otpCode, setOtpCode] = useState("");
  const [fullName, setFullName] = useState(pendingPhoneAuth?.fullName ?? "");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [resendCountdown, setResendCountdown] = useState(() =>
    resolveOtpResendSeconds(pendingPhoneAuth?.resendAvailableInSeconds),
  );
  const [otpLockCountdown, setOtpLockCountdown] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [fullNameFocused, setFullNameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const otpFieldRef = useRef<CustomerOtpFieldHandle | null>(null);
  const verifyOtpActionRef = useRef<() => void>(() => undefined);
  const lastAutoSubmittedOtpRef = useRef("");
  const setupPasswordInputRef = useRef<TextInput | null>(null);
  const setupConfirmPasswordInputRef = useRef<TextInput | null>(null);
  const scheduleTimeout = useSafeTimeout();

  const scrollToOtpField = useCallback(() => {
    scheduleTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Platform.OS === "android" ? 132 : 104,
        animated: true,
      });
    }, 80);
  }, [scheduleTimeout]);

  useEffect(() => {
    if (!pendingPhoneAuth && !customer) {
      router.replace("/sign-in");
    }
  }, [customer, pendingPhoneAuth, router]);

  useEffect(() => {
    if (customer) {
      router.replace(
        resolvePostAuthRedirect(pendingPhoneAuth?.redirectTo) as never,
      );
    }
  }, [customer, pendingPhoneAuth?.redirectTo, router]);

  useEffect(() => {
    if (!pendingPhoneAuth) {
      return;
    }

    setFullName(pendingPhoneAuth.fullName ?? "");
  }, [pendingPhoneAuth]);

  useEffect(() => {
    if (resendCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCountdown]);

  useEffect(() => {
    if (otpLockCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setOtpLockCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [otpLockCountdown]);

  useEffect(() => {
    if (
      otpLockCountdown === 0 &&
      isCustomerOtpVerificationLockMessage(errorText)
    ) {
      setErrorText("");
    }
  }, [errorText, otpLockCountdown]);

  useEffect(() => {
    if (
      resendCountdown === 0 &&
      isCustomerOtpRequestRateLimitMessage(errorText)
    ) {
      setErrorText("");
    }
  }, [errorText, resendCountdown]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
      if (pendingPhoneAuth) {
        scrollToOtpField();
      }
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [pendingPhoneAuth, scrollToOtpField]);

  const isOtpStep = useMemo(
    () => Boolean(pendingPhoneAuth),
    [pendingPhoneAuth],
  );
  const otpIsLocked = otpLockCountdown > 0;
  const otpHasError = Boolean(
    errorText && isOtpStep && !isCustomerRateLimitMessage(errorText),
  );
  const verifyOtpDisabled =
    isAuthSubmitting ||
    verifyOtpMutation.isPending ||
    registerMutation.isPending ||
    otpIsLocked ||
    otpCode.length !== CUSTOMER_AUTH_OTP_CODE_LENGTH;
  const passwordIsStrongEnough = password.trim().length >= 6;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const createAccountDisabled = isAuthSubmitting || registerMutation.isPending;

  useEffect(() => {
    if (isOtpStep) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => subscription.remove();
  }, [isOtpStep]);

  useEffect(() => {
    if (otpCode.length < CUSTOMER_AUTH_OTP_CODE_LENGTH) {
      lastAutoSubmittedOtpRef.current = "";
      return;
    }
    if (
      !isOtpStep ||
      verifyOtpDisabled ||
      otpCode.length !== CUSTOMER_AUTH_OTP_CODE_LENGTH
    ) {
      return;
    }
    if (lastAutoSubmittedOtpRef.current === otpCode) {
      return;
    }

    lastAutoSubmittedOtpRef.current = otpCode;
    Keyboard.dismiss();
    scheduleTimeout(() => {
      verifyOtpActionRef.current();
    }, 80);
  }, [isOtpStep, otpCode, scheduleTimeout, verifyOtpDisabled]);

  if (!pendingPhoneAuth) {
    return (
      <Screen>
        <View style={styles.transitionContainer}>
          <View style={styles.transitionIcon}>
            <Ionicons
              name="checkmark-circle"
              size={30}
              color={palette.surface}
            />
          </View>
          <Text style={styles.transitionTitle}>Taking you to Foodbela</Text>
          <View style={styles.transitionLoader}>
            <ActivityIndicator size="small" color={palette.secondary} />
            <Text style={styles.transitionText}>Almost ready</Text>
          </View>
        </View>
      </Screen>
    );
  }

  const currentPendingAuth = pendingPhoneAuth;
  const pendingPhoneDisplay = isOtpStep
    ? maskPhoneForDisplay(currentPendingAuth.phone)
    : currentPendingAuth.phone;

  async function handleVerifyOtp() {
    if (isAuthSubmitting || otpIsLocked) {
      return;
    }

    if (otpCode.length !== CUSTOMER_AUTH_OTP_CODE_LENGTH) {
      setErrorText(
        `Enter the ${CUSTOMER_AUTH_OTP_CODE_LENGTH}-digit OTP we sent to this phone number.`,
      );
      otpFieldRef.current?.forceFocus();
      return;
    }

    setErrorText("");
    setIsAuthSubmitting(true);

    try {
      const data = await verifyOtpMutation.mutateAsync({
        verificationSessionId: currentPendingAuth.verificationSessionId,
        otpCode,
      });

      await registerMutation.mutateAsync({
        verificationSessionId: data.verificationSessionId,
        referralCode: currentPendingAuth.referralCode,
        installId: await getStableCustomerInstallId(),
        currentLocation: buildAuthLocationSnapshot(selectedLocation),
      });

      setOtpCode("");
      setErrorText("");
      void trackCustomerEvent({
        eventType: "signup_completed",
        path: "/verify",
        screenName: "verify",
        metadata: {
          redirectTo: currentPendingAuth.redirectTo ?? "",
        },
      });
      setPendingPhoneAuth(null);
      router.replace(
        resolvePostAuthRedirect(currentPendingAuth.redirectTo) as never,
      );
    } catch (error) {
      setIsAuthSubmitting(false);
      setOtpCode("");
      const message = getCustomerAuthErrorMessage(
        error,
        "Could not sign you in right now.",
      );
      setErrorText(message);

      if (isCustomerOtpVerificationLockMessage(message)) {
        setOtpLockCountdown(OTP_VERIFY_LOCK_SECONDS);
        Keyboard.dismiss();
        otpFieldRef.current?.blur();
        return;
      }

      otpFieldRef.current?.forceFocus();
    }
  }

  verifyOtpActionRef.current = () => {
    void handleVerifyOtp();
  };

  function handleOtpChange(value: string) {
    if (otpIsLocked) {
      return;
    }

    setOtpCode(value);
    setErrorText("");
  }

  async function handleResend() {
    if (isAuthSubmitting || otpIsLocked || resendCountdown > 0) {
      return;
    }

    try {
      const data = await resendMutation.mutateAsync({
        phone: currentPendingAuth.phone,
        useOtp: true,
      });

      if (data.flow !== "otp" || !data.verificationSessionId) {
        setErrorText(
          "This number is ready for password sign-in. Please go back and sign in.",
        );
        return;
      }

      setPendingPhoneAuth({
        ...currentPendingAuth,
        verificationSessionId: data.verificationSessionId,
        fullName:
          data.customer?.fullName?.trim() || currentPendingAuth.fullName,
        email: data.customer?.email?.trim() || currentPendingAuth.email,
        otpVerified: false,
        expiresInSeconds: data.expiresInSeconds,
        resendAvailableInSeconds: resolveOtpResendSeconds(
          data.resendAvailableInSeconds,
        ),
        otpFallback: data.otpFallback ?? currentPendingAuth.otpFallback,
      });
      setResendCount((current) => current + 1);
      setResendCountdown(
        resolveOtpResendSeconds(data.resendAvailableInSeconds),
      );
      setOtpLockCountdown(0);
      setErrorText("");
    } catch (error) {
      const message = getCustomerAuthErrorMessage(
        error,
        "Could not resend the OTP right now.",
      );
      setErrorText(message);
      if (isCustomerOtpVerificationLockMessage(message)) {
        setOtpLockCountdown(OTP_VERIFY_LOCK_SECONDS);
        Keyboard.dismiss();
        otpFieldRef.current?.blur();
      } else if (isCustomerOtpRequestRateLimitMessage(message)) {
        setResendCountdown(OTP_REQUEST_RATE_LIMIT_SECONDS);
      } else if (isCustomerRateLimitMessage(message)) {
        setResendCountdown((current) =>
          Math.max(current, DEFAULT_OTP_RESEND_SECONDS),
        );
      }
    }
  }

  const otpFallback = currentPendingAuth.otpFallback;
  const showWhatsapp = Boolean(
    otpFallback?.whatsappOtpEnabled &&
    resendCount >= (otpFallback?.whatsappAfterResends ?? 1),
  );
  const showCallForOtp = Boolean(
    otpFallback?.telegramFallbackEnabled &&
    otpFallback?.supportCallNumber &&
    resendCount >= (otpFallback?.callButtonAfterResends ?? 2),
  );

  function handleCallForOtp() {
    const number = otpFallback?.supportCallNumber?.trim();
    if (!number) return;
    // Fire the Telegram heads-up (fire-and-forget — no "calling" state) and dial straight
    // away using the number we already have, so the button feels instant.
    callRequestMutation.mutate({
      verificationSessionId: currentPendingAuth.verificationSessionId,
    });
    void Linking.openURL(`tel:${number.replace(/[^\d+]/g, "")}`).catch(
      () => undefined,
    );
  }

  async function handleWhatsapp() {
    if (whatsappMutation.isPending) return;
    setErrorText("");
    try {
      const data = await whatsappMutation.mutateAsync({
        verificationSessionId: currentPendingAuth.verificationSessionId,
      });
      if (!data.sent) {
        setErrorText(
          "Couldn't send the code on WhatsApp right now. Try SMS or call.",
        );
      }
    } catch {
      setErrorText(
        "Couldn't send the code on WhatsApp right now. Try SMS or call.",
      );
    }
  }

  async function handleCreateAccount() {
    if (isAuthSubmitting) {
      return;
    }

    if (!fullName.trim()) {
      setErrorText("Enter your name to finish creating the account.");
      return;
    }

    if (password.trim().length < 6) {
      setErrorText("Use at least 6 characters for your password.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorText("Passwords do not match yet. Please recheck them.");
      return;
    }

    setErrorText("");
    setIsAuthSubmitting(true);

    try {
      await registerMutation.mutateAsync({
        verificationSessionId: currentPendingAuth.verificationSessionId,
        fullName: fullName.trim(),
        password: password.trim(),
        referralCode: currentPendingAuth.referralCode,
        installId: await getStableCustomerInstallId(),
        currentLocation: buildAuthLocationSnapshot(selectedLocation),
      });
      void trackCustomerEvent({
        eventType: "signup_completed",
        path: "/verify",
        screenName: "verify",
        metadata: {
          redirectTo: currentPendingAuth.redirectTo ?? "",
        },
      });
      const redirectTo = resolvePostAuthRedirect(currentPendingAuth.redirectTo);
      setPendingPhoneAuth(null);
      router.replace(redirectTo as never);
    } catch (error) {
      setIsAuthSubmitting(false);
      setErrorText(
        getCustomerAuthErrorMessage(
          error,
          "Could not finish creating the account.",
        ),
      );
    }
  }

  function scrollToLowerFields() {
    scheduleTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Platform.OS === "android" ? 220 : 170,
        animated: true,
      });
    }, 80);
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 12}
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
                ? Math.max(insets.bottom, 16) + 120
                : Math.max(insets.bottom, 16),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => {
                if (!isOtpStep) {
                  return;
                }

                router.back();
              }}
              style={[
                styles.backButton,
                !isOtpStep ? styles.backButtonDisabled : null,
              ]}
              disabled={!isOtpStep}
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
            <View style={styles.heroIconWrap}>
              <View style={styles.heroAccent} />
              <View style={styles.heroIcon}>
                <Ionicons
                  name={isOtpStep ? "keypad-outline" : "person-circle-outline"}
                  size={27}
                  color="#FFFFFF"
                />
              </View>
            </View>
            <Text style={styles.title}>
              {isOtpStep ? "Verify your phone" : "Complete your profile"}
            </Text>
          </View>

          <View style={styles.card}>
            {isOtpStep ? (
              <>
                <View style={styles.phoneCard}>
                  <View style={styles.phoneIcon}>
                    <Ionicons name="call" size={16} color={palette.secondary} />
                  </View>
                  <View style={styles.phoneCopy}>
                    <Text style={styles.phoneLabel}>Code sent to</Text>
                    <Text style={styles.phoneValue}>{pendingPhoneDisplay}</Text>
                  </View>
                  <Pressable
                    onPress={() => router.back()}
                    style={styles.phoneEditButton}
                  >
                    <Ionicons
                      name="create-outline"
                      size={15}
                      color={palette.foreground}
                    />
                  </Pressable>
                </View>

                <CustomerOtpField
                  ref={otpFieldRef}
                  disabled={otpIsLocked}
                  hasError={otpHasError}
                  length={CUSTOMER_AUTH_OTP_CODE_LENGTH}
                  onChange={handleOtpChange}
                  onFocus={scrollToOtpField}
                  value={otpCode}
                />

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
                    styles.primaryButton,
                    verifyOtpDisabled ? styles.primaryButtonDisabled : null,
                  ]}
                  onPress={handleVerifyOtp}
                  disabled={verifyOtpDisabled}
                >
                  {isAuthSubmitting ||
                  verifyOtpMutation.isPending ||
                  registerMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.primaryButtonContent}>
                      {otpIsLocked ? (
                        <Text style={styles.primaryButtonText}>
                          {`Try again in ${formatOtpCountdown(otpLockCountdown)}`}
                        </Text>
                      ) : (
                        <Text style={styles.primaryButtonText}>Verify OTP</Text>
                      )}
                      <Ionicons name="arrow-forward" size={17} color="#fff" />
                    </View>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    isAuthSubmitting ||
                    otpIsLocked ||
                    resendCountdown > 0 ||
                    resendMutation.isPending
                      ? styles.secondaryButtonDisabled
                      : null,
                    pressed ? styles.secondaryButtonPressed : null,
                  ]}
                  onPress={handleResend}
                  disabled={
                    isAuthSubmitting ||
                    otpIsLocked ||
                    resendCountdown > 0 ||
                    resendMutation.isPending
                  }
                >
                  {resendMutation.isPending ? (
                    <ActivityIndicator
                      size="small"
                      color={palette.foreground}
                    />
                  ) : (
                    <Text style={styles.secondaryButtonText}>
                      {otpIsLocked
                        ? `Locked ${formatOtpCountdown(otpLockCountdown)}`
                        : resendCountdown > 0
                          ? `Resend in ${formatOtpCountdown(resendCountdown)}`
                          : "Resend code"}
                    </Text>
                  )}
                </Pressable>

                {showWhatsapp ? (
                  <Pressable
                    onPress={handleWhatsapp}
                    disabled={whatsappMutation.isPending}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 14,
                      marginTop: 8,
                      borderRadius: 14,
                      backgroundColor: "#25D366",
                      opacity: pressed || whatsappMutation.isPending ? 0.85 : 1,
                    })}
                  >
                    {whatsappMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "800",
                            fontSize: 15,
                          }}
                        >
                          Get code on WhatsApp
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : null}

                {showCallForOtp ? (
                  <Pressable
                    onPress={handleCallForOtp}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 14,
                      marginTop: 8,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: palette.secondary,
                      backgroundColor: `${palette.secondary}14`,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Ionicons name="call" size={17} color={palette.secondary} />
                    <Text
                      style={{
                        color: palette.secondary,
                        fontWeight: "800",
                        fontSize: 15,
                      }}
                    >
                      Instant OTP
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.profileIntro}>
                  <View style={styles.profileIntroIcon}>
                    <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                  </View>
                  <View style={styles.profileIntroCopy}>
                    <Text style={styles.profileIntroTitle}>Phone verified</Text>
                    <Text style={styles.profileIntroText}>
                      {pendingPhoneDisplay}
                    </Text>
                  </View>
                </View>

                <View style={styles.profileForm}>
                  <View
                    style={[
                      styles.profileField,
                      fullNameFocused ? styles.profileFieldFocused : null,
                    ]}
                  >
                    <View style={styles.profileFieldIcon}>
                      <Ionicons
                        name="person-outline"
                        size={18}
                        color={palette.secondary}
                      />
                    </View>
                    <View style={styles.profileFieldBody}>
                      <Text style={styles.profileFieldLabel}>Full name</Text>
                      <TextInput
                        value={fullName}
                        onChangeText={(value) => {
                          setFullName(value);
                          setErrorText("");
                        }}
                        placeholder="Your name"
                        placeholderTextColor={palette.placeholder}
                        textContentType="name"
                        autoCapitalize="words"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => setFullNameFocused(true)}
                        onBlur={() => setFullNameFocused(false)}
                        onSubmitEditing={() =>
                          setupPasswordInputRef.current?.focus()
                        }
                        style={styles.profileInput}
                      />
                    </View>
                  </View>

                  <View
                    style={[
                      styles.profileField,
                      passwordFocused ? styles.profileFieldFocused : null,
                    ]}
                  >
                    <View style={styles.profileFieldIcon}>
                      <Ionicons
                        name="lock-closed-outline"
                        size={18}
                        color={palette.secondary}
                      />
                    </View>
                    <View style={styles.profileFieldBody}>
                      <View style={styles.profileFieldLabelRow}>
                        <Text style={styles.profileFieldLabel}>Password</Text>
                        {passwordIsStrongEnough ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={palette.successText}
                          />
                        ) : null}
                      </View>
                      <TextInput
                        ref={setupPasswordInputRef}
                        value={password}
                        onChangeText={(value) => {
                          setPassword(value);
                          setErrorText("");
                        }}
                        placeholder="Minimum 6 characters"
                        placeholderTextColor={palette.placeholder}
                        secureTextEntry={!passwordVisible}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => {
                          setPasswordFocused(true);
                          scrollToLowerFields();
                        }}
                        onBlur={() => setPasswordFocused(false)}
                        onSubmitEditing={() =>
                          setupConfirmPasswordInputRef.current?.focus()
                        }
                        style={styles.profileInput}
                      />
                      <Pressable
                        accessibilityLabel={
                          passwordVisible ? "Hide password" : "Show password"
                        }
                        hitSlop={8}
                        onPress={() =>
                          setPasswordVisible((current) => !current)
                        }
                        style={styles.profileVisibilityButton}
                      >
                        <Ionicons
                          name={
                            passwordVisible ? "eye-off-outline" : "eye-outline"
                          }
                          size={19}
                          color={palette.mutedForeground}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.profileField,
                      confirmPasswordFocused
                        ? styles.profileFieldFocused
                        : null,
                    ]}
                  >
                    <View style={styles.profileFieldIcon}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={18}
                        color={palette.secondary}
                      />
                    </View>
                    <View style={styles.profileFieldBody}>
                      <View style={styles.profileFieldLabelRow}>
                        <Text style={styles.profileFieldLabel}>
                          Confirm password
                        </Text>
                        {passwordsMatch ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={palette.successText}
                          />
                        ) : null}
                      </View>
                      <TextInput
                        ref={setupConfirmPasswordInputRef}
                        value={confirmPassword}
                        onChangeText={(value) => {
                          setConfirmPassword(value);
                          setErrorText("");
                        }}
                        placeholder="Re-enter password"
                        placeholderTextColor={palette.placeholder}
                        secureTextEntry={!confirmPasswordVisible}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        returnKeyType="done"
                        onFocus={() => {
                          setConfirmPasswordFocused(true);
                          scrollToLowerFields();
                        }}
                        onBlur={() => setConfirmPasswordFocused(false)}
                        onSubmitEditing={() => {
                          if (!createAccountDisabled) {
                            void handleCreateAccount();
                          }
                        }}
                        style={styles.profileInput}
                      />
                      <Pressable
                        accessibilityLabel={
                          confirmPasswordVisible
                            ? "Hide password"
                            : "Show password"
                        }
                        hitSlop={8}
                        onPress={() =>
                          setConfirmPasswordVisible((current) => !current)
                        }
                        style={styles.profileVisibilityButton}
                      >
                        <Ionicons
                          name={
                            confirmPasswordVisible
                              ? "eye-off-outline"
                              : "eye-outline"
                          }
                          size={19}
                          color={palette.mutedForeground}
                        />
                      </Pressable>
                    </View>
                  </View>
                </View>

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
                    styles.primaryButton,
                    createAccountDisabled ? styles.primaryButtonDisabled : null,
                  ]}
                  onPress={handleCreateAccount}
                  disabled={createAccountDisabled}
                >
                  {isAuthSubmitting || registerMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.primaryButtonContent}>
                      <Text style={styles.primaryButtonText}>
                        Create account
                      </Text>
                      <Ionicons name="arrow-forward" size={17} color="#fff" />
                    </View>
                  )}
                </Pressable>
              </>
            )}
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
    paddingTop: 12,
    paddingBottom: 28,
    justifyContent: "flex-start",
    gap: 24,
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
  backButtonDisabled: {
    opacity: 0.35,
  },
  hero: {
    alignItems: "center",
    gap: 14,
  },
  heroIconWrap: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAccent: {
    position: "absolute",
    width: 74,
    height: 74,
    borderRadius: 26,
    backgroundColor: "#D7F7EC",
    transform: [{ rotate: "10deg" }],
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 5,
  },
  title: {
    maxWidth: 280,
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38,
    color: palette.foreground,
    textAlign: "center",
  },
  transitionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  transitionIcon: {
    width: 66,
    height: 66,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
    shadowColor: "rgba(255, 99, 146, 0.34)",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 5,
  },
  transitionTitle: {
    maxWidth: 260,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.foreground,
    textAlign: "center",
  },
  transitionLoader: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FFE3EE",
    backgroundColor: "#FFF4F8",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  transitionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  card: {
    borderRadius: 28,
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
  phoneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F0E8E3",
    backgroundColor: "#FFFDFB",
    padding: 13,
  },
  phoneIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#FFF0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneCopy: {
    flex: 1,
    gap: 2,
  },
  phoneLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  phoneValue: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.foreground,
  },
  phoneEditButton: {
    width: 40,
    height: 40,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D9F5EA",
    backgroundColor: "#F5FFFB",
    padding: 13,
  },
  profileIntroIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: palette.successText,
    alignItems: "center",
    justifyContent: "center",
  },
  profileIntroCopy: {
    flex: 1,
    gap: 2,
  },
  profileIntroTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.foreground,
    textTransform: "uppercase",
  },
  profileIntroText: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.successText,
  },
  profileForm: {
    gap: 12,
  },
  profileField: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EEE3DD",
    backgroundColor: "#FFFDFB",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  profileFieldFocused: {
    borderColor: "#FFD4C3",
    backgroundColor: "#FFF9F5",
    shadowColor: "rgba(255, 99, 146, 0.2)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 2,
  },
  profileFieldIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#FFF0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  profileFieldBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    position: "relative",
  },
  profileFieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  profileFieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  profileInput: {
    minHeight: 26,
    padding: 0,
    paddingRight: 42,
    fontSize: 15,
    fontWeight: "700",
    color: palette.foreground,
    backgroundColor: "transparent",
  },
  profileVisibilityButton: {
    position: "absolute",
    right: 0,
    bottom: -5,
    width: 34,
    height: 34,
    borderRadius: 13,
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
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#B4234A",
  },
  warningText: {
    color: palette.warningText,
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
  secondaryButton: {
    // Pink so "Resend code" clearly reads as a tappable button (it's the resend action).
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 43, 133, 0.32)",
    backgroundColor: "#FFF0F6",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonDisabled: {
    opacity: 0.72,
  },
  secondaryButtonPressed: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.secondary,
  },
});
