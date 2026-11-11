import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { AppDialog, appDialogText } from "@/src/components/ui";
import { palette } from "@/src/theme/palette";

type ReorderCartSwitchModalProps = {
  visible: boolean;
  previewItemName: string;
  currentRestaurantName: string;
  incomingRestaurantName: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function ReorderCartSwitchModal({
  visible,
  previewItemName,
  currentRestaurantName,
  incomingRestaurantName,
  onClose,
  onConfirm,
}: ReorderCartSwitchModalProps) {
  return (
    <AppDialog
      visible={visible}
      onClose={onClose}
      icon="refresh-outline"
      title="Start a fresh cart?"
      message={
        <Text style={appDialogText.message}>
          Replace items from{" "}
          <Text style={appDialogText.strong}>{currentRestaurantName}</Text> with{" "}
          <Text style={appDialogText.strong}>{incomingRestaurantName}</Text>?
        </Text>
      }
      actions={[
        { label: "Keep cart", variant: "secondary", onPress: onClose },
        { label: "Replace & reorder", onPress: onConfirm },
      ]}
    >
      <View style={styles.previewRow}>
        <View style={styles.previewIcon}>
          <Ionicons name="bag-check-outline" size={20} color={palette.secondary} />
        </View>
        <View style={styles.previewCopy}>
          <Text style={styles.previewTitle} numberOfLines={2}>
            {previewItemName}
          </Text>
          <Text style={styles.previewSubtitle}>Reorder from your delivered items</Text>
        </View>
      </View>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    marginTop: 4,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  previewCopy: { flex: 1, gap: 2 },
  previewTitle: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.foreground },
  previewSubtitle: { fontSize: 12, lineHeight: 16, color: palette.mutedForeground },
});
