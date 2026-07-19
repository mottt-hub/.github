// Shared SVG primitives for the Platinum Cockpit panels.
//
// DEPTH RECIPE (from the aesthetic's recipe, §3): depth comes from a hairline
// border plus an inset top light-lift, never from glow or heavy shadow. SVG has
// no inset box-shadow, so the lift is drawn explicitly as a 1px light line
// inset one pixel from the top edge of every raised surface.

import { alpha, FONT_MONO, FONT_SANS } from "./theme.mjs";
import { esc, measure, measureMono } from "./text.mjs";

export const PANEL_W = 880;
export const INSET = 28;
export const CONTENT_W = PANEL_W - INSET * 2;
export const RADIUS = 16;

let uid = 0;
/** Unique id per document, so multiple defs of the same kind cannot collide. */
export function nextId(prefix) {
  uid += 1;
  return `${prefix}${uid}`;
}

/** Reset ids between documents, keeping output stable across runs. */
export function resetIds() {
  uid = 0;
}

/**
 * Shared stylesheet. Motion is CSS rather than SMIL specifically so that
 * prefers-reduced-motion can switch it off — SMIL has no media-query escape
 * hatch, and an animation a user cannot stop is an accessibility failure.
 */
export function styles(t) {
  return `
  text { font-family: ${FONT_SANS}; }
  .mono { font-family: ${FONT_MONO}; font-variant-numeric: tabular-nums; }
  .caps { letter-spacing: .1em; text-transform: uppercase; }

  @keyframes sheen  { from { transform: translateX(-120%); } to { transform: translateX(260%); } }
  @keyframes rise   { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes slide  { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
  @keyframes grow   { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes widen  { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes draw   { from { stroke-dashoffset: 200; } to { stroke-dashoffset: 0; } }

  .sheen { animation: sheen 5.5s cubic-bezier(.45,0,.2,1) infinite; }
  .rise  { animation: rise .5s cubic-bezier(.16,1,.3,1) both; }
  .slide { animation: slide .42s cubic-bezier(.16,1,.3,1) both; }
  .bar   { transform-box: fill-box; transform-origin: 50% 100%;
           animation: grow .62s cubic-bezier(.16,1,.3,1) both; }
  .fill  { transform-box: fill-box; transform-origin: 0% 50%;
           animation: widen .8s cubic-bezier(.16,1,.3,1) both; }
  /* The hidden start state lives in the keyframes, never in the static rule.
     A renderer that ignores CSS animations then falls back to the FINISHED
     state — a drawn line, visible text — instead of an empty panel. */
  .spark { stroke-dasharray: 200;
           animation: draw 1.1s cubic-bezier(.16,1,.3,1) both; }

  @media (prefers-reduced-motion: reduce) {
    .sheen { animation: none; opacity: 0; }
    .rise, .slide, .bar, .fill, .spark { animation: none; opacity: 1; transform: none;
                                         stroke-dashoffset: 0; }
  }`;
}

/**
 * Film grain. Kills the flat digital wash on large near-black fields and is the
 * cheapest "material" signal available inside a self-contained SVG.
 */
