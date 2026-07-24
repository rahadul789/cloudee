import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import {
  useOwnerStoreSettingsQuery,
  useUpdateOwnerStoreSettingsMutation,
} from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { palette } from "@/src/theme/palette";

export default function AccountContactScreen() {
  const { t } = useOwnerTranslation();
  const router = useRouter();
  const inputRef = useRef<TextInput | null>(null);
  const storeQuery = useOwnerStoreSettingsQuery();
  const updateMutation = useUpdateOwnerStoreSettingsMutation();
  const [phone, setPhone] = useState("");
  const store = storeQuery.data;
  const currentPhone = store?.contact?.phone ?? "";
  const cleanPhone = phone.replace(/\D/g, "").slice(0, 11);
  const isUnchanged = cleanPhone === currentPhone;

  useEffect(() => {
    setPhone(store?.contact?.phone ?? "");
  }, [store?.contact?.phone]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, []);

  async function saveContact() {
    setPhone(cleanPhone);

    if (isUnchanged) return;

    if (!/^01\d{9}$/.test(cleanPhone)) {
      Alert.alert(t("contact.errInvalidTitle"), t("contact.errInvalidBody"));
      return;
    }

    try {
      await updateMutation.mutateAsync({ phone: cleanPhone });
      Alert.alert(t("contact.okTitle"), t("contact.okBody"), [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(
        t("contact.errSaveTitle"),
        error instanceof Error ? error.message : t("prep.tryAgain"),
      );
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Header title={t("contact.headerTitle")} onBack={() => router.back()} />

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="call-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{t("contact.cardTitle")}</Text>
            <Text style={styles.heroText}>
              {t("contact.heroText")}
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>{t("contact.fieldLabel")}</Text>
          <View style={styles.inputShell}>
            <Ionicons name="call-outline" size={18} color={palette.mutedForeground} />
            <TextInput
              ref={inputRef}
              value={phone}
              onChangeText={(value) => setPhone(value.replace(/\D/g, "").slice(0, 11))}
              placeholder="01XXXXXXXXX"
              placeholderTextColor="#9A8D91"
              keyboardType="phone-pad"
              maxLength={11}
              style={styles.input}
            />
          </View>
          <Text style={styles.helperText}>
            {t("contact.helperText")}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            updateMutation.isPending || isUnchanged ? styles.disabled : null,
          ]}
          onPress={saveContact}
          disabled={updateMutation.isPending || isUnchanged}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.primaryText}>
                {isUnchanged ? t("contact.noChanges") : t("contact.saveButton")}
              </Text>
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
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
  formCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 9,
  },
  label: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  inputShell: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
    paddingVertical: 0,
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
});
