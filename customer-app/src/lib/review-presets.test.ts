import {
  composePresetComment,
  FOOD_ISSUES,
  FOOD_PRAISE,
  getFoodPresets,
  getRiderPresets,
  keepValidPicks,
  RIDER_ISSUES,
  RIDER_PRAISE,
} from "./review-presets";

describe("review presets", () => {
  it("shows no chips before a star is picked", () => {
    expect(getFoodPresets(0)).toEqual([]);
    expect(getRiderPresets(0)).toEqual([]);
  });

  it("uses praise for 4-5 stars and issues for 1-3", () => {
    expect(getFoodPresets(5)).toBe(FOOD_PRAISE);
    expect(getFoodPresets(4)).toBe(FOOD_PRAISE);
    expect(getFoodPresets(3)).toBe(FOOD_ISSUES);
    expect(getFoodPresets(1)).toBe(FOOD_ISSUES);
    expect(getRiderPresets(5)).toBe(RIDER_PRAISE);
    expect(getRiderPresets(2)).toBe(RIDER_ISSUES);
  });

  it("composes the picks into a comment", () => {
    expect(composePresetComment([])).toBeUndefined();
    expect(composePresetComment(["Tasty food", "Good value"])).toBe("Tasty food, Good value");
  });

  it("drops picks that no longer match the chip set", () => {
    expect(keepValidPicks(["Tasty food", "Food was cold"], FOOD_ISSUES)).toEqual(["Food was cold"]);
  });
});
