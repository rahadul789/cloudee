import { Ionicons } from "@expo/vector-icons";
import type { Ref } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { palette } from "@/src/theme/palette";

// The app-wide search input: amber icon tile, plain text input, clear button.
export function SearchField({
  inputRef,
  value,
  onChangeText,
  placeholder = "Search food or restaurant",
  onSubmit,
  autoFocus,
  style,
  inputProps,
}: {
  inputRef?: Ref<TextInput>;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  inputProps?: Omit<TextInputProps, "value" | "onChangeText" | "placeholder" | "style">;
}) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.iconTile}>
        <Ionicons name="search" size={15} color={palette.onPrimary} />
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="search"
        selectionColor={palette.secondary}
        onSubmitEditing={onSubmit}
        style={styles.input}
        {...inputProps}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.clear}
        >
          <Ionicons name="close" size={14} color={palette.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 44,
    borderRadius: 14,
    paddingLeft: 5,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E3E4E6",
    backgroundColor: "#FAFAFA",
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "400",
    color: palette.foreground,
  },
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
});
