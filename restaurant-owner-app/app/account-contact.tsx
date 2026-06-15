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
import { palette } from "@/src/theme/palette";

export default function AccountContactScreen() {
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
      Alert.alert("Invalid phone number", "Enter a valid 11-digit restaurant contact number.");
      return;
    }

    try {
      await updateMutation.mutateAsync({ phone: cleanPhone });
      Alert.alert("Contact updated", "Riders will see this restaurant contact number.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(
        "Unable to update contact",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Header title="Restaurant contact" onBack={() => router.back()} />

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="call-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Pickup support number</Text>
            <Text style={styles.heroText}>
              This number is shown to riders for pickup and order support.
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Restaurant phone number</Text>
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
            Use a reachable number so delivery riders can contact the restaurant quickly.
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
                {isUnchanged ? "No changes yet" : "Save contact"}
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
