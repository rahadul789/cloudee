import mongoose from "mongoose";

import { connectDatabase } from "../config/db";
import { RestaurantModel } from "../modules/auth/auth.model";
import { getPlatformContent } from "../modules/public/content.service";

// READ-ONLY audit. Answers one question: does the home "time-based" section actually
// filter restaurants on your data, or does it just fall back to showing everything?
//
// It counts how many discoverable restaurants carry cuisineTypes / tags, and — using
// your REAL configured time windows — how many restaurants each window would actually
// match (name + cuisineTypes + tags), vs. how many fall through to the "show all" pool.
// Writes nothing to the database.

// Mirrors getDiscoverableRestaurantQuery() in customer.service.ts (not exported).
const DISCOVERABLE_QUERY = {
  "runtime.isVisible": true,
  $or: [
    { "enforcement.status": { $exists: false } },
    { "enforcement.status": { $in: ["active", "under_review"] } },
    { "enforcement.expiresAt": { $lte: new Date() } },
  ],
};

// Mirrors restaurantMatchesTimeTags() in customer.service.ts.
function restaurantMatchesTimeTags(
  restaurant: { name?: string; cuisineTypes?: string[]; tags?: string[] },
  tags: string[],
): boolean {
  if (!tags.length) return true;
  const haystack = [
    restaurant.name,
    ...(Array.isArray(restaurant.cuisineTypes) ? restaurant.cuisineTypes : []),
    ...(Array.isArray(restaurant.tags) ? restaurant.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tags.some((tag) => tag && haystack.includes(tag.toLowerCase()));
}

function nonEmpty(list: unknown): boolean {
  return (
    Array.isArray(list) &&
    list.some((value) => typeof value === "string" && value.trim().length > 0)
  );
}

async function auditRestaurantCuisineTags() {
  await connectDatabase();

  const restaurants = await RestaurantModel.find(DISCOVERABLE_QUERY, {
    name: 1,
    cuisineTypes: 1,
    tags: 1,
  }).lean<Array<{ name?: string; cuisineTypes?: string[]; tags?: string[] }>>();

  const total = restaurants.length;
  const withCuisine = restaurants.filter((r) => nonEmpty(r.cuisineTypes)).length;
  const withTags = restaurants.filter((r) => nonEmpty(r.tags)).length;
  const withEither = restaurants.filter(
    (r) => nonEmpty(r.cuisineTypes) || nonEmpty(r.tags),
  ).length;
  const withNeither = total - withEither;

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  console.log("\n=== Restaurant cuisine/tag coverage (discoverable restaurants) ===");
  console.log(`Total discoverable restaurants : ${total}`);
  console.log(`  with cuisineTypes set        : ${withCuisine} (${pct(withCuisine)}%)`);
  console.log(`  with tags set                : ${withTags} (${pct(withTags)}%)`);
  console.log(`  with EITHER set              : ${withEither} (${pct(withEither)}%)`);
  console.log(`  with NEITHER (blank)         : ${withNeither} (${pct(withNeither)}%)`);

  const content = await getPlatformContent();
  const windows =
    (content as any)?.customerApp?.homeCms?.timeBasedSection?.windows ?? [];

  console.log("\n=== Time-based section — how many restaurants each window matches ===");
  if (!Array.isArray(windows) || windows.length === 0) {
    console.log("No time windows configured.");
  } else {
    for (const window of windows) {
      const matchTags: string[] = Array.isArray(window?.matchTags)
        ? window.matchTags.filter(Boolean)
        : [];
      const matched = restaurants.filter((r) =>
        restaurantMatchesTimeTags(r, matchTags),
      ).length;
      const label = window?.label ?? window?.id ?? "window";
      const hours = `${window?.startHour ?? "?"}:00-${window?.endHour ?? "?"}:00`;
      if (!matchTags.length) {
        console.log(
          `  ${label} (${hours}) : no matchTags -> shows ALL ${total} (no real filter)`,
        );
      } else {
        console.log(
          `  ${label} (${hours}) : ${matched}/${total} match [${matchTags.join(", ")}]` +
            (matched === 0 ? "  -> falls back to showing ALL" : ""),
        );
      }
    }
  }

  console.log(
    "\nReading: if 'match' counts are near 0 (or NEITHER% is high), the section is\n" +
      "mostly cosmetic — tag your restaurants (cuisineTypes) to make it filter for real.\n",
  );

  await mongoose.disconnect();
}

auditRestaurantCuisineTags().catch((error) => {
  console.error("Restaurant cuisine/tag audit failed:", error);
  process.exit(1);
});
