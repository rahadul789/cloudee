import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { palette } from "@/src/theme/palette";

/** True for a full http(s) URL — an outside website, not an app route. */
export function isExternalHttpUrl(value?: string | null) {
  return /^https?:\/\/[^\s]+$/i.test(String(value ?? "").trim());
}

/** Opens an outside link; never throws. */
export function openExternalUrl(url: string) {
  void Linking.openURL(url.trim()).catch(() => undefined);
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

// Body text where any link (https://… or www.…) is visible (underlined, brand colour) and
// tappable — so admin messages that include a link actually work for the customer.
export function LinkifiedText({
  children,
  style,
  numberOfLines,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const parts = children.split(URL_PATTERN);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) => {
        if (!part) return null;
        if (!URL_PATTERN.test(part)) {
          URL_PATTERN.lastIndex = 0;
          return part;
        }
        URL_PATTERN.lastIndex = 0;
        // Trailing punctuation belongs to the sentence, not the link.
        const trimmed = part.replace(/[).,!?;:]+$/, "");
        const tail = part.slice(trimmed.length);
        const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        return (
          <Text key={`${index}-${trimmed}`}>
            <Text
              style={styles.link}
              onPress={() => openExternalUrl(href)}
              accessibilityRole="link"
            >
              {trimmed}
            </Text>
            {tail}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: palette.secondary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
