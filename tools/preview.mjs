// Build local preview pages for visual verification.
//
// Three modes, because they answer different questions:
//   settled — animations forced to their end state. Deterministic, and the
//             state a visitor spends ~all their time looking at. Use for design
//             review; a screenshot mid-animation is not a design.
//   playing — animations left alone, to confirm they actually run.
//   static  — animations stripped entirely, simulating a renderer that ignores
//             CSS animation. Content must still be fully visible here.
//
// Usage: node tools/preview.mjs [settled|playing|static]

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(here, "..", "profile", "assets");

const MODE = process.argv[2] || "settled";
const PANELS = ["banner", "repos", "activity", "pulse", "languages"];

// GitHub's actual page backgrounds, so panels are judged in their real context
// rather than against an arbitrary neutral.
const PAGE_BG = { dark: "#0d1117", light: "#ffffff" };

const MODE_CSS = {
  // Negative delay equal to the duration lands every animation on its final
  // frame immediately, with no dependence on capture timing.
  settled: `svg * { animation-delay: -3s !important; animation-duration: .01s !important; }
            svg .sheen { animation: none !important; opacity: 0 !important; }`,
  playing: "",
  static: `svg * { animation: none !important; }`,
};

for (const theme of ["dark", "light"]) {
  const inlined = PANELS.map((name) => {
    // Inlining rather than <img src> puts the SVG in the main document, so the
    // page's own stylesheet can reach it and headless timing applies uniformly.
    const svg = readFileSync(join(ASSETS, `${name}-${theme}.svg`), "utf8");
    return `<div class="panel">${svg}</div>`;
  }).join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${theme} · ${MODE}</title>
<style>
  body { background: ${PAGE_BG[theme]}; margin: 0; padding: 24px;
         display: flex; flex-direction: column; gap: 16px; align-items: center; }
  .panel svg { display: block; width: 880px; height: auto; }
  ${MODE_CSS[MODE]}
</style></head><body>
${inlined}
</body></html>`;

  const out = join(here, "..", `preview-${theme}.html`);
  writeFileSync(out, html);
  console.log(`  preview-${theme}.html  (${MODE})`);
}
