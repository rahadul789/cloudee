import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ComponentProps, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { Screen } from "@/src/components/screen";
import { useCustomerPasswordUpdateMutation } from "@/src/hooks/use-customer-api";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useSafeTimeout } from "@/src/hooks/use-safe-timeout";
import { getCustomerAuthErrorMessage } from "@/src/lib/auth-error-message";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const CUSTOMER_PASSWORD_MIN_LENGTH = 6;

export default function ProfilePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const customer = useCustomerAuthStore((state) => state.customer);
  const isOnline = useIsOnline();
  const passwordMutation = useCustomerPasswordUpdateMutation();
  const hasPassword = Boolean(customer?.hasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "current" | "new" | "confirm" | ""
  >("");
  const currentPasswordInputRef = useRef<TextInput | null>(null);
  const newPasswordInputRef = useRef<TextInput | null>(null);
  const confirmPasswordInputRef = useRef<TextInput | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scheduleTimeout = useSafeTimeout();

  const passwordIsReady = newPassword.trim().length >= CUSTOMER_PASSWORD_MIN_LENGTH;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canPressSave = !passwordMutation.isPending;

  const scrollToPasswordForm = useCallback(() => {
    scheduleTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Platform.OS === "android" ? 136 : 110,
        animated: true,
      });
    }, 80);
  }, [scheduleTimeout]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
      scrollToPasswordForm();
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToPasswordForm]);

  function focusInput(input: TextInput | null) {
    if (!input) {
      return;
    }

    input.focus();
    scrollToPasswordForm();
  }

  async function handleSave() {
    if (!isOnline) {
      setErrorText("Reconnect to update your password.");
      return;
    }

    if (hasPassword && !currentPassword.trim()) {
      setErrorText("Enter your current password.");
      return;
    }

    if (!passwordIsReady) {
      setErrorText(
        `Use at least ${CUSTOMER_PASSWORD_MIN_LENGTH} characters for your password.`,
      );
      return;
    }

    if (!passwordsMatch) {
      setErrorText("Passwords do not match yet. Please recheck them.");
      return;
    }

    try {
      setErrorText("");
      await passwordMutation.mutateAsync({
        currentPassword: hasPassword ? currentPassword.trim() : undefined,
        newPassword: newPassword.trim(),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessText(
        hasPassword ? "Password changed successfully." : "Password added successfully.",
      );
    } catch (error) {
      setSuccessText("");
      setErrorText(
        getCustomerAuthErrorMessage(error, "Could not update your password."),
      );
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 12}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: isKeyboardVisible
                ? Math.max(insets.bottom, 16) + 150
                : Math.max(insets.bottom, 16) + 40,
            },
          ]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed
                  ? {
                      transform: [{ scale: 0.97 }, { translateY: 1 }],
                      opacity: 0.92,
                    }
                  : null,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={palette.foreground}
              />
            </Pressable>
            <Text style={styles.topBarTitle}>
              {hasPassword ? "Change password" : "Add password"}
            </Text>
            <View style={styles.topBarSpacer} />
          </View>

          {!isOnline ? (
            <OfflineNoticeCard description="Reconnect to update your password." />
          ) : null}

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons
                name="lock-closed-outline"
                size={24}
                color="#FFFFFF"
              />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>
                {hasPassword ? "Keep your account secure" : "Create a password"}
              </Text>
              <Text style={styles.heroSubtitle}>
                {hasPassword
                  ? "Use a new password you can remember for faster sign in."
                  : "After adding a password, you can sign in with password or OTP."}
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            {hasPassword ? (
              <PasswordField
                inputRef={currentPasswordInputRef}
                icon="key-outline"
                label="Current password"
                value={currentPassword}
                placeholder="Enter current password"
                focused={focusedField === "current"}
                visible={currentPasswordVisible}
                onToggleVisible={() =>
                  setCurrentPasswordVisible((current) => !current)
                }
                onFocus={() => {
                  setFocusedField("current");
                  scrollToPasswordForm();
                }}
                onBlur={() => setFocusedField("")}
                onPress={() => focusInput(currentPasswordInputRef.current)}
                onSubmitEditing={() => focusInput(newPasswordInputRef.current)}
                onChangeText={(value) => {
                  setCurrentPassword(value);
                  setErrorText("");
                  setSuccessText("");
                }}
              />
            ) : null}

            <PasswordField
              inputRef={newPasswordInputRef}
              icon="lock-closed-outline"
              label="New password"
              value={newPassword}
              placeholder="At least 6 characters"
              focused={focusedField === "new"}
              showCheck={passwordIsReady}
              visible={newPasswordVisible}
              onToggleVisible={() =>
                setNewPasswordVisible((current) => !current)
              }
              onFocus={() => {
                setFocusedField("new");
                scrollToPasswordForm();
              }}
              onBlur={() => setFocusedField("")}
              onPress={() => focusInput(newPasswordInputRef.current)}
              onSubmitEditing={() => focusInput(confirmPasswordInputRef.current)}
              onChangeText={(value) => {
                setNewPassword(value);
                setErrorText("");
                setSuccessText("");
              }}
            />

            <PasswordField
              inputRef={confirmPasswordInputRef}
              icon="shield-checkmark-outline"
              label="Confirm password"
              value={confirmPassword}
              placeholder="Re-enter password"
              focused={focusedField === "confirm"}
              showCheck={passwordsMatch}
              visible={confirmPasswordVisible}
              onToggleVisible={() =>
                setConfirmPasswordVisible((current) => !current)
              }
              returnKeyType="done"
              onFocus={() => {
                setFocusedField("confirm");
                scrollToPasswordForm();
              }}
              onBlur={() => setFocusedField("")}
              onPress={() => focusInput(confirmPasswordInputRef.current)}
              onSubmitEditing={() => {
                if (canPressSave) {
                  void handleSave();
                }
              }}
              onChangeText={(value) => {
                setConfirmPassword(value);
                setErrorText("");
                setSuccessText("");
              }}
            />

            {errorText ? (
              <View style={styles.messageCardError}>
                <Ionicons
                  name="alert-circle-outline"
                  size={17}
                  color="#B4234A"
                />
                <Text style={styles.errorText}>{errorText}</Text>
              </View>
            ) : null}

            {successText ? (
              <View style={styles.messageCardSuccess}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={17}
                  color={palette.successText}
                />
                <Text style={styles.successText}>{successText}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                !canPressSave ? styles.primaryButtonDisabled : null,
                pressed && canPressSave
                  ? {
                      transform: [{ scale: 0.985 }, { translateY: 1 }],
                      opacity: 0.96,
                    }
                  : null,
              ]}
              onPress={handleSave}
              disabled={!canPressSave}
            >
              {passwordMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    {hasPassword ? "Update password" : "Save password"}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PasswordField({
  inputRef,
  icon,
  label,
  value,
  placeholder,
  focused,
  showCheck,
  visible,
  returnKeyType = "next",
  onToggleVisible,
  onFocus,
  onBlur,
  onPress,
  onChangeText,
  onSubmitEditing,
}: {
  inputRef: RefObject<TextInput | null>;
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  placeholder: string;
  focused: boolean;
  showCheck?: boolean;
  visible: boolean;
  returnKeyType?: "next" | "done";
  onToggleVisible: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.field,
        focused ? styles.fieldFocused : null,
        pressed
          ? {
              transform: [{ scale: 0.995 }],
            }
          : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.fieldIcon}>
        <Ionicons name={icon} size={18} color={palette.secondary} />
      </View>
      <View style={styles.fieldBody}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>{label}</Text>
          {showCheck ? (
            <Ionicons
              name="checkmark-circle"
              size={15}
              color={palette.successText}
            />
          ) : null}
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.placeholder}
          secureTextEntry={!visible}
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          returnKeyType={returnKeyType}
          blurOnSubmit={false}
          showSoftInputOnFocus
          onPressIn={onPress}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          style={styles.input}
        />
        <Pressable
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          hitSlop={8}
          onPress={onToggleVisible}
          style={({ pressed }) => [
            styles.visibilityButton,
            pressed
              ? {
                  transform: [{ scale: 0.94 }],
                  opacity: 0.78,
                }
              : null,
          ]}
        >
          <Ionicons
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={19}
            color={palette.mutedForeground}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingTop: 8,
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  topBarSpacer: {
    width: 42,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: palette.surface,
    padding: 16,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 2,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    color: palette.foreground,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
  },
  formCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: palette.surface,
    padding: 16,
    gap: 13,
  },
  field: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EEE3DD",
    backgroundColor: "#FFFDFB",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  fieldFocused: {
    borderColor: "#FFD4C3",
    backgroundColor: "#FFF9F5",
    shadowColor: "rgba(255, 99, 146, 0.2)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 2,
  },
  fieldIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#FFF0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    position: "relative",
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 26,
    padding: 0,
    paddingRight: 42,
    fontSize: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  visibilityButton: {
    position: "absolute",
    right: 0,
    bottom: -5,
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  messageCardError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#FFF1F5",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  messageCardSuccess: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#F2FBF7",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#B4234A",
  },
  successText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: palette.successText,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: palette.secondary,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "rgba(255, 99, 146, 0.42)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 3,
  },
  primaryButtonDisabled: {
    backgroundColor: "#D8D2D4",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
