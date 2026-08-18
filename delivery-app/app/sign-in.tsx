import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useRiderPasswordResetMutation,
  useRiderPasswordResetStartMutation,
  useRiderPasswordResetVerifyMutation,
  useRiderPasswordSigninMutation,
  useStartRiderPhoneAuthMutation,
  useVerifyRiderPhoneAuthMutation,
} from "@/src/hooks/use-rider-api";
import {
  getDeliveryAuthErrorMessage,
  isDeliveryRateLimitMessage,
} from "@/src/lib/auth-error-message";
import {
  DEFAULT_OTP_RESEND_SECONDS,
  resolveOtpResendSeconds,
} from "@/src/lib/otp-timing";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const OTP_LENGTH = 4;

type AuthStep = "password" | "otp" | "resetOtp" | "resetPassword";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function sanitizePhoneInput(value: string) {
  return onlyDigits(value).slice(0, 11);
}

function isValidPhone(value: string) {
  return /^01\d{9}$/.test(onlyDigits(value));
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return getDeliveryAuthErrorMessage(error, fallback);
}

function resolveAuthRedirectTarget(value?: string | string[]) {
  const redirectTo = Array.isArray(value) ? value[0] : value;
  if (typeof redirectTo !== "string") return "/(app)/map";

  if (
    redirectTo === "/(app)/available" ||
    redirectTo === "/(app)/active" ||
    redirectTo === "/(app)/map" ||
    redirectTo === "/(app)/history" ||
    redirectTo === "/(app)/profile" ||
    /^\/orders\/[A-Za-z0-9_-]{6,80}$/.test(redirectTo)
  ) {
    return redirectTo;
  }

  return "/(app)/available";
}

function OtpCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.12,
          duration: 480,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 480,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View style={[styles.otpCursor, { opacity }]} />;
}

