import { computeOfferProgress, type OfferTier } from "@/src/lib/offer-progress";

const tier = (
  minimumOrderAmount: number,
  discount: number,
  label = `Tk ${discount} off`,
): OfferTier => ({ minimumOrderAmount, discount, label });

describe("computeOfferProgress", () => {
  it("returns null when there are no valid tiers", () => {
    expect(computeOfferProgress([], 100)).toBeNull();
    // minimumOrderAmount / discount of 0 are not real tiers.
    expect(computeOfferProgress([tier(0, 50), tier(200, 0)], 100)).toBeNull();
  });

  it("chases the next threshold when nothing is unlocked yet", () => {
    const progress = computeOfferProgress([tier(200, 50)], 100);
    expect(progress).not.toBeNull();
    expect(progress).toMatchObject({
      target: 200,
      remaining: 100,
      ratio: 0.5,
      hasCurrent: false,
      unlocked: false,
      nextLabel: "Tk 50 off",
      currentLabel: "",
    });
  });

  it("marks the top tier unlocked once the subtotal clears it", () => {
    const progress = computeOfferProgress([tier(200, 50)], 250);
    expect(progress).toMatchObject({
      target: 200,
      remaining: 0,
      ratio: 1,
      hasCurrent: true,
      unlocked: true,
      currentLabel: "Tk 50 off",
      nextLabel: "",
    });
  });

  it("reports the active tier and the next bigger one together", () => {
    const progress = computeOfferProgress(
      [tier(200, 30), tier(400, 80)],
      250,
    );
    expect(progress).toMatchObject({
      target: 400,
      remaining: 150,
      hasCurrent: true,
      unlocked: false,
      currentLabel: "Tk 30 off",
      nextLabel: "Tk 80 off",
    });
    expect(progress?.ratio).toBeCloseTo(0.625);
  });

  it("picks the best-value tier among several already unlocked", () => {
    const progress = computeOfferProgress(
      [tier(100, 20), tier(150, 50)],
      200,
    );
    // Both unlocked; the higher-discount tier wins as the current deal.
    expect(progress?.currentLabel).toBe("Tk 50 off");
    expect(progress?.unlocked).toBe(true);
  });
});
