import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useCustomerPaymentSettingsQuery } from "@/src/hooks/use-customer-api";
import {
  usePaymentPreferencesStore,
  type CustomerPreferredPaymentMethod,
} from "@/src/store/payment-preferences-store";
import { palette } from "@/src/theme/palette";

const bkashLogo = require("../assets/images/bkash.png");

export default function PaymentPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const paymentSettingsQuery = useCustomerPaymentSettingsQuery();
  const preferredPaymentMethod = usePaymentPreferencesStore(
    (state) => state.preferredPaymentMethod,
  );
  const setPreferredPaymentMethod = usePaymentPreferencesStore(
    (state) => state.setPreferredPaymentMethod,
  );
  const paymentSettings = paymentSettingsQuery.data ?? {
    cashOnDeliveryEnabled: true,
    bkashEnabled: false,
    bkashLabel: "bKash",
    bkashSubtitle: "Continue to the official hosted payment page.",
    bkashRefundEtaMinutes: 60,
  };
  const [selectedMethod, setSelectedMethod] =
    useState<CustomerPreferredPaymentMethod>(preferredPaymentMethod);
  const options = useMemo(
    () => [
      {
        id: "Cash" as const,
        title: "Cash on delivery",
        subtitle: "Pay the rider when your food arrives.",
        icon: "cash-outline" as const,
        disabled: paymentSettings.cashOnDeliveryEnabled === false,
      },
      {
        id: "Bkash" as const,
        title: paymentSettings.bkashLabel,
        subtitle: paymentSettings.bkashEnabled
          ? "Pay online from the official bKash checkout."
          : "bKash is not available right now.",
        icon: "phone-portrait-outline" as const,
        imageSource: bkashLogo,
        disabled: !paymentSettings.bkashEnabled,
      },
    ],
    [
      paymentSettings.bkashEnabled,
      paymentSettings.bkashLabel,
      paymentSettings.cashOnDeliveryEnabled,
    ],
  );
  const canSave = options.some(
    (option) => option.id === selectedMethod && !option.disabled,
  );

  function handleSave() {
    if (!canSave) return;
    setPreferredPaymentMethod(selectedMethod);
    router.back();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + Math.max(insets.bottom, 0) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed
                ? {
                    transform: [{ scale: 0.97 }, { translateY: 1 }],
                    opacity: 0.92,
                  }
                : null,
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Default payment</Text>
            <Text style={styles.subtitle}>
              Choose what checkout should select first.
            </Text>
          </View>
        </View>

        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>Current preference</Text>
          <Text style={styles.currentValue}>
            {preferredPaymentMethod === "Bkash"
              ? paymentSettings.bkashLabel
              : "Cash on delivery"}
          </Text>
          <Text style={styles.currentHint}>
            Checkout will still switch to an available method if your saved
            choice is temporarily unavailable.
          </Text>
        </View>

        <View style={styles.optionStack}>
          {options.map((option) => {
            const active = selectedMethod === option.id;
            return (
              <Pressable
                key={option.id}
                style={({ pressed }) => [
                  styles.optionCard,
                  active ? styles.optionCardActive : null,
                  option.disabled ? styles.optionCardDisabled : null,
                  pressed && !option.disabled
                    ? {
                        transform: [{ scale: 0.985 }, { translateY: 1 }],
                        shadowOpacity: 0.05,
                      }
                    : null,
                ]}
                disabled={option.disabled}
                onPress={() => setSelectedMethod(option.id)}
              >
                <View
                  style={[
                    styles.optionIcon,
                    active ? styles.optionIconActive : null,
                  ]}
                >
                  {option.imageSource ? (
                    <Image
                      source={option.imageSource}
                      resizeMode="contain"
                      style={{ width: 36, height: 36 }}
                    />
                  ) : (
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={active ? palette.secondary : palette.foreground}
                    />
                  )}
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                </View>
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off-outline"}
                  size={20}
                  color={active ? palette.secondary : palette.mutedForeground}
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !canSave ? styles.saveButtonDisabled : null,
            pressed && canSave
              ? {
                  transform: [{ scale: 0.985 }, { translateY: 1 }],
                  opacity: 0.96,
                }
              : null,
          ]}
          disabled={!canSave}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>Save preference</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    gap: 18,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: palette.foreground,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  currentCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 16,
    shadowColor: palette.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  currentLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  currentValue: {
    marginTop: 5,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: palette.foreground,
  },
  currentHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  optionStack: {
    gap: 12,
  },
  optionCard: {
    minHeight: 78,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F0D7E1",
    backgroundColor: palette.surface,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionCardActive: {
    borderColor: palette.secondary,
    backgroundColor: "#FFF3F8",
  },
  optionCardDisabled: {
    opacity: 0.45,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8EFE8",
  },
  optionIconActive: {
    backgroundColor: "#FFE2EE",
  },
  optionCopy: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.foreground,
  },
  optionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    backgroundColor: palette.background,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.surface,
  },
});