function OtpCodeInput({
  value,
  onChangeText,
  disabled,
  hasError,
  onFocus,
}: {
  value: string;
  onChangeText: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  onFocus?: () => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Pressable
      style={styles.otpRow}
      disabled={disabled}
      onPress={() => inputRef.current?.focus()}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(nextValue) => onChangeText(onlyDigits(nextValue).slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        editable={!disabled}
        caretHidden
        style={styles.hiddenOtpInput}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
      />
      {Array.from({ length: OTP_LENGTH }).map((_, index) => {
        const digit = value[index] ?? "";
        const isActive = focused && index === activeIndex && !disabled;
        return (
          <View
            key={index}
            style={[
              styles.otpBox,
              isActive ? styles.otpBoxActive : null,
              hasError ? styles.otpBoxError : null,
            ]}
          >
            {digit ? (
              <Text style={styles.otpDigit}>{digit}</Text>
            ) : isActive ? (
              <OtpCursor />
            ) : null}
          </View>
        );
      })}
    </Pressable>
  );
}

export default function SignInScreen() {
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const rider = useRiderAuthStore((state) => state.rider);
  const passwordSigninMutation = useRiderPasswordSigninMutation();
  const otpSigninStartMutation = useStartRiderPhoneAuthMutation();
  const otpSigninVerifyMutation = useVerifyRiderPhoneAuthMutation();
  const passwordResetStartMutation = useRiderPasswordResetStartMutation();
  const passwordResetVerifyMutation = useRiderPasswordResetVerifyMutation();
  const passwordResetMutation = useRiderPasswordResetMutation();

  const [step, setStep] = useState<AuthStep>("password");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verificationSessionId, setVerificationSessionId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const newPasswordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const isOtpStep = step === "otp" || step === "resetOtp";
  const isResetFlow = step === "resetOtp" || step === "resetPassword";
  const isBusy =
    passwordSigninMutation.isPending ||
    otpSigninStartMutation.isPending ||
    otpSigninVerifyMutation.isPending ||
    passwordResetStartMutation.isPending ||
    passwordResetVerifyMutation.isPending ||
    passwordResetMutation.isPending;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      keepFormVisible();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const interval = setInterval(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCountdown]);

  if (rider) {
    return <Redirect href={resolveAuthRedirectTarget(params.redirectTo) as never} />;
  }

  function keepFormVisible() {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }

  function requireValidPhone() {
    const cleanPhone = onlyDigits(phone);
    if (!isValidPhone(cleanPhone)) {
      setError("Enter a valid 11-digit rider phone number.");
      setSuccess("");
      return "";
    }
    return cleanPhone;
  }

  function setOtpTiming(seconds?: number) {
    setResendCountdown(resolveOtpResendSeconds(seconds ?? DEFAULT_OTP_RESEND_SECONDS));
  }

  async function handleSignin() {
    const cleanPhone = requireValidPhone();
    if (!cleanPhone) return;

    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      setSuccess("");
      passwordInputRef.current?.focus();
      return;
    }

    setError("");
    setSuccess("");
    try {
      await passwordSigninMutation.mutateAsync({
        phone: cleanPhone,
        password,
      });
    } catch (signinError) {
      setError(getErrorMessage(signinError, "Could not sign in right now."));
    }
  }

  async function startOtpLogin() {
    const cleanPhone = requireValidPhone();
    if (!cleanPhone) return;

    setError("");
    setSuccess("");
    setOtpCode("");
    try {
      const data = await otpSigninStartMutation.mutateAsync({ phone: cleanPhone });
      setVerificationSessionId(data.verificationSessionId);
      setOtpTiming(data.resendAvailableInSeconds);
      setStep("otp");
      setSuccess("A 4-digit OTP has been sent.");
    } catch (otpError) {
      setError(getErrorMessage(otpError, "Could not send OTP right now."));
    }
  }

  async function verifyOtpLogin() {
    if (otpCode.length !== OTP_LENGTH) {
      setError("Enter the 4-digit OTP.");
      setSuccess("");
      return;
    }

    setError("");
    setSuccess("");
    try {
      await otpSigninVerifyMutation.mutateAsync({
        verificationSessionId,
        otpCode,
      });
    } catch (otpError) {
      setOtpCode("");
      setError(getErrorMessage(otpError, "This OTP is incorrect or expired."));
    }
  }

  async function startPasswordReset() {
    const cleanPhone = requireValidPhone();
    if (!cleanPhone) return;

    setError("");
    setSuccess("");
    setOtpCode("");
    try {
      const data = await passwordResetStartMutation.mutateAsync({ phone: cleanPhone });
      setVerificationSessionId(data.verificationSessionId);
      setOtpTiming(data.resendAvailableInSeconds);
      setStep("resetOtp");
      setSuccess("A 4-digit reset OTP has been sent.");
    } catch (resetError) {
      setError(getErrorMessage(resetError, "Could not send password reset OTP."));
    }
  }

  async function verifyResetOtp() {
    if (otpCode.length !== OTP_LENGTH) {
      setError("Enter the 4-digit OTP.");
      setSuccess("");
      return;
    }

    setError("");
    setSuccess("");
    try {
      await passwordResetVerifyMutation.mutateAsync({
        verificationSessionId,
        otpCode,
      });
      setStep("resetPassword");
      setSuccess("OTP verified. Create your new password.");
      setTimeout(() => newPasswordInputRef.current?.focus(), 150);
    } catch (otpError) {
      setOtpCode("");
      setError(getErrorMessage(otpError, "This OTP is incorrect or expired."));
    }
  }

  async function updatePassword() {
    if (newPassword.trim().length < 6) {
      setError("Use at least 6 characters for the new password.");
      setSuccess("");
      newPasswordInputRef.current?.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Both password fields must match.");
      setSuccess("");
      confirmPasswordInputRef.current?.focus();
      return;
    }

    setError("");
    setSuccess("");
    try {
      await passwordResetMutation.mutateAsync({
        verificationSessionId,
        newPassword: newPassword.trim(),
      });
      setPassword(newPassword.trim());
      setNewPassword("");
      setConfirmPassword("");
      setOtpCode("");
      setStep("password");
      setSuccess("Password updated. Sign in with your new password.");
      setTimeout(() => passwordInputRef.current?.focus(), 150);
    } catch (resetError) {
      setError(getErrorMessage(resetError, "Could not reset password right now."));
    }
  }

  function goBackToPassword() {
    setStep("password");
    setOtpCode("");
    setError("");
    setSuccess("");
  }

  function getPrimaryLabel() {
    if (step === "otp") return "Verify and sign in";
    if (step === "resetOtp") return "Verify OTP";
    if (step === "resetPassword") return "Update password";
    return "Sign in";
  }

  function submitPrimary() {
    if (step === "otp") return verifyOtpLogin();
    if (step === "resetOtp") return verifyResetOtp();
    if (step === "resetPassword") return updatePassword();
    return handleSignin();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.container,
            isKeyboardVisible ? styles.containerKeyboard : null,
          ]}
        >
          <View style={styles.hero}>
            <View style={[styles.brandIcon, isKeyboardVisible ? styles.brandIconCompact : null]}>
              <Ionicons
                name={isResetFlow ? "key-outline" : "bicycle-outline"}
                size={isKeyboardVisible ? 24 : 30}
                color="#FFFFFF"
              />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.title, isKeyboardVisible ? styles.titleCompact : null]}>
                {isResetFlow ? "Reset access" : "Rider sign in"}
              </Text>
              {!isKeyboardVisible ? (
                <Text style={styles.subtitle}>Use your approved Foodbela rider account.</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Phone number</Text>
              <View style={styles.inputShell}>
                <Ionicons name="call-outline" size={18} color={palette.mutedForeground} />
                <TextInput
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(sanitizePhoneInput(value));
                    if (error) setError("");
                  }}
                  placeholder="01XXXXXXXXX"
                  placeholderTextColor={palette.placeholder}
                  style={styles.input}
                  keyboardType="phone-pad"
                  maxLength={11}
                  autoCapitalize="none"
                  returnKeyType="next"
                  editable={!isBusy && step === "password"}
                  onFocus={keepFormVisible}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                />
              </View>
            </View>

            {step === "password" ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputShell}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={palette.mutedForeground}
                    />
                    <TextInput
                      ref={passwordInputRef}
                      value={password}
                      onChangeText={(value) => {
                        setPassword(value);
                        if (error) setError("");
                      }}
                      placeholder="Your password"
                      placeholderTextColor={palette.placeholder}
                      style={styles.input}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onFocus={keepFormVisible}
                      onSubmitEditing={handleSignin}
                    />
                    <Pressable
                      onPress={() => setShowPassword((current) => !current)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={19}
                        color={palette.foreground}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <Pressable style={styles.textButton} onPress={startPasswordReset}>
                    {passwordResetStartMutation.isPending ? (
                      <ActivityIndicator size="small" color={palette.primary} />
                    ) : (
                      <Text style={styles.textButtonText}>Forgot password?</Text>
                    )}
                  </Pressable>
                  <Pressable style={styles.textButton} onPress={startOtpLogin}>
                    {otpSigninStartMutation.isPending ? (
                      <ActivityIndicator size="small" color={palette.primary} />
                    ) : (
                      <Text style={styles.textButtonText}>Sign in with OTP</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : isOtpStep ? (
              <View style={styles.otpSection}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepTitle}>
                    {step === "otp" ? "Enter rider OTP" : "Verify reset OTP"}
                  </Text>
                  <Text style={styles.stepCopy}>
                    We sent a 4-digit code to {onlyDigits(phone)}.
                  </Text>
                </View>
                <OtpCodeInput
                  value={otpCode}
                  onChangeText={(nextValue) => {
                    setOtpCode(nextValue);
                    if (error) setError("");
                  }}
                  hasError={Boolean(error)}
                  disabled={isBusy}
                  onFocus={keepFormVisible}
                />
                <View style={styles.resendRow}>
                  <Pressable
                    style={[styles.secondaryButton, resendCountdown > 0 ? styles.disabledSoft : null]}
                    disabled={resendCountdown > 0 || isBusy}
                    onPress={step === "otp" ? startOtpLogin : startPasswordReset}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {resendCountdown > 0
                        ? `Resend in ${formatCountdown(resendCountdown)}`
                        : "Resend OTP"}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.textButton} onPress={goBackToPassword}>
                    <Text style={styles.textButtonText}>Back to password</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.resetPasswordSection}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepTitle}>Create new password</Text>
                  <Text style={styles.stepCopy}>Use at least 6 characters.</Text>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>New password</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="key-outline" size={18} color={palette.mutedForeground} />
                    <TextInput
                      ref={newPasswordInputRef}
                      value={newPassword}
                      onChangeText={(value) => {
                        setNewPassword(value);
                        if (error) setError("");
                      }}
                      placeholder="New password"
                      placeholderTextColor={palette.placeholder}
                      style={styles.input}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="next"
                      onFocus={keepFormVisible}
                      onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                    />
                    <Pressable
                      onPress={() => setShowNewPassword((current) => !current)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                        size={19}
                        color={palette.foreground}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Confirm password</Text>
                  <View style={styles.inputShell}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={18}
                      color={palette.mutedForeground}
                    />
                    <TextInput
                      ref={confirmPasswordInputRef}
                      value={confirmPassword}
                      onChangeText={(value) => {
                        setConfirmPassword(value);
                        if (error) setError("");
                      }}
                      placeholder="Re-enter password"
                      placeholderTextColor={palette.placeholder}
                      style={styles.input}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="done"
                      onFocus={keepFormVisible}
                      onSubmitEditing={updatePassword}
                    />
                    <Pressable
                      onPress={() => setShowConfirmPassword((current) => !current)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                        size={19}
                        color={palette.foreground}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {error ? (
              <View
                style={[
                  styles.messageCard,
                  isDeliveryRateLimitMessage(error) ? styles.messageWarning : styles.messageError,
                ]}
              >
                <Ionicons
                  name={
                    isDeliveryRateLimitMessage(error)
                      ? "time-outline"
                      : "alert-circle-outline"
                  }
                  size={18}
                  color={isDeliveryRateLimitMessage(error) ? palette.warning : palette.danger}
                />
                <Text
                  style={[
                    styles.messageText,
                    isDeliveryRateLimitMessage(error) ? styles.warningText : styles.errorText,
                  ]}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            {success ? (
              <View style={[styles.messageCard, styles.messageSuccess]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={palette.success} />
                <Text style={[styles.messageText, styles.successText]}>{success}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.primaryButton, isBusy ? styles.primaryButtonDisabled : null]}
              onPress={submitPrimary}
              disabled={isBusy}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{getPrimaryLabel()}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 34,
  },
  containerKeyboard: {
    justifyContent: "flex-start",
    paddingTop: 18,
    paddingBottom: 28,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroText: {
    flex: 1,
  },
  brandIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  brandIconCompact: {
    width: 50,
    height: 50,
    borderRadius: 18,
  },
  title: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "900",
    color: palette.foreground,
  },
  titleCompact: {
    fontSize: 25,
    lineHeight: 31,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: palette.mutedForeground,
    fontWeight: "600",
  },
  form: {
    marginTop: 28,
    gap: 14,
  },
  field: {
    gap: 7,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.foreground,
    textTransform: "uppercase",
  },
  inputShell: {
    minHeight: 56,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: palette.foreground,
    paddingVertical: 0,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.primary,
  },
  otpSection: {
    gap: 14,
  },
  resetPasswordSection: {
    gap: 14,
  },
  stepHeader: {
    gap: 4,
  },
  stepTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  stepCopy: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  otpRow: {
    minHeight: 68,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  hiddenOtpInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpBox: {
    flex: 1,
    height: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: {
    borderColor: palette.primary,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  otpBoxError: {
    borderColor: palette.danger,
  },
  otpDigit: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.foreground,
  },
  otpCursor: {
    width: 2,
    height: 24,
    borderRadius: 99,
    backgroundColor: palette.primary,
  },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.primary,
  },
  disabledSoft: {
    opacity: 0.62,
  },
  messageCard: {
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  messageError: {
    backgroundColor: palette.dangerSoft,
  },
  messageWarning: {
    backgroundColor: palette.warningSoft,
  },
  messageSuccess: {
    backgroundColor: palette.successSoft,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  errorText: {
    color: palette.danger,
  },
  warningText: {
    color: palette.warning,
  },
  successText: {
    color: palette.success,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
