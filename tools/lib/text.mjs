// Text utilities for SVG rendering.
//
// SVG embedded via <img> cannot load webfonts and cannot measure text at build
// time, so widths are estimated from a per-character advance table calibrated
// against the system sans stack at weight 400. Estimates run slightly wide on
// purpose: a truncation that fires one character early is invisible, a label
// that overruns its card is the "криво" tell from PLAYBOOK §3.3.

const NARROW = new Set("iIjlt.,;:'\"!|`()[]{}/\\- ".split(""));
const WIDE = new Set("mMWwG@%OQ".split(""));

/** Estimated advance width of `ch` in em units at weight 400. */
function advance(ch) {
  if (NARROW.has(ch)) return 0.3;
  if (WIDE.has(ch)) return 0.86;
  if (ch >= "0" && ch <= "9") return 0.56;
  if (ch >= "A" && ch <= "Z") return 0.67;
  if (ch >= "a" && ch <= "z") return 0.53;
  // Cyrillic sits between Latin lower and upper in average advance.
  if (ch >= "А" && ch <= "я") return 0.58;
  return 0.6;
}

/** Estimated rendered width of `text` in px. */
export function measure(text, fontSize, weight = 400) {
  // Heavier weights add roughly 1.5% advance per 100 units above regular.
  const weightFactor = 1 + Math.max(0, weight - 400) * 0.00015;
  let em = 0;
  for (const ch of text) em += advance(ch);
  return em * fontSize * weightFactor;
}

/** Monospace advance is uniform; the system mono stack averages 0.6em. */
export function measureMono(text, fontSize) {
  return [...text].length * fontSize * 0.6;
}

/**
 * Truncate `text` so it fits `maxWidth` px, appending an ellipsis when cut.
 * Returns the original string untouched when it already fits.
 */
export function truncate(text, maxWidth, fontSize, weight = 400, mono = false) {
  const width = (s) => (mono ? measureMono(s, fontSize) : measure(s, fontSize, weight));
  if (width(text) <= maxWidth) return text;
  const ell = "…";
  const budget = maxWidth - width(ell);
  let out = "";
  for (const ch of text) {
    if (width(out + ch) > budget) break;
    out += ch;
  }
  return out.trimEnd() + ell;
}

/**
 * Wrap `text` into at most `maxLines` lines of `maxWidth` px, ellipsising the
 * last line if content remains. Breaks on spaces; a single over-long word is
 * hard-truncated rather than allowed to overflow.
 */
export function wrap(text, maxWidth, fontSize, maxLines, weight = 400) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, fontSize, weight) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);

  const consumed = lines.join(" ").length;
  if (consumed < text.trim().length && lines.length) {
    const last = lines.length - 1;
    lines[last] = truncate(`${lines[last]}…`, maxWidth, fontSize, weight);
  }
  return lines.map((l) => truncate(l, maxWidth, fontSize, weight));
}

/** Escape the five XML metacharacters so arbitrary text is safe inside SVG. */
export function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const PLURAL_RU = {
  minute: ["минуту", "минуты", "минут"],
  hour: ["час", "часа", "часов"],
  day: ["день", "дня", "дней"],
  week: ["неделю", "недели", "недель"],
  month: ["месяц", "месяца", "месяцев"],
  commit: ["коммит", "коммита", "коммитов"],
  repo: ["репозиторий", "репозитория", "репозиториев"],
};

/** Russian plural form selection (one / few / many). */
export function plural(n, kind) {
  const forms = PLURAL_RU[kind];
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** Human-readable Russian relative time, e.g. "3 дня назад". */
export function relTime(iso, now = Date.now()) {
  const diffMs = now - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "hour")} назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${plural(days, "day")} назад`;
  const weeks = Math.floor(days / 7);
  if (days < 60) return `${weeks} ${plural(weeks, "week")} назад`;
  const months = Math.floor(days / 30);
  return `${months} ${plural(months, "month")} назад`;
}
