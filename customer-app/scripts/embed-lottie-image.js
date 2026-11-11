#!/usr/bin/env node
// Embeds external image assets into a Lottie JSON as base64 data URIs, because the app's
// Lottie player can't load images referenced by file name (e.g. "bela_mascot.png").
//
// Usage: node scripts/embed-lottie-image.js assets/bela_mascot_lottie.json assets/bela_mascot.png
//   (the PNG is matched to the asset whose "p" equals its file name; pass several PNGs if needed)
const fs = require("fs");
const path = require("path");

const [jsonPath, ...imagePaths] = process.argv.slice(2);
if (!jsonPath || imagePaths.length === 0) {
  console.error("Usage: node scripts/embed-lottie-image.js <lottie.json> <image.png> [...]");
  process.exit(1);
}

const lottie = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
let embedded = 0;
for (const imagePath of imagePaths) {
  const name = path.basename(imagePath);
  const ext = path.extname(name).slice(1).toLowerCase() === "jpg" ? "jpeg" : path.extname(name).slice(1).toLowerCase();
  const asset = (lottie.assets || []).find((item) => item.p === name);
  if (!asset) {
    console.warn(`No Lottie asset references "${name}" — skipped.`);
    continue;
  }
  const data = fs.readFileSync(imagePath).toString("base64");
  asset.u = "";
  asset.p = `data:image/${ext};base64,${data}`;
  asset.e = 1;
  embedded += 1;
}
fs.writeFileSync(jsonPath, JSON.stringify(lottie));
console.log(`Embedded ${embedded} image(s) into ${jsonPath}`);
