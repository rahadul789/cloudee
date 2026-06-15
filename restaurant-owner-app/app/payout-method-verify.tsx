import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { OwnerOtpField } from "@/src/components/owner-otp-field";
import { Screen } from "@/src/components/screen";
import { useOwnerOtpVerifyMutation } from "@/src/hooks/use-owner-api";
import { palette } from "@/src/theme/palette";

const OTP_LENGTH = 4;

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function PayoutMethodVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const verifyMutation = useOwnerOtpVerifyMutation();
  const verificationSessionId = readParam(params.verificationSessionId);
  const phone = readParam(params.phone);
  const [otpCode, setOtpCode] = useState("");
  const [errorText, setErrorText] = useState("");
  const hasSession = Boolean(verificationSessionId && phone);

  useEffect(() => {
    setErrorText("");
  }, [verificationSessionId, phone]);

  async function verifyOtp() {
    if (!hasSession) return;

    if (otpCode.length !== OTP_LENGTH) {
      setErrorText("Enter the 4-digit verification code sent to your bKash number.");
      return;
    }

    setErrorText("");

    try {
      await verifyMutation.mutateAsync({
        verificationSessionId,
        otpCode,
      });
      await queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
      router.replace("/(tabs)/payouts" as never);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Verification failed. Please try again.");
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Header
          title="Verify bKash"
          onBack={() => router.replace("/payout-method" as never)}
        />

        {!hasSession ? (
          <View style={styles.missingCard}>
            <View style={styles.missingIcon}>
              <Ionicons name="warning-outline" size={28} color={palette.warning} />
            </View>
            <Text style={styles.missingTitle}>Verification session expired</Text>
            <Text style={styles.missingText}>
              Start the bKash number update again to receive a fresh OTP.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={() => router.replace("/payout-method" as never)}
            >
              <Text style={styles.primaryText}>Start again</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Ionicons name="shield-checkmark-outline" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Enter verification code</Text>
                <Text style={styles.heroText}>
                  We sent a 4-digit OTP to {phone}. Admin will approve this
                  number after successful verification.
                </Text>
              </View>
            </View>

            <View style={styles.otpCard}>
              <OwnerOtpField
                autoFocus
                value={otpCode}
                onChange={(value) => {
                  setOtpCode(value);
                  setErrorText("");
                }}
                hasError={Boolean(errorText)}
                disabled={verifyMutation.isPending}
              />
              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
              <Text style={styles.helperText}>
                If you leave this screen without verifying, your current payout
                number will stay active. You can start again anytime.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, verifyMutation.isPending ? styles.disabled : null]}
              disabled={verifyMutation.isPending}
              onPress={verifyOtp}
            >
              {verifyMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryText}>Verify and continue</Text>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" hitSlop={10} style={styles.backButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={21} color={palette.foreground} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 16,
  },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  headerSpacer: {
    width: 40,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: palette.foreground,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#F7D9CF",
  },
  otpCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 11,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.danger,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.7,
  },
  missingCard: {
    marginTop: 24,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    alignItems: "center",
    gap: 11,
  },
  missingIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: palette.warningSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  missingTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    color: palette.foreground,
  },
  missingText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
});
