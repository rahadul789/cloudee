import {
  buildItemMarkdownDisplay,
  computeMarkdownAmount,
  pickRuleForItem,
  type MarkdownMenuItem,
  type MarkdownRule,
} from "../src/modules/promotions/menu-markdown";

function rule(overrides: Partial<MarkdownRule> = {}): MarkdownRule {
  return {
    _id: "rule-1",
    scopeType: "restaurant",
    restaurantId: "rest-1",
    applicability: "all",
    type: "percentage",
    discountValue: 20,
    minItemPrice: 0,
    maxDiscountAmount: 0,
    priority: 0,
    ...overrides,
  };
}

describe("computeMarkdownAmount", () => {
  it("applies a percentage discount", () => {
    expect(computeMarkdownAmount(300, rule({ type: "percentage", discountValue: 20 }))).toBe(60);
  });

  it("applies a flat discount", () => {
    expect(computeMarkdownAmount(300, rule({ type: "flat", discountValue: 50 }))).toBe(50);
  });

  it("returns 0 below the threshold", () => {
    expect(
      computeMarkdownAmount(200, rule({ type: "percentage", discountValue: 20, minItemPrice: 250 })),
    ).toBe(0);
  });

  it("applies once the price meets the threshold", () => {
    expect(
      computeMarkdownAmount(300, rule({ type: "percentage", discountValue: 20, minItemPrice: 250 })),
    ).toBe(60);
  });

  it("respects the per-item cap", () => {
    expect(
      computeMarkdownAmount(
        1000,
        rule({ type: "percentage", discountValue: 50, maxDiscountAmount: 100 }),
      ),
    ).toBe(100);
  });

  it("never discounts more than the price", () => {
    expect(computeMarkdownAmount(40, rule({ type: "flat", discountValue: 50 }))).toBe(40);
  });
});

describe("pickRuleForItem precedence", () => {
  const item: MarkdownMenuItem = { _id: "item-1", categoryId: "cat-1", basePrice: 300 };

  it("prefers item-level over category- and restaurant-level rules", () => {
    const restaurantRule = rule({ _id: "r", applicability: "all", discountValue: 10 });
    const categoryRule = rule({ _id: "c", applicability: "categories", categoryIds: ["cat-1"], discountValue: 15 });
    const itemRule = rule({ _id: "i", applicability: "items", itemIds: ["item-1"], discountValue: 5 });
    const picked = pickRuleForItem(item, [restaurantRule, categoryRule, itemRule], "rest-1");
    expect(picked?._id).toBe("i");
  });

  it("ignores rules for other restaurants", () => {
    const otherRule = rule({ _id: "other", restaurantId: "rest-2" });
    expect(pickRuleForItem(item, [otherRule], "rest-1")).toBeNull();
  });
});

describe("buildItemMarkdownDisplay variant threshold spanning", () => {
  // base 0 + variants 200 / 300, threshold 250: cheapest does not qualify but the 300 does.
  const variantItem: MarkdownMenuItem = {
    _id: "item-1",
    categoryId: "cat-1",
    basePrice: 0,
    variants: [{ options: [{ priceDelta: 200 }, { priceDelta: 300 }] }],
  };

  it("flags partialVariants when only pricier variants qualify", () => {
    const display = buildItemMarkdownDisplay(
      variantItem,
      rule({ type: "percentage", discountValue: 20, minItemPrice: 250 }),
    );
    expect(display?.partialVariants).toBe(true);
    expect(display?.hasMarkdown).toBe(false);
    // Card keeps the real "from" price (200) un-struck.
    expect(display?.originalPrice).toBe(200);
    expect(display?.effectivePrice).toBe(200);
  });

  it("shows a struck price when the cheapest variant qualifies", () => {
    const display = buildItemMarkdownDisplay(
      variantItem,
      rule({ type: "percentage", discountValue: 20, minItemPrice: 150 }),
    );
    expect(display?.hasMarkdown).toBe(true);
    expect(display?.partialVariants).toBe(false);
    expect(display?.originalPrice).toBe(200);
    expect(display?.effectivePrice).toBe(160);
  });

  it("returns null when no variant qualifies", () => {
    const display = buildItemMarkdownDisplay(
      variantItem,
      rule({ type: "percentage", discountValue: 20, minItemPrice: 400 }),
    );
    expect(display).toBeNull();
  });
});
