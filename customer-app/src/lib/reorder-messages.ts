// Shared banner copy for reorder outcomes that aren't a normal success
// (Home "Order again", Orders tab and order tracking all use the same words).

export function closedReorderBanner(result: { restaurantName: string; opensAtLabel: string | null }) {
  return {
    title: `${result.restaurantName} is closed right now`,
    description: result.opensAtLabel
      ? `Reorder when it opens at ${result.opensAtLabel}.`
      : "Please reorder when it's open again.",
    tone: "warning" as const,
  };
}

export const failedReorderBanner = {
  title: "Couldn't reorder",
  description: "Something went wrong. Check your connection and try again.",
  tone: "warning" as const,
};
