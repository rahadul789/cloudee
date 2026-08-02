import { NeonStickerCard } from "@/src/components/neon-sticker-card";

// Gen-Z "priority" sticker for the order tracking screen. Thin wrapper over the shared
// NeonStickerCard (amber = priority accent) so it stays part of one design system.
export function PriorityDeliveryBanner({ label }: { label: string }) {
  return (
    <NeonStickerCard
      accent="amber"
      icon="flash"
      eyebrow={`PRIORITY · ${label}`}
      title="You skipped the line ⚡"
      body="You paid for priority, so your order is sent to a delivery rider before other orders. 🚀"
      style={styles.spacing}
    />
  );
}

const styles = {
  spacing: { marginHorizontal: 18, marginBottom: 14 },
} as const;
