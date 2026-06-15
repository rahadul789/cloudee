import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import { StatusPill } from "@/src/components/status-pill";
import {
  useOwnerPayoutSummaryQuery,
  useUpdateOwnerPayoutMethodMutation,
  type OwnerPayoutSummary,
} from "@/src/hooks/use-owner-api";
import { useOwnerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

export default function PayoutMethodScreen() {
  const router = useRouter();
  const numberInputRef = useRef<TextInput | null>(null);
  const owner = useOwnerAuthStore((state) => state.owner);
  const payoutQuery = useOwnerPayoutSummaryQuery();
  const updateMutation = useUpdateOwnerPayoutMethodMutation();
  const payoutMethod = payoutQuery.data?.payoutMethod;
  const status = getPayoutMethodStatus(payoutMethod);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const currentAccountName =
    payoutMethod?.pendingAccountName || payoutMethod?.accountName || owner?.fullName || "";
  const currentAccountNumber =
    payoutMethod?.pendingAccountNumber || payoutMethod?.accountNumber || "";
  const cleanAccountName = accountName.trim();
  const cleanAccountNumber = accountNumber.replace(/\D/g, "").slice(0, 11);
  const isUnchanged =
    cleanAccountName === currentAccountName.trim() &&
    cleanAccountNumber === currentAccountNumber;

  useEffect(() => {
    setAccountName(
      payoutMethod?.pendingAccountName || payoutMethod?.accountName || owner?.fullName || "",
    );
    setAccountNumber(payoutMethod?.pendingAccountNumber || payoutMethod?.accountNumber || "");
  }, [owner?.fullName, payoutMethod]);

  async function submitPayoutMethod() {
    const cleanNumber = cleanAccountNumber;
    setAccountNumber(cleanNumber);

    if (isUnchanged) return;

    if (!cleanAccountName) {
      Alert.alert("Account name required", "Enter the bKash account holder name.");
      return;
    }

    if (!/^01\d{9}$/.test(cleanNumber)) {
      Alert.alert("Invalid bKash number", "Enter a valid 11-digit bKash number.");
      numberInputRef.current?.focus();
      return;
    }

    try {
      const response = await updateMutation.mutateAsync({
        type: "bkash",
        accountName: cleanAccountName,
        accountNumber: cleanNumber,
      });

      await payoutQuery.refetch();

      if (response.verificationSessionId) {
        router.replace({
          pathname: "/payout-method-verify",
          params: {
            verificationSessionId: response.verificationSessionId,
            phone: cleanNumber,
          },
        } as never);
        return;
      }

      Alert.alert("Payout number updated", "Your payout bKash number is up to date.", [
        { text: "View payouts", onPress: () => router.replace("/(tabs)/payouts" as never) },
      ]);
    } catch (error) {
      Alert.alert(
        "Unable to update payout number",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header title="Payout bKash" onBack={() => router.back()} />

        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={styles.statusIcon}>
              <Ionicons name="wallet-outline" size={24} color="#FFFFFF" />
            </View>
            <StatusPill label={status.label} tone={status.tone} />
          </View>
          <Text style={styles.statusTitle}>Active payout number</Text>
          <Text style={styles.statusValue}>
            {payoutMethod?.accountNumber || "Not active yet"}
          </Text>
          <Text style={styles.statusText}>{status.detail}</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.noticeCard}>
            <Ionicons name="shield-checkmark-outline" size={18} color={palette.info} />
            <Text style={styles.noticeText}>
              After saving a new number, you will move to a verification screen.
              Admin approval is required before the number becomes active.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account holder name</Text>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Restaurant owner name"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>bKash number</Text>
            <TextInput
              ref={numberInputRef}
              value={accountNumber}
              onChangeText={(value) => setAccountNumber(value.replace(/\D/g, "").slice(0, 11))}
              placeholder="01XXXXXXXXX"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              maxLength={11}
              style={styles.input}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            updateMutation.isPending || isUnchanged ? styles.disabled : null,
          ]}
          onPress={submitPayoutMethod}
          disabled={updateMutation.isPending || isUnchanged}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.primaryText}>
                {isUnchanged ? "No changes yet" : "Continue to verification"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function getPayoutMethodStatus(
  payoutMethod?: OwnerPayoutSummary["payoutMethod"],
): { label: string; tone: "success" | "warning" | "danger"; detail: string } {
  if (!payoutMethod) {
    return {
      label: "Setup needed",
      tone: "warning",
      detail: "Add a payout bKash number before admin sends payouts.",
    };
  }

  if (payoutMethod.pendingVerificationStatus === "otp_pending") {
    return {
      label: "OTP pending",
      tone: "warning",
      detail: "Submit again to receive a fresh OTP for the pending number.",
    };
  }

  if (payoutMethod.pendingVerificationStatus === "admin_pending") {
    return {
      label: "Pending",
      tone: "warning",
      detail: `New number ${payoutMethod.pendingAccountNumber ?? ""} is waiting for admin approval.`,
    };
  }

  if (payoutMethod.pendingVerificationStatus === "rejected") {
    return {
      label: "Rejected",
      tone: "danger",
      detail: payoutMethod.pendingAdminNote
        ? `Last request rejected: ${payoutMethod.pendingAdminNote}`
        : "Last number change was rejected. Submit a new number when ready.",
    };
  }

  if (payoutMethod.isVerified) {
    return {
      label: "Verified",
      tone: "success",
      detail: "This number is currently active for owner payouts.",
    };
  }

  return {
    label: "Unverified",
    tone: "warning",
    detail: "Verify the payout number to make it ready for admin payout.",
  };
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
  keyboardAvoider: {
    flex: 1,
  },
  container: {
    padding: 18,
    paddingBottom: 120,
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
  statusCard: {
    borderRadius: 24,
    backgroundColor: palette.foreground,
    padding: 18,
    gap: 8,
  },
  statusTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: "#F7D9CF",
    textTransform: "uppercase",
  },
  statusValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  statusText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#F7D9CF",
  },
  formCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 14,
  },
  noticeCard: {
    borderRadius: 18,
    backgroundColor: palette.infoSoft,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.info,
  },
  inputGroup: {
    gap: 7,
  },
  label: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 14,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
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
});
