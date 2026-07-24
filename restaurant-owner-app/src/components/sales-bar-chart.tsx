import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { palette } from "@/src/theme/palette";

export type SalesBarChartMode = "sales" | "orders";

export type SalesBarChartPoint = {
  date: string;
  label: string;
  sales: number;
  orders: number;
};

type SalesBarChartProps = {
  points: SalesBarChartPoint[];
  mode: SalesBarChartMode;
  formatSales: (value: number) => string;
  formatOrders: (value: number) => string;
  salesLabel: string;
  ordersLabel: string;
  emptyLabel: string;
};

const CHART_HEIGHT = 168;

export function SalesBarChart({
  points,
  mode,
  formatSales,
  formatOrders,
  salesLabel,
  ordersLabel,
  emptyLabel,
}: SalesBarChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const values = useMemo(
    () => points.map((point) => (mode === "sales" ? point.sales : point.orders)),
    [mode, points],
  );
  const maxValue = Math.max(...values, 0);
  const safeSelectedIndex =
    selectedIndex !== null && selectedIndex < points.length
      ? selectedIndex
      : points.length > 0
        ? points.length - 1
        : null;
  const selectedPoint =
    safeSelectedIndex !== null ? points[safeSelectedIndex] : null;
  const barWidth = points.length > 24 ? 14 : points.length > 14 ? 20 : 28;
  const itemWidth = points.length > 24 ? 28 : points.length > 14 ? 34 : 44;
  const labelEvery = points.length > 18 ? 5 : points.length > 10 ? 3 : 1;

  if (!points.length) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {selectedPoint ? (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedDate}>{selectedPoint.label}</Text>
          <View style={styles.selectedMetricRow}>
            <Text style={styles.selectedMetric}>
              {mode === "sales"
                ? formatSales(selectedPoint.sales)
                : formatOrders(selectedPoint.orders)}
            </Text>
            <Text style={styles.selectedMeta}>
              {salesLabel}: {formatSales(selectedPoint.sales)} · {ordersLabel}:{" "}
              {formatOrders(selectedPoint.orders)}
            </Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.chartArea, { height: CHART_HEIGHT }]}>
          {points.map((point, index) => {
            const value = values[index] ?? 0;
            const height =
              maxValue > 0 ? Math.max(6, (value / maxValue) * CHART_HEIGHT) : 6;
            const isSelected = index === safeSelectedIndex;
            const showLabel =
              isSelected || index === 0 || index === points.length - 1 || index % labelEvery === 0;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${point.label}, ${formatSales(point.sales)}, ${formatOrders(point.orders)}`}
                key={point.date}
                style={({ pressed }) => [
                  styles.barItem,
                  { width: itemWidth },
                  pressed ? styles.barItemPressed : null,
                ]}
                onPress={() => setSelectedIndex(index)}
              >
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      {
                        width: barWidth,
                        height,
                        backgroundColor: isSelected
                          ? palette.foreground
                          : mode === "sales"
                            ? palette.primary
                            : palette.success,
                      },
                      value === 0 ? styles.barZero : null,
                    ]}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.barLabel, !showLabel ? styles.barLabelMuted : null]}
                >
                  {showLabel ? point.label : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  selectedCard: {
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 3,
  },
  selectedDate: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  selectedMetricRow: {
    gap: 2,
  },
  selectedMetric: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.foreground,
  },
  selectedMeta: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  chartArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  barItem: {
    height: CHART_HEIGHT + 28,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 7,
  },
  barItemPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  barTrack: {
    height: CHART_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  barZero: {
    opacity: 0.32,
  },
  barLabel: {
    height: 18,
    minWidth: 28,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  barLabelMuted: {
    color: "transparent",
  },
  emptyChart: {
    minHeight: 170,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
});
