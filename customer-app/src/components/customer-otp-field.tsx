import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  useSafeAnimationFrame,
  useSafeTimeout,
} from "@/src/hooks/use-safe-timeout";
import { palette } from "@/src/theme/palette";

export type CustomerOtpFieldHandle = {
  blur: () => void;
  focus: () => void;
  forceFocus: () => void;
};

type CustomerOtpFieldProps = {
  autoFocus?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  label?: string;
  length?: number;
  onChange: (value: string) => void;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
  value: string;
};

const DEFAULT_OTP_LENGTH = 4;

function sanitizeOtp(value: string, length: number) {
  return value.replace(/\D/g, "").slice(0, length);
}

export const CustomerOtpField = forwardRef<
  CustomerOtpFieldHandle,
  CustomerOtpFieldProps
>(function CustomerOtpField(
  {
    autoFocus = false,
    disabled = false,
    hasError = false,
    label = "Verification code",
    length = DEFAULT_OTP_LENGTH,
    onChange,
    onFocus,
    style,
    value,
  },
  ref,
) {
  const inputRef = useRef<TextInput | null>(null);
  const scheduleTimeout = useSafeTimeout();
  const scheduleAnimationFrame = useSafeAnimationFrame();
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const isKeyboardVisibleRef = useRef(false);
  const [cursorCycle, setCursorCycle] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const code = sanitizeOtp(value, length);

  const digits = useMemo(
    () => Array.from({ length }, (_, index) => code[index] ?? ""),
    [code, length],
  );
  const activeIndex = Math.min(code.length, length - 1);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      isKeyboardVisibleRef.current = true;
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      isKeyboardVisibleRef.current = false;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (disabled || (!isFocused && !hasError)) {
      cursorOpacity.setValue(1);
      return;
    }

    const blinkAnimation = Animated.loop(
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

    blinkAnimation.start();
    return () => blinkAnimation.stop();
  }, [cursorCycle, cursorOpacity, disabled, hasError, isFocused]);

  useEffect(() => {
    cursorOpacity.setValue(1);
    setCursorCycle((current) => current + 1);
  }, [code, cursorOpacity, hasError]);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input || disabled) {
      return;
    }

    cursorOpacity.setValue(1);
    setIsFocused(true);

    if (
      Platform.OS === "android" &&
      input.isFocused() &&
      !isKeyboardVisibleRef.current
    ) {
      input.blur();
      scheduleTimeout(() => input.focus(), 40);
      return;
    }

    input.focus();
  }, [cursorOpacity, disabled, scheduleTimeout]);

  const forceFocusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input || disabled) {
      return;
    }

    cursorOpacity.setValue(1);
    setCursorCycle((current) => current + 1);

    if (Platform.OS === "android") {
      input.blur();
      scheduleTimeout(() => input.focus(), 80);
      scheduleTimeout(() => input.focus(), 220);
      return;
    }

    scheduleAnimationFrame(() => input.focus());
  }, [cursorOpacity, disabled, scheduleAnimationFrame, scheduleTimeout]);

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    const cancelFocusTimer = scheduleTimeout(() => {
      focusInput();
    }, 220);

    return cancelFocusTimer;
  }, [autoFocus, disabled, focusInput, scheduleTimeout]);

  useImperativeHandle(
    ref,
    () => ({
      blur: () => inputRef.current?.blur(),
      focus: focusInput,
      forceFocus: forceFocusInput,
    }),
    [focusInput, forceFocusInput],
  );

  function handleChange(nextValue: string) {
    if (disabled) {
      return;
    }

    cursorOpacity.setValue(1);
    onChange(sanitizeOtp(nextValue, length));
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
        style={styles.pressTarget}
      >
        <View style={styles.cells}>
          {digits.map((digit, index) => {
            const canShowCursor = !disabled && (isFocused || hasError);
            const shouldShowErrorCursor =
              hasError && code.length === 0 && index === 0;
            const shouldShowTrailingCursor =
              canShowCursor && code.length === length && index === length - 1;
            const isActive =
              canShowCursor &&
              ((index === activeIndex && code.length < length) ||
                shouldShowErrorCursor ||
                shouldShowTrailingCursor);
            const isFilled = Boolean(digit);
            const isErrorCell =
              hasError &&
              (isFilled || shouldShowErrorCursor || shouldShowTrailingCursor);

            return (
              <View
                key={index}
                style={[
                  styles.cell,
                  isFilled ? styles.cellFilled : null,
                  isActive ? styles.cellActive : null,
                  isErrorCell ? styles.cellError : null,
                ]}
              >
                {digit ? (
                  <>
                    <Text
                      style={[
                        styles.cellText,
                        isErrorCell ? styles.cellTextError : null,
                      ]}
                    >
                      {digit}
                    </Text>
                    {shouldShowTrailingCursor ? (
                      <Animated.View
                        style={[
                          styles.cursor,
                          styles.trailingCursor,
                          hasError ? styles.cursorError : null,
                          { opacity: cursorOpacity },
                        ]}
                      />
                    ) : null}
                  </>
                ) : isActive ? (
                  <Animated.View
                    style={[
                      styles.cursor,
                      hasError ? styles.cursorError : null,
                      { opacity: cursorOpacity },
                    ]}
                  />
                ) : null}

                <View
                  style={[
                    styles.cellLine,
                    isFilled ? styles.cellLineFilled : null,
                    isActive ? styles.cellLineActive : null,
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
          onChangeText={handleChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          caretHidden
          editable={!disabled}
          showSoftInputOnFocus
          onFocus={() => {
            setIsFocused(true);
            cursorOpacity.setValue(1);
            onFocus?.();
          }}
          onBlur={() => setIsFocused(false)}
          style={styles.hiddenInput}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    gap: 12,
    borderRadius: 22,
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
  pressTarget: {
    position: "relative",
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
    borderRadius: 18,
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
  cellTextError: {
    color: "#B4234A",
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
