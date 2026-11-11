import {
  SOFT_PROMPT_SNOOZE_MS,
  compareVersions,
  decideAppUpdate,
  shouldShowSoftPrompt,
} from "./app-update";

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.0.9", "1.0.10")).toBe(-1);
  });
  it("treats missing parts as 0", () => {
    expect(compareVersions("1.1", "1.1.0")).toBe(0);
  });
  it("returns null for invalid input", () => {
    expect(compareVersions("", "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeNull();
  });
});

describe("decideAppUpdate", () => {
  const config = { enabled: true, latestVersion: "1.2.0", minimumVersion: "1.1.0" };

  it("forces below the minimum", () => {
    expect(decideAppUpdate("1.0.6", config)).toBe("force");
  });
  it("is soft between minimum and latest", () => {
    expect(decideAppUpdate("1.1.5", config)).toBe("soft");
  });
  it("does nothing on the latest (or newer) version", () => {
    expect(decideAppUpdate("1.2.0", config)).toBe("none");
    expect(decideAppUpdate("1.3.0", config)).toBe("none");
  });
  it("does nothing when disabled, unset, or the installed version is unknown", () => {
    expect(decideAppUpdate("1.0.0", { ...config, enabled: false })).toBe("none");
    expect(decideAppUpdate("1.0.0", { enabled: true, latestVersion: "", minimumVersion: "" })).toBe("none");
    expect(decideAppUpdate(null, config)).toBe("none");
    expect(decideAppUpdate("1.0.0", null)).toBe("none");
  });
  it("ignores an invalid minimum but still honours latest", () => {
    expect(decideAppUpdate("1.0.0", { enabled: true, latestVersion: "1.2.0", minimumVersion: "abc" })).toBe("soft");
  });
});

describe("shouldShowSoftPrompt", () => {
  const now = 10_000_000_000;
  it("shows when never snoozed or snoozed for an older latest version", () => {
    expect(shouldShowSoftPrompt("1.2.0", null, now)).toBe(true);
    expect(shouldShowSoftPrompt("1.2.0", { version: "1.1.0", at: now }, now)).toBe(true);
  });
  it("stays hidden during the snooze, shows again after it", () => {
    expect(shouldShowSoftPrompt("1.2.0", { version: "1.2.0", at: now - 1000 }, now)).toBe(false);
    expect(shouldShowSoftPrompt("1.2.0", { version: "1.2.0", at: now - SOFT_PROMPT_SNOOZE_MS }, now)).toBe(true);
  });
});
