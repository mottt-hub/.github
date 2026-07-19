// Token contract — aesthetic: PLATINUM COCKPIT.
// Cool graphite quiet-luxury with exactly ONE warm note (champagne-gold).
// Dark is the primary mode; the light mode is a porcelain counterpart on the
// same hue axis, not an inversion.
//
// Values are authored in OKLCH and emitted as hex. SVG rendered inside an <img>
// has no CSS custom-property cascade to rely on and no @supports fallback path,
// so the conversion happens here at build time and the SVG receives literal
// colours. The OKLCH source values stay in the comments as the real contract.
//
// Non-negotiables carried from PLAYBOOK §3.2: never pure #000 or #fff; neutrals
// keep a small chroma so they do not read as dead grey; ONE accent under ~10%
// of surface area.

/** OKLCH → sRGB hex. Standard OKLab matrices, gamut-clipped per channel. */
export function oklch(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  const rLin = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const gLin = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bLin = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  const encode = (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${encode(rLin)}${encode(gLin)}${encode(bLin)}`;
}

// The cool graphite neutral axis and the single warm accent hue.
const H_GRAPHITE = 286;
const H_GOLD = 79;

export const DARK = {
  name: "dark",

  // Canvas + surface ramp. The surface↔bg gap is deliberately ~5% OKLCH L:
  // the recipe records that a ~3.3% gap read flat and pasted-on at real screen
  // brightness and cost a redeploy.
  bg: oklch(0.146, 0.004, H_GRAPHITE),
  surface1: oklch(0.198, 0.01, H_GRAPHITE),
  surface2: oklch(0.234, 0.013, H_GRAPHITE),
  surface3: oklch(0.272, 0.015, H_GRAPHITE),

  // Text ramp — never pure white, which halos against near-black.
  text: oklch(0.949, 0.005, 275),
  text2: oklch(0.842, 0.013, 267),
  text3: oklch(0.691, 0.012, 280),
  text4: oklch(0.488, 0.014, 281),

  accent: oklch(0.791, 0.087, H_GOLD),
  accentDim: oklch(0.62, 0.07, H_GOLD),
  onAccent: oklch(0.22, 0.03, 70),

  // Hairlines and the inset top light-lift are the depth recipe. SVG has no
  // inset box-shadow, so the lift is drawn as an explicit 1px light line along
  // the top edge of each card.
  line: "#ffffff",
  lineOpacity: 0.11,
  lineSoftOpacity: 0.06,
  liftOpacity: 0.07,

  // Metal gradient stops for the signature clipped-metal wordmark.
  metal: ["#6e7078", "#b4b8c2", "#f2f4f8", "#c7cbd4", "#8f939c", "#e6e9ef", "#a7abb4"],
  sheen: "#ffffff",
  sheenOpacity: 0.5,

  ok: oklch(0.726, 0.135, 161),
  grid: "#ffffff",
  gridOpacity: 0.05,
};

export const LIGHT = {
  name: "light",

  // Porcelain rather than white: the same cool hue axis walked to high L, so
  // the light mode reads as the same product under different light.
  bg: oklch(0.965, 0.003, H_GRAPHITE),
  surface1: oklch(0.993, 0.002, H_GRAPHITE),
  surface2: oklch(0.945, 0.004, H_GRAPHITE),
  surface3: oklch(0.91, 0.006, H_GRAPHITE),

  text: oklch(0.24, 0.012, H_GRAPHITE),
  text2: oklch(0.4, 0.012, H_GRAPHITE),
  text3: oklch(0.55, 0.011, H_GRAPHITE),
  text4: oklch(0.68, 0.009, H_GRAPHITE),

  // The gold must darken on porcelain or it drops below readable contrast —
  // the same hue, walked down in lightness and up slightly in chroma.
  accent: oklch(0.62, 0.098, H_GOLD),
  accentDim: oklch(0.74, 0.085, H_GOLD),
  onAccent: oklch(0.98, 0.01, 80),

  // On light, hairlines are dark ink at low alpha and the "lift" inverts into a
  // soft bottom shadow line rather than a top highlight.
  line: "#0a0a0c",
  lineOpacity: 0.14,
  lineSoftOpacity: 0.07,
  liftOpacity: 0.05,

  // Engraved graphite rather than bright platinum: a light-on-light metal
  // gradient would vanish, so the wordmark inverts to dark polished steel.
  metal: ["#8d919b", "#3a3c44", "#1b1c21", "#4a4d56", "#22242a", "#5e626c", "#2c2e35"],
  sheen: "#ffffff",
  sheenOpacity: 0.42,

  ok: oklch(0.58, 0.135, 161),
  grid: "#0a0a0c",
  gridOpacity: 0.06,
};

export const THEMES = [DARK, LIGHT];

// Type stacks. An SVG loaded through <img> cannot fetch webfonts, so the
// Unbounded/Onest/JetBrains pairing from the recipe is unavailable and the
// system stacks stand in. Cyrillic coverage is the constraint that rules out
// most decorative fallbacks.
export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
export const FONT_MONO =
  "ui-monospace, 'SF Mono', 'Cascadia Mono', 'DejaVu Sans Mono', Menlo, Consolas, monospace";

// GitHub's linguist colours, for the languages this org actually uses. Falling
// back to a neutral keeps an unmapped language from inventing a hue that would
// break the one-accent rule.
export const LANG_COLORS = {
  Python: "#3572A5",
  HTML: "#e34c26",
  Shell: "#89e051",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  CSS: "#663399",
  SCSS: "#c6538c",
  Dockerfile: "#384d54",
  Makefile: "#427819",
  Jinja: "#a52a22",
  Mako: "#7e858d",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  Java: "#b07219",
  C: "#555555",
  "C++": "#f34b7d",
  PHP: "#4F5D95",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  PowerShell: "#012456",
  Batchfile: "#C1F12E",
  Roff: "#ecdebe",
  Procfile: "#a91e50",
  Nix: "#7e7eff",
  Lua: "#000080",
};

export function langColor(name) {
  return LANG_COLORS[name] || "#8b8d98";
}

/** `rgba()` string from a hex base plus an alpha, for hairlines and washes. */
export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
