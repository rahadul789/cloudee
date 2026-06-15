import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  useStartRiderPhoneAuthMutation,
  useVerifyRiderPhoneAuthMutation,
} from "@/src/hooks/use-rider-api";
import {
  getDeliveryAuthErrorMessage,
  isDeliveryRateLimitMessage,
} from "@/src/lib/auth-error-message";
import { useDeliveryCopy } from "@/src/lib/copy";
import {
  DEFAULT_OTP_RESEND_SECONDS,
  resolveOtpResendSeconds,
} from "@/src/lib/otp-timing";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const OTP_LENGTH = 4;

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function resolveAuthRedirectTarget(value?: string | string[]) {
  const redirectTo = Array.isArray(value) ? value[0] : value;
  if (typeof redirectTo !== "string") return "/(app)/available";

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
              <View style={styles.otpCursor} />
            ) : null}
          </View>
        );
      })}
    </Pressable>
  );
}

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { copy } = useDeliveryCopy();
  const rider = useRiderAuthStore((state) => state.rider);
  const pendingPhoneAuth = useRiderAuthStore((state) => state.pendingPhoneAuth);
  const setPendingPhoneAuth = useRiderAuthStore((state) => state.setPendingPhoneAuth);

  const verifyMutation = useVerifyRiderPhoneAuthMutation();
  const resendMutation = useStartRiderPhoneAuthMutation();
  const displayPhone = useMemo(() => pendingPhoneAuth?.phone ?? "", [pendingPhoneAuth]);
  const [resendCountdown, setResendCountdown] = useState(() =>
    resolveOtpResendSeconds(pendingPhoneAuth?.resendAvailableInSeconds),
  );

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timeout = setTimeout(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [resendCountdown]);

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

  if (rider) {
    return <Redirect href={resolveAuthRedirectTarget(params.redirectTo) as never} />;
  }

  if (!pendingPhoneAuth) {
    return <Redirect href="/sign-in" />;
  }

  function keepFormVisible() {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }

  const handleVerify = async () => {
    setError("");
    setSuccess("");

    if (otpCode.length !== OTP_LENGTH) {
      setError("Enter the 4-digit OTP code.");
      return;
    }

    try {
      await verifyMutation.mutateAsync({
        verificationSessionId: pendingPhoneAuth.verificationSessionId,
        otpCode,
      });

      router.replace(resolveAuthRedirectTarget(params.redirectTo) as never);
    } catch (mutationError) {
      setOtpCode("");
      setError(getDeliveryAuthErrorMessage(mutationError, copy.verify.error));
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0 || resendMutation.isPending) return;

    setError("");
    setSuccess("");

    try {
      const result = await resendMutation.mutateAsync({
        phone: pendingPhoneAuth.phone,
      });
      setPendingPhoneAuth({
        ...pendingPhoneAuth,
        verificationSessionId: result.verificationSessionId,
        resendAvailableInSeconds: resolveOtpResendSeconds(
          result.resendAvailableInSeconds,
        ),
      });
      setResendCountdown(resolveOtpResendSeconds(result.resendAvailableInSeconds));
      setOtpCode("");
      setSuccess("A fresh 4-digit OTP has been sent.");
    } catch (mutationError) {
      const message = getDeliveryAuthErrorMessage(
        mutationError,
        copy.signIn.sendOtpError,
      );
      setError(message);
      if (isDeliveryRateLimitMessage(message)) {
        setResendCountdown((current) =>
          Math.max(current, DEFAULT_OTP_RESEND_SECONDS),
        );
      }
    }
  };

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
          <View style={[styles.heroCard, isKeyboardVisible ? styles.heroCardCompact : null]}>
            <View style={[styles.heroIcon, isKeyboardVisible ? styles.heroIconCompact : null]}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={isKeyboardVisible ? 24 : 28}
                color={palette.primaryStrong}
              />
            </View>
            <Text style={[styles.title, isKeyboardVisible ? styles.titleCompact : null]}>
              Verify rider OTP
            </Text>
            {!isKeyboardVisible ? (
              <Text style={styles.subtitle}>
                Enter the 4-digit code sent to {displayPhone}.
              </Text>
            ) : null}
          </View>

          <View style={styles.formCard}>
            <OtpCodeInput
              value={otpCode}
              onChangeText={(nextValue) => {
                setOtpCode(nextValue);
                if (error) setError("");
              }}
              disabled={verifyMutation.isPending}
              hasError={Boolean(error)}
              onFocus={keepFormVisible}
            />

            {error ? (
              <View
                style={[
                  styles.messageCard,
                  isDeliveryRateLimitMessage(error) ? styles.warningCard : styles.errorCard,
                ]}
              >
                <Ionicons
                  name={
                    isDeliveryRateLimitMessage(error)
                      ? "time-outline"
                      : "alert-circle-outline"
                  }
                  size={18}
                  color={
                    isDeliveryRateLimitMessage(error) ? palette.warningText : "#B42318"
                  }
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
              <View style={[styles.messageCard, styles.successCard]}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#14985B" />
                <Text style={[styles.messageText, styles.successText]}>{success}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleVerify}
              disabled={verifyMutation.isPending}
              style={[
                styles.button,
                verifyMutation.isPending && styles.buttonDisabled,
              ]}
            >
              {verifyMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Verify and continue</Text>
                  <Ionicons name="shield-checkmark" size={18} color="#fff" />
                </>
              )}
            </Pressable>

            <View style={styles.resendRow}>
              <Pressable
                onPress={handleResend}
                disabled={resendCountdown > 0 || resendMutation.isPending}
                style={[
                  styles.secondaryButton,
                  (resendCountdown > 0 || resendMutation.isPending) &&
                    styles.secondaryButtonDisabled,
                ]}
              >
                {resendMutation.isPending ? (
                  <ActivityIndicator size="small" color={palette.foreground} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    {resendCountdown > 0
                      ? `Resend in ${formatCountdown(resendCountdown)}`
                      : "Resend OTP"}
                  </Text>
                )}
              </Pressable>
              <Pressable style={styles.textButton} onPress={() => router.back()}>
                <Text style={styles.textButtonText}>Change phone</Text>
              </Pressable>
            </View>
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
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 34,
    gap: 18,
  },
  containerKeyboard: {
    justifyContent: "flex-start",
    paddingTop: 18,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: palette.heroBackground,
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 10,
  },
  heroCardCompact: {
    paddingVertical: 18,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  heroIconCompact: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    color: palette.foreground,
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  formCard: {
    borderRadius: 28,
    backgroundColor: palette.surface,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: palette.border,
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
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: {
    borderColor: palette.primary,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  otpBoxError: {
    borderColor: "#B42318",
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
  messageCard: {
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  errorCard: {
    backgroundColor: "#FFE8E5",
  },
  warningCard: {
    backgroundColor: palette.warningSurface,
  },
  successCard: {
    backgroundColor: palette.successSurface,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  errorText: {
    color: "#B42318",
  },
  warningText: {
    color: palette.warningText,
  },
  successText: {
    color: "#14985B",
  },
  button: {
    minHeight: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primaryStrong,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  buttonText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: "#fff",
  },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 14,
  },
  secondaryButtonDisabled: {
    opacity: 0.72,
  },
  secondaryButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  textButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.primary,
  },
});