export function grainDef(id) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>`;
}

/** The panel shell: rounded bg, hairline, top light-lift, grain, one soft wash. */
export function panel(t, height, { wash = true } = {}) {
  const grain = nextId("grain");
  const washId = nextId("wash");

  const washDef = wash
    ? `<radialGradient id="${washId}" cx="14%" cy="0%" r="62%">
         <stop offset="0%" stop-color="${t.accent}" stop-opacity="${t.name === "dark" ? 0.07 : 0.05}"/>
         <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
       </radialGradient>`
    : "";

  return {
    defs: `${grainDef(grain)}${washDef}`,
    body:
      `<rect width="${PANEL_W}" height="${height}" rx="${RADIUS}" fill="${t.bg}"/>` +
      (wash
        ? `<rect width="${PANEL_W}" height="${height}" rx="${RADIUS}" fill="url(#${washId})"/>`
        : "") +
      `<rect width="${PANEL_W}" height="${height}" rx="${RADIUS}" filter="url(#${grain})" ` +
      `opacity="${t.name === "dark" ? 0.05 : 0.035}" style="mix-blend-mode:overlay"/>` +
      `<rect x=".5" y=".5" width="${PANEL_W - 1}" height="${height - 1}" rx="${RADIUS - 0.5}" ` +
      `fill="none" stroke="${alpha(t.line, t.lineOpacity)}"/>` +
      `<path d="M${RADIUS} 1.5 H${PANEL_W - RADIUS}" stroke="${alpha(t.line, t.liftOpacity * 1.6)}" ` +
      `stroke-width="1" fill="none"/>`,
  };
}

/** A raised card: gradient fill, hairline, top light-lift. */
export function card(t, x, y, w, h) {
  const g = nextId("cardfill");
  return {
    defs: `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.surface2}"/>
      <stop offset="100%" stop-color="${t.surface1}"/>
    </linearGradient>`,
    body:
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="url(#${g})"/>` +
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="11.5" ` +
      `fill="none" stroke="${alpha(t.line, t.lineOpacity)}"/>` +
      `<path d="M${x + 12} ${y + 1.5} H${x + w - 12}" stroke="${alpha(t.line, t.liftOpacity * 2)}" ` +
      `stroke-width="1" fill="none"/>`,
  };
}

/**
 * SIGNATURE — the Signal Tick.
 * One 2px accent left-marker, repeated on every heading, card and feed row. A
 * single primitive reused everywhere is what makes the set read as authored
 * rather than assembled.
 */
export function tick(t, x, y, h = 16, color = null) {
  return `<rect x="${x}" y="${y}" width="2" height="${h}" rx="1" fill="${color || t.accent}"/>`;
}

/**
 * Wrap content in an animated group.
 *
 * The explicit opacity="1" presentation attribute is the safety net: when CSS
 * animations run, the animation's fill state overrides it and the group fades
 * in; when they do not run at all, the attribute stands and the content is
 * simply visible. Without it, `from { opacity: 0 }` plus `fill-mode: both`
 * leaves the panel permanently blank in any non-animating renderer.
 */
export function animGroup(cls, delayMs, content) {
  const delay = delayMs ? ` animation-delay:${(delayMs / 1000).toFixed(3)}s;` : "";
  return `<g class="${cls}" opacity="1" style="${delay}">${content}</g>`;
}

/** A text run. Sizes and weights come from the type ramp, never eyeballed. */
export function text(
  t,
  { x, y, content, size = 13, weight = 400, fill, anchor = "start", mono = false, cls = "", opacity, tracking }
) {
  const classes = [mono ? "mono" : "", cls].filter(Boolean).join(" ");
  // Same safety net as animGroup: a fade-in class must never be the only thing
  // making the text visible.
  const resolvedOpacity =
    opacity === undefined && /\b(rise|slide)\b/.test(cls) ? 1 : opacity;
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-size="${size}"`,
    `font-weight="${weight}"`,
    `fill="${fill || t.text}"`,
    anchor !== "start" ? `text-anchor="${anchor}"` : "",
    classes ? `class="${classes}"` : "",
    resolvedOpacity !== undefined ? `opacity="${resolvedOpacity}"` : "",
    tracking ? `letter-spacing="${tracking}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<text ${attrs}>${esc(content)}</text>`;
}

/** An all-caps micro label. Tracking is positive per the type rules. */
export function capsLabel(t, { x, y, content, size = 9.5, fill, anchor = "start", weight = 600 }) {
  return text(t, {
    x,
    y,
    content: content.toUpperCase(),
    size,
    weight,
    fill: fill || t.text4,
    anchor,
    tracking: "0.11em",
  });
}

/** Section heading: tick + caps title, an optional right note, and a rule. */
export function sectionHead(t, { x, y, title, note }) {
  const parts = [
    tick(t, x, y - 11, 13),
    text(t, { x: x + 12, y, content: title.toUpperCase(), size: 12, weight: 700, fill: t.text2, tracking: "0.13em" }),
  ];
  if (note) {
    parts.push(capsLabel(t, { x: x + CONTENT_W, y, content: note, anchor: "end", size: 9.5 }));
  }
  parts.push(
    `<path d="M${x} ${y + 16.5} H${x + CONTENT_W}" stroke="${alpha(t.line, t.lineSoftOpacity)}" stroke-width="1"/>`
  );
  return parts.join("");
}

/** Assemble a complete SVG document. */
export function document_(t, height, defs, body) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${height}" ` +
    `viewBox="0 0 ${PANEL_W} ${height}" role="img">` +
    `<style>${styles(t)}</style>` +
    `<defs>${defs}</defs>` +
    body +
    `</svg>`
  );
}

export { esc, measure, measureMono, alpha, FONT_MONO, FONT_SANS };
