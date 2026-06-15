import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

export default function AccountPreparationTimeScreen() {
  const router = useRouter();
  const storeQuery = useOwnerStoreSettingsQuery();
  const updateMutation = useUpdateOwnerStoreSettingsMutation();
  const savedPrepMinutes =
    typeof storeQuery.data?.preparationTimeMinutes === "number"
      ? storeQuery.data.preparationTimeMinutes
      : null;
  const [prepEnabled, setPrepEnabled] = useState(false);
  const [prepMinutes, setPrepMinutes] = useState("20");
  const draftPrepMinutes = prepEnabled ? Number(prepMinutes) : null;
  const isUnchanged = draftPrepMinutes === savedPrepMinutes;

  useEffect(() => {
    setPrepEnabled(savedPrepMinutes !== null);
    setPrepMinutes(String(savedPrepMinutes ?? 20));
  }, [savedPrepMinutes]);

  async function savePreparationTime() {
    const numericMinutes = Number(prepMinutes);

    if (prepEnabled && (!Number.isInteger(numericMinutes) || numericMinutes < 5 || numericMinutes > 120)) {
      Alert.alert("Check preparation time", "Use a whole number between 5 and 120 minutes.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        preparationTimeMinutes: prepEnabled ? numericMinutes : null,
      });
      await storeQuery.refetch();
      Alert.alert("Preparation time saved", "New orders will use this kitchen estimate.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(
        "Unable to save",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable accessibilityRole="button" hitSlop={10} style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={21} color={palette.foreground} />
          </Pressable>
          <Text style={styles.title}>Preparation time</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="restaurant-outline" size={25} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Kitchen estimate</Text>
            <Text style={styles.heroText}>
              This time is used for new orders and customer expectations.
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: prepEnabled }}
            style={styles.checkboxRow}
            onPress={() => setPrepEnabled((current) => !current)}
          >
            <Ionicons
              name={prepEnabled ? "checkbox" : "square-outline"}
              size={25}
              color={prepEnabled ? palette.primary : palette.mutedForeground}
            />
            <View style={styles.checkboxCopy}>
              <Text style={styles.checkboxTitle}>Use default preparation time</Text>
              <Text style={styles.checkboxText}>
                Turn this off if you do not want a default kitchen estimate.
              </Text>
            </View>
          </Pressable>

          <View style={[styles.inputPanel, !prepEnabled ? styles.inputPanelDisabled : null]}>
            <Pressable
              accessibilityRole="button"
              disabled={!prepEnabled}
              style={styles.stepButton}
              onPress={() =>
                setPrepMinutes((current) => String(Math.max(5, Number(current || "0") - 5)))
              }
            >
              <Ionicons name="remove" size={18} color={palette.foreground} />
            </Pressable>
            <TextInput
              value={prepMinutes}
              editable={prepEnabled}
              onChangeText={(value) => setPrepMinutes(value.replace(/\D/g, "").slice(0, 3))}
              keyboardType="number-pad"
              maxLength={3}
              style={styles.input}
            />
            <Text style={styles.unit}>minutes</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!prepEnabled}
              style={styles.stepButton}
              onPress={() =>
                setPrepMinutes((current) => String(Math.min(120, Number(current || "0") + 5)))
              }
            >
              <Ionicons name="add" size={18} color={palette.foreground} />
            </Pressable>
          </View>

          <Text style={styles.helperText}>
            Recommended range is 15-45 minutes. You can still handle individual orders
            manually from the order details screen.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={updateMutation.isPending || isUnchanged}
          style={[
            styles.primaryButton,
            updateMutation.isPending || isUnchanged ? styles.disabled : null,
          ]}
          onPress={savePreparationTime}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.primaryText}>
                {isUnchanged ? "No changes yet" : "Save preparation time"}
              </Text>
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 44,
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
    gap: 14,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  checkboxCopy: {
    flex: 1,
  },
  checkboxTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  checkboxText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  inputPanel: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    gap: 8,
  },
  inputPanelDisabled: {
    opacity: 0.55,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minHeight: 48,
    textAlign: "center",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.foreground,
    paddingVertical: 0,
  },
  unit: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.mutedForeground,
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
    opacity: 0.65,
  },
});
