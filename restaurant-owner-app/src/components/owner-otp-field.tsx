import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette } from "@/src/theme/palette";

type OwnerOtpFieldProps = {
  autoFocus?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  label?: string;
  length?: number;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  value: string;
};

const DEFAULT_OTP_LENGTH = 4;

function sanitizeOtp(value: string, length: number) {
  return value.replace(/\D/g, "").slice(0, length);
}

export function OwnerOtpField({
  autoFocus = false,
  disabled = false,
  hasError = false,
  label = "Verification code",
  length = DEFAULT_OTP_LENGTH,
  onChange,
  style,
  value,
}: OwnerOtpFieldProps) {
  const inputRef = useRef<TextInput | null>(null);
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const [isFocused, setIsFocused] = useState(false);
  const code = sanitizeOtp(value, length);
  const digits = useMemo(
    () => Array.from({ length }, (_, index) => code[index] ?? ""),
    [code, length],
  );
  const activeIndex = Math.min(code.length, length - 1);

  useEffect(() => {
    if (disabled || !isFocused) {
      cursorOpacity.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [cursorOpacity, disabled, isFocused]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 240);
    return () => clearTimeout(timer);
  }, [autoFocus, disabled]);

  function focusInput() {
    if (disabled) return;
    cursorOpacity.setValue(1);
    setIsFocused(true);
    inputRef.current?.focus();
  }

  return (
    <View
      style={[
        styles.shell,
        hasError ? styles.shellError : null,
        disabled ? styles.shellDisabled : null,
        style,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.counter}>
          {code.length}/{length}
        </Text>
      </View>

      <Pressable
        accessibilityLabel={label}
        accessibilityRole="keyboardkey"
        disabled={disabled}
        onPress={focusInput}
      >
        <View style={styles.cells}>
          {digits.map((digit, index) => {
            const shouldShowCursor =
              !disabled &&
              isFocused &&
              ((index === activeIndex && code.length < length) ||
                (code.length === length && index === length - 1));
            const isFilled = Boolean(digit);
            const isErrorCell = hasError && (isFilled || index === activeIndex);

            return (
              <View
                key={index}
                style={[
                  styles.cell,
                  isFilled ? styles.cellFilled : null,
                  shouldShowCursor ? styles.cellActive : null,
                  isErrorCell ? styles.cellError : null,
                ]}
              >
                {digit ? <Text style={styles.cellText}>{digit}</Text> : null}
                {shouldShowCursor ? (
                  <Animated.View
                    style={[
                      styles.cursor,
                      code.length === length ? styles.trailingCursor : null,
                      hasError ? styles.cursorError : null,
                      { opacity: cursorOpacity },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.cellLine,
                    isFilled ? styles.cellLineFilled : null,
                    shouldShowCursor ? styles.cellLineActive : null,
                    isErrorCell ? styles.cellLineError : null,
                  ]}
                />
              </View>
            );
          })}
        </View>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={(nextValue) => onChange(sanitizeOtp(nextValue, length))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          caretHidden
          editable={!disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={styles.hiddenInput}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ECE3DD",
    backgroundColor: "#FFFEFC",
    padding: 13,
  },
  shellError: {
    borderColor: "#F0B8C8",
    backgroundColor: "#FFFBFC",
  },
  shellDisabled: {
    opacity: 0.68,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.foreground,
  },
  counter: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  cells: {
    flexDirection: "row",
    gap: 8,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    height: 60,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E9E1DC",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: {
    borderColor: palette.foreground,
    shadowColor: "rgba(31, 36, 48, 0.16)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 2,
  },
  cellFilled: {
    borderColor: "#DCD4CE",
  },
  cellError: {
    borderColor: "#D75A79",
  },
  cellText: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  cursor: {
    width: 2,
    height: 25,
    borderRadius: 2,
    backgroundColor: palette.foreground,
  },
  trailingCursor: {
    position: "absolute",
    right: 10,
  },
  cursorError: {
    backgroundColor: "#B4234A",
  },
  cellLine: {
    position: "absolute",
    bottom: 8,
    width: 18,
    height: 3,
    borderRadius: 3,
    backgroundColor: "#E9E1DC",
  },
  cellLineFilled: {
    backgroundColor: palette.foreground,
  },
  cellLineActive: {
    width: 24,
    backgroundColor: palette.secondary,
  },
  cellLineError: {
    width: 24,
    backgroundColor: "#B4234A",
  },
  hiddenInput: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    color: "transparent",
    fontSize: 1,
    opacity: 0,
  },
});
