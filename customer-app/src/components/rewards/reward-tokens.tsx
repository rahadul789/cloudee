import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

const BELA = require("../../../assets/mascot_signin.png");

// Game-style tokens: each reward has its own unmistakable shape.

/** 🪙 Bela Coin — gold disc with a rim and a "B". */
export function CoinIcon({ size = 22 }: { size?: number }) {
  return (
    <View
      style={[
        styles.coin,
        { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.1) },
      ]}
    >
      <Text style={[styles.coinText, { fontSize: size * 0.5 }]}>B</Text>
    </View>
  );
}

/** Coin counter that pops whenever the balance goes up. */
export function CoinCounter({ balance }: { balance: number }) {
  const pop = useRef(new Animated.Value(1)).current;
  const last = useRef(balance);
  useEffect(() => {
    if (balance > last.current) {
      pop.setValue(1.35);
      Animated.spring(pop, { toValue: 1, damping: 7, stiffness: 220, useNativeDriver: true }).start();
    }
    last.current = balance;
  }, [balance, pop]);
  return (
    <View style={styles.counter} accessibilityLabel={`${balance} coins`}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <CoinIcon size={22} />
      </Animated.View>
      <Text style={styles.counterText}>{balance}</Text>
    </View>
  );
}

/** 📮 Postage stamp: perforated edge; filled = amber with Bela, empty = dashed slot. */
export function StampTile({ filled, isGift, size = 50 }: { filled: boolean; isGift?: boolean; size?: number }) {
  const stampIn = useRef(new Animated.Value(filled ? 1 : 0)).current;
  useEffect(() => {
    if (filled) {
      stampIn.setValue(1.6);
      Animated.spring(stampIn, { toValue: 1, damping: 9, stiffness: 260, useNativeDriver: true }).start();
    }
  }, [filled, stampIn]);
  const holes = 4;
  const hole = size * 0.14;
  if (!filled) {
    return (
      <View style={[styles.stampEmpty, { width: size, height: size }, isGift ? styles.stampGift : null]}>
        {isGift ? <Ionicons name="gift" size={size * 0.42} color={palette.secondary} /> : null}
      </View>
    );
  }
  return (
    <Animated.View style={{ transform: [{ scale: stampIn }, { rotate: "-6deg" }] }}>
      <View style={[styles.stamp, { width: size, height: size }]}>
        <View style={styles.stampInner}>
          <Image source={BELA} style={{ width: size * 0.62, height: size * 0.62 }} resizeMode="contain" />
        </View>
        {/* perforation: background-coloured bites along each edge */}
        {Array.from({ length: holes }, (_, i) => {
          const offset = ((i + 0.5) / holes) * size - hole / 2;
          return (
            <View key={i} pointerEvents="none">
              <View style={[styles.hole, { width: hole, height: hole, borderRadius: hole / 2, top: -hole / 2, left: offset }]} />
              <View style={[styles.hole, { width: hole, height: hole, borderRadius: hole / 2, bottom: -hole / 2, left: offset }]} />
              <View style={[styles.hole, { width: hole, height: hole, borderRadius: hole / 2, left: -hole / 2, top: offset }]} />
              <View style={[styles.hole, { width: hole, height: hole, borderRadius: hole / 2, right: -hole / 2, top: offset }]} />
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  coin: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFC93C",
    borderColor: "#E0A100",
  },
  coinText: { fontWeight: "900", color: "#7A5200" },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 18,
    backgroundColor: "#111111",
  },
  counterText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  stamp: { backgroundColor: palette.primary, padding: 4, overflow: "visible" },
  stampInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(17,17,17,0.18)",
    backgroundColor: "#FFD27A",
  },
  hole: { position: "absolute", backgroundColor: palette.surface },
  stampEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#D5D7DB",
    borderRadius: 6,
  },
  stampGift: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
});
