import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/src/components/pressable-scale";
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalGlow} />
          <View style={styles.modalBadge}>
            <Ionicons name="sparkles-outline" size={12} color={palette.secondary} />
            <Text style={styles.modalBadgeText}>Cart switch</Text>
          </View>

          <Text style={styles.modalTitle}>Start a fresh cart?</Text>
          <Text style={styles.modalText}>
            Replace items from{" "}
            <Text style={styles.modalTextStrong}>{currentRestaurantName}</Text> with{" "}
            <Text style={styles.modalTextStrong}>{incomingRestaurantName}</Text>?
          </Text>

          <View style={styles.modalPreviewRow}>
            <View style={styles.modalPreviewImageFallback}>
              <Ionicons name="refresh-outline" size={20} color={palette.secondary} />
            </View>
            <View style={styles.modalPreviewCopy}>
              <Text style={styles.modalPreviewTitle} numberOfLines={2}>{previewItemName}</Text>
              <Text style={styles.modalPreviewSubtitle}>Reorder from your delivered items</Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <PressableScale
              scaleTo={0.96}
              style={styles.modalSecondaryButton}
              onPress={onClose}
            >
              <Text style={styles.modalSecondaryButtonText}>Keep current cart</Text>
            </PressableScale>
            <PressableScale
              scaleTo={0.96}
              style={styles.modalPrimaryButton}
              onPress={onConfirm}
            >
              <Text style={styles.modalPrimaryButtonText}>Replace and reorder</Text>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 27, 38, 0.38)",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    padding: 20,
    borderRadius: 28,
    backgroundColor: palette.surface,
    gap: 14,
    overflow: "hidden",
  },
  modalGlow: {
    position: "absolute",
    top: -42,
    right: -26,
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "rgba(255, 99, 146, 0.16)",
  },
  modalBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFE8F0",
  },
  modalBadgeText: { fontSize: 11, lineHeight: 14, fontWeight: "700", color: palette.secondary },
  modalTitle: { fontSize: 22, lineHeight: 28, fontWeight: "800", color: palette.foreground },
  modalText: { fontSize: 14, lineHeight: 21, color: palette.mutedForeground },
  modalTextStrong: { fontWeight: "800", color: palette.foreground },
  modalPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
  },
  modalPreviewImageFallback: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  modalPreviewCopy: { flex: 1, gap: 2 },
  modalPreviewTitle: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.foreground },
  modalPreviewSubtitle: { fontSize: 12, lineHeight: 16, color: palette.mutedForeground },
  modalActions: { gap: 10 },
  modalSecondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  modalSecondaryButtonText: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.foreground },
  modalPrimaryButton: {
    minHeight: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  modalPrimaryButtonText: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.surface },
});
