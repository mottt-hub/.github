// Render the organisation's activity into self-contained SVG panels.
//
// AESTHETIC: Platinum Cockpit — cool graphite quiet-luxury, one champagne-gold
// note. SIGNATURE: the Signal Tick, a single 2px accent left-marker repeated on
// every heading, card and feed row.
//
// Reads tools/data.json (produced by fetch-data.mjs) and writes a dark and a
// light variant of each panel into profile/assets/. Rendering is pure: no
// network, no clock beyond data.generatedAt, so output changes only when the
// underlying activity does.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { THEMES, langColor, alpha } from "./lib/theme.mjs";
import { relTime, truncate, wrap, plural, measure, measureMono } from "./lib/text.mjs";
import { redactSubject, redactMeta } from "./lib/redact.mjs";
import {
  PANEL_W,
  INSET,
  CONTENT_W,
  panel,
  card,
  tick,
  text,
  capsLabel,
  sectionHead,
  document_,
  nextId,
  resetIds,
  animGroup,
} from "./lib/svg.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(here, "..", "profile", "assets");

const data = JSON.parse(readFileSync(join(here, "data.json"), "utf8"));
const NOW = new Date(data.generatedAt).getTime();

/** Thin space as a thousands separator, per Russian typographic convention. */
function num(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 — BANNER
// Wordmark in clipped metal with a travelling sheen, over an instrument strip
// of four live readouts.
// ─────────────────────────────────────────────────────────────────────────────
function renderBanner(t) {
  resetIds();
  const H = 208;
  const shell = panel(t, H);
  const defs = [shell.defs];
  const body = [shell.body];

  const STRIP_Y = 142;

  // — the metal wordmark —
  const metalId = nextId("metal");
  const clipId = nextId("wordclip");
  const sheenId = nextId("sheengrad");
  const WORD = data.org;
  const WORD_SIZE = 54;
  const WORD_X = INSET;
  const WORD_Y = 96;
  // The advance estimate runs slightly narrow at display sizes, and a metal
  // fill that stops short of the last glyph truncates the wordmark. The clip
  // path is the real boundary, so overshooting the fill costs nothing.
  const wordW = measure(WORD, WORD_SIZE, 800) * 1.2;

  defs.push(
    `<linearGradient id="${metalId}" x1="0" y1="0" x2="1" y2="0.25">` +
      t.metal
        .map((c, i) => `<stop offset="${(i / (t.metal.length - 1)) * 100}%" stop-color="${c}"/>`)
        .join("") +
      `</linearGradient>`,
    `<linearGradient id="${sheenId}" x1="0" y1="0" x2="1" y2="0">
       <stop offset="0%" stop-color="${t.sheen}" stop-opacity="0"/>
       <stop offset="50%" stop-color="${t.sheen}" stop-opacity="${t.sheenOpacity}"/>
       <stop offset="100%" stop-color="${t.sheen}" stop-opacity="0"/>
     </linearGradient>`,
    `<clipPath id="${clipId}">` +
      `<text x="${WORD_X}" y="${WORD_Y}" font-size="${WORD_SIZE}" font-weight="800" ` +
      `letter-spacing="-0.025em" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">${WORD}</text>` +
      `</clipPath>`
  );

  // The sheen is a translucent band swept across the wordmark, masked by the
  // glyphs themselves. Animating a gradient's transform would not respect
  // reduced-motion; a CSS-animated rect does.
  body.push(
    `<g clip-path="url(#${clipId})">` +
      `<rect x="${WORD_X}" y="${WORD_Y - WORD_SIZE}" width="${wordW}" height="${WORD_SIZE * 1.3}" fill="url(#${metalId})"/>` +
      `<rect class="sheen" x="${WORD_X}" y="${WORD_Y - WORD_SIZE}" width="${wordW * 0.5}" ` +
      `height="${WORD_SIZE * 1.3}" fill="url(#${sheenId})"/>` +
      `</g>`
  );

  // — kicker + tagline —
  body.push(tick(t, INSET, 40, 12));
  body.push(
    capsLabel(t, { x: INSET + 12, y: 50, content: "организация · github", fill: t.text4, size: 9.5 })
  );
  body.push(
    text(t, {
      x: INSET + 1,
      y: 124,
      content: "Self-hosted инструменты, боты и автоматизация — всё на своём железе",
      size: 14.5,
      fill: t.text3,
    })
  );

  // — freshness stamp, right —
  body.push(
    capsLabel(t, {
      x: PANEL_W - INSET,
      y: 50,
      content: "живые данные",
      anchor: "end",
      fill: t.accent,
      size: 9.5,
    })
  );
  body.push(
    text(t, {
      x: PANEL_W - INSET,
      y: 68,
      content: `обновлено ${relTime(data.generatedAt, NOW)}`,
      size: 11,
      fill: t.text4,
      anchor: "end",
      mono: true,
    })
  );

  // — instrument strip —
  body.push(
    `<path d="M${INSET} ${STRIP_Y} H${PANEL_W - INSET}" stroke="${alpha(t.line, t.lineSoftOpacity)}" stroke-width="1"/>`
  );

  // Four readouts that measure genuinely different things. An earlier version
  // showed both the 12-week and the 30-day commit count; while all activity
  // happens to fall inside 30 days those render as the same number twice, which
  // reads as a broken panel rather than as a true fact.
  const activeRepos = data.repos.filter((r) => r.commits30 > 0).length;
  const readouts = [
    { value: num(data.totals.repos), label: plural(data.totals.repos, "repo") },
    { value: num(activeRepos), label: "активны за 30 дней" },
    { value: num(data.totals.commits30), label: `${plural(data.totals.commits30, "commit")} / 30 дней` },
    { value: relTime(data.totals.lastPush, NOW), label: "последняя активность" },
  ];

  const colW = CONTENT_W / readouts.length;
  readouts.forEach((r, i) => {
    const x = INSET + i * colW;
    body.push(tick(t, x, STRIP_Y + 20, 14, i === 0 ? t.accent : alpha(t.accent, 0.45)));
    body.push(
      text(t, {
        x: x + 12,
        y: STRIP_Y + 32,
        content: r.value,
        size: 21,
        weight: 700,
        fill: t.text,
        mono: true,
        cls: "rise",
      })
    );
    body.push(
      capsLabel(t, { x: x + 12, y: STRIP_Y + 50, content: r.label, size: 9, fill: t.text4 })
    );
  });

  return document_(t, H, defs.join(""), body.join(""));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 — TOP REPOSITORIES BY ACTIVITY
// Ranked by a blend of 30-day volume and recency, so a repo that is busy today
// outranks one that was busy two months ago.
// ─────────────────────────────────────────────────────────────────────────────
function activityScore(repo) {
  if (!repo.lastCommit) return 0;
  const days = (NOW - new Date(repo.lastCommit.date).getTime()) / 86400000;
  const recency = 40 / (1 + days / 3);
  return repo.commits30 * 2 + repo.commits12w * 0.4 + recency;
}

function renderRepos(t) {
  resetIds();
  const top = [...data.repos]
    .filter((r) => r.lastCommit)
    .sort((a, b) => activityScore(b) - activityScore(a))
    .slice(0, 6);

  const COLS = 2;
  const GUT = 20;
  const CARD_W = (CONTENT_W - GUT * (COLS - 1)) / COLS;
  const CARD_H = 140;
  const rows = Math.ceil(top.length / COLS);
  const HEAD_Y = INSET + 18;
  const GRID_Y = HEAD_Y + 34;
  const H = GRID_Y + rows * CARD_H + (rows - 1) * GUT + INSET;

  const shell = panel(t, H);
  const defs = [shell.defs];
  const body = [shell.body];

  body.push(
    sectionHead(t, { x: INSET, y: HEAD_Y, title: "главные проекты", note: "по активности за 30 дней" })
  );

  // Sparklines share one scale across the set so card heights are comparable —
  // a per-card scale would make a one-commit repo look as busy as a hundred.
  const peak = Math.max(1, ...top.flatMap((r) => r.weekly));

  top.forEach((repo, i) => {
    const cx = INSET + (i % COLS) * (CARD_W + GUT);
    const cy = GRID_Y + Math.floor(i / COLS) * (CARD_H + GUT);

    const c = card(t, cx, cy, CARD_W, CARD_H);
    defs.push(c.defs);
    const g = [c.body];

    // Signal Tick + name.
    g.push(tick(t, cx + 18, cy + 20, 15));
    const badgeW = 66;
    const nameMax = CARD_W - 30 - 18 - badgeW - 10;
    g.push(
      text(t, {
        x: cx + 30,
        y: cy + 33,
        content: truncate(repo.name, nameMax, 16.5, 700),
        size: 16.5,
        weight: 700,
        fill: t.text,
        tracking: "-0.01em",
      })
    );

    // 30-day volume badge, right-aligned to the card's inner edge.
    g.push(
      text(t, {
        x: cx + CARD_W - 18,
        y: cy + 31,
        content: num(repo.commits30),
        size: 16,
        weight: 700,
        fill: repo.commits30 > 0 ? t.accent : t.text4,
        anchor: "end",
        mono: true,
      })
    );
    g.push(
      capsLabel(t, {
        x: cx + CARD_W - 18,
        y: cy + 44,
        content: "ком / 30 дн",
        size: 8.5,
        anchor: "end",
        fill: t.text4,
      })
    );

    // Description, two lines maximum. Several repositories carry no GitHub
    // description; falling back to the newest commit subject fills the card
    // with something truer to the panel's purpose than a dash floating in an
    // empty box (PLAYBOOK §3.3 — no lone element in an over-wide container).
    const described = Boolean(repo.description);
    const desc = described
      ? redactMeta(repo.description)
      : redactSubject(repo.lastCommit.subject).text;
    wrap(desc, CARD_W - 48, 12.5, 2).forEach((line, li) => {
      g.push(
        text(t, {
          x: cx + 30,
          y: cy + 58 + li * 17,
          content: line,
          size: 12.5,
          fill: described ? t.text3 : t.text4,
        })
      );
    });

    // Meta row: language left, freshness right. Sits clear of the chart band
    // below it — at cy+100 the descenders collided with the chart's top edge.
    const metaY = cy + 94;
    if (repo.language) {
      g.push(
        `<circle cx="${cx + 34}" cy="${metaY - 4}" r="4.5" fill="${langColor(repo.language)}"/>`
      );
      g.push(
        text(t, { x: cx + 45, y: metaY, content: repo.language, size: 11.5, fill: t.text3 })
      );
    }
    g.push(
      text(t, {
        x: cx + CARD_W - 18,
        y: metaY,
        content: relTime(repo.lastCommit.date, NOW),
        size: 11,
        fill: t.text4,
        anchor: "end",
        mono: true,
      })
    );

    // Weekly area chart along the card's foot. It is inset from the card edges
    // rather than run full-bleed: a full-bleed area path collides with the
    // rounded corners and reads as a smudge, which was clearly visible on the
    // light theme where the fill has less contrast to hide behind.
    // Weekly volume as micro-bars rather than an area line.
    //
    // A line chart draws a mark at every week including the empty ones, so a
    // repository whose activity began three weeks ago rendered as a solid gold
    // rule running the width of the card — it read as a decorative divider, not
    // as data. Bars let zero be drawn as nothing, so the shape of the series is
    // legible at a glance and echoes the pulse panel's language.
    const PAD = 18;
    const chartH = 24;
    const chartW = CARD_W - PAD * 2;
    const chartX = cx + PAD;
    const baseY = cy + CARD_H - 12;
    const BAR_GAP = 3;
    const barW = (chartW - BAR_GAP * (repo.weekly.length - 1)) / repo.weekly.length;

    g.push(
      `<path d="M${chartX} ${baseY + 1.5} H${chartX + chartW}" stroke="${alpha(t.line, t.lineSoftOpacity * 1.6)}" stroke-width="1"/>`
    );

    const bars = repo.weekly
      .map((v, wi) => {
        const bx = chartX + wi * (barW + BAR_GAP);
        if (v === 0) {
          // A 2px stub keeps the time axis readable without implying volume.
          return `<rect x="${bx.toFixed(1)}" y="${(baseY - 2).toFixed(1)}" width="${barW.toFixed(1)}" ` +
            `height="2" rx="1" fill="${alpha(t.line, t.lineOpacity)}"/>`;
        }
        const bh = Math.max(3, (v / peak) * chartH);
        return `<rect x="${bx.toFixed(1)}" y="${(baseY - bh).toFixed(1)}" width="${barW.toFixed(1)}" ` +
          `height="${bh.toFixed(1)}" rx="1.5" fill="${t.accent}" opacity="0.8"/>`;
      })
      .join("");

    // `.bar` scales from the baseline, so the group grows upward out of the
    // axis; `.fill` would stretch it sideways.
    g.push(`<g class="bar" style="animation-delay:${(i * 60 + 180) / 1000}s">${bars}</g>`);

    body.push(animGroup("rise", i * 55, g.join("")));
  });

  return document_(t, H, defs.join(""), body.join(""));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 — ACTIVITY FEED
// The panel that makes the page read as alive. Every subject passes through
// redaction before it reaches this public asset.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build the feed with a per-repository cap.
 *
 * A straight newest-first sort is dominated by whichever repository had the
 * last burst — the first render showed twelve consecutive proxy-hub rows, which
 * tells a visitor the organisation has one active project. Capping each
 * repository's share keeps strict chronological order while guaranteeing the
 * feed shows breadth. Slots left over after the cap are refilled from the
 * remaining commits, so the panel is never short of rows.
 */
function buildFeed(limit, perRepo = 3) {
  const all = data.repos
    .flatMap((repo) => repo.recent.map((c) => ({ repo: repo.name, ...c })))
    .filter((c) => c.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const counts = new Map();
  const picked = [];
  const overflow = [];

  for (const entry of all) {
    const n = counts.get(entry.repo) || 0;
    if (n < perRepo) {
      counts.set(entry.repo, n + 1);
      picked.push(entry);
    } else {
      overflow.push(entry);
    }
    if (picked.length >= limit) break;
  }

  const filled = picked.concat(overflow.slice(0, Math.max(0, limit - picked.length)));
  return filled.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
}

function renderActivity(t) {
  resetIds();
  const ROWS = 12;
  const ROW_H = 29;
  const feed = buildFeed(ROWS);

  const HEAD_Y = INSET + 18;
  const LIST_Y = HEAD_Y + 40;
  const H = LIST_Y + feed.length * ROW_H + INSET - 8;

  const shell = panel(t, H);
  const defs = [shell.defs];
  const body = [shell.body];

  body.push(
    sectionHead(t, { x: INSET, y: HEAD_Y, title: "последние коммиты", note: "все репозитории" })
  );

  // Wide enough for the longest repository name in the org; truncating the
  // identifier costs more meaning than truncating a few words of subject.
  const REPO_W = 178;
  const TIME_W = 104;
  const SUBJ_X = INSET + 14 + REPO_W;
  const SUBJ_MAX = CONTENT_W - 14 - REPO_W - TIME_W - 16;

  feed.forEach((entry, i) => {
    const y = LIST_Y + i * ROW_H;
    const fresh = i < 3;
    const { text: subject } = redactSubject(entry.subject);

    const row = [
      // The Signal Tick again — gold on the three newest, muted below, so
      // recency is legible before any text is read.
      tick(t, INSET, y - 10, 13, fresh ? t.accent : alpha(t.line, 0.22)),
      text(t, {
        x: INSET + 14,
        y,
        content: truncate(entry.repo, REPO_W - 12, 11.5, 500, true),
        size: 11.5,
        weight: 500,
        fill: fresh ? t.accent : t.text3,
        mono: true,
      }),
      text(t, {
        x: SUBJ_X,
        y,
        content: truncate(subject, SUBJ_MAX, 12.5, 400),
        size: 12.5,
        fill: fresh ? t.text : t.text2,
      }),
      text(t, {
        x: PANEL_W - INSET,
        y,
        content: relTime(entry.date, NOW),
        size: 10.5,
        fill: t.text4,
        anchor: "end",
        mono: true,
      }),
    ];

    body.push(animGroup("slide", i * 22, row.join("")));
  });

  return document_(t, H, defs.join(""), body.join(""));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 — PULSE
// Weekly commit volume across the whole organisation. Bars are graphite; only
// the busiest week takes the gold, which keeps the accent inside its budget
// while making the peak instantly findable.
// ─────────────────────────────────────────────────────────────────────────────
function renderPulse(t) {
  resetIds();
  const weeks = data.weeks;
  const HEAD_Y = INSET + 18;
  const CHART_Y = HEAD_Y + 40;
  const CHART_H = 118;
  const BASE_Y = CHART_Y + CHART_H;
  const H = BASE_Y + 42 + INSET - 12;

  const shell = panel(t, H);
  const defs = [shell.defs];
  const body = [shell.body];

  const total = weeks.reduce((n, w) => n + w.count, 0);
  body.push(
    sectionHead(t, {
      x: INSET,
      y: HEAD_Y,
      title: "пульс организации",
      note: `${data.windowWeeks} недель · ${num(total)} ${plural(total, "commit")}`,
    })
  );

  const peak = Math.max(1, ...weeks.map((w) => w.count));
  const peakIndex = weeks.findIndex((w) => w.count === peak);
  const GAP = 10;
  const BAR_W = (CONTENT_W - GAP * (weeks.length - 1)) / weeks.length;

  // Baseline, plus two quiet reference rules so bar heights are readable as
  // quantities rather than decoration.
  [0.5, 1].forEach((f) => {
    const y = BASE_Y - f * (CHART_H - 10);
    body.push(
      `<path d="M${INSET} ${y.toFixed(1)} H${INSET + CONTENT_W}" stroke="${alpha(t.grid, t.gridOpacity)}" ` +
        `stroke-width="1" stroke-dasharray="2 4"/>`
    );
  });
  body.push(
    `<path d="M${INSET} ${BASE_Y} H${INSET + CONTENT_W}" stroke="${alpha(t.line, t.lineOpacity)}" stroke-width="1"/>`
  );
  body.push(
    capsLabel(t, { x: INSET, y: BASE_Y - CHART_H + 4, content: `${peak}`, size: 9, fill: t.text4 })
  );

  weeks.forEach((week, i) => {
    const x = INSET + i * (BAR_W + GAP);
    // Empty weeks get a visible stub rather than a hairline. This organisation
    // is young enough that most of the window is empty, and near-invisible
    // stubs made the chart look half-rendered instead of showing honestly when
    // the activity began.
    const empty = week.count === 0;
    const h = empty ? 4 : Math.max(4, (week.count / peak) * (CHART_H - 10));
    const y = BASE_Y - h;
    const isPeak = i === peakIndex;

    const gradId = nextId("barfill");
    defs.push(
      `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="${isPeak ? t.accent : t.surface3}"/>
         <stop offset="100%" stop-color="${isPeak ? t.accentDim : t.surface2}"/>
       </linearGradient>`
    );

    body.push(
      `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${BAR_W.toFixed(1)}" ` +
        `height="${h.toFixed(1)}" rx="${empty ? 2 : 4}" fill="url(#${gradId})" ` +
        `opacity="${empty ? 0.55 : 1}" style="animation-delay:${(i * 38) / 1000}s"/>`
    );
    // Top light-lift on each bar, matching the card depth recipe.
    if (h > 6) {
      body.push(
        `<path d="M${(x + 4).toFixed(1)} ${(y + 1).toFixed(1)} H${(x + BAR_W - 4).toFixed(1)}" ` +
          `stroke="${alpha(t.line, t.liftOpacity * 2.2)}" stroke-width="1"/>`
      );
    }

    // Value above the peak only — labelling every bar would clutter.
    if (isPeak) {
      body.push(
        text(t, {
          x: x + BAR_W / 2,
          y: y - 8,
          content: num(week.count),
          size: 12,
          weight: 700,
          fill: t.accent,
          anchor: "middle",
          mono: true,
          cls: "rise",
        })
      );
    }

    // Date labels on alternating weeks, so they never collide.
    if (i % 2 === 0 || i === weeks.length - 1) {
      const d = new Date(week.start);
      const label = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      body.push(
        text(t, {
          x: x + BAR_W / 2,
          y: BASE_Y + 18,
          content: label,
          size: 9.5,
          fill: t.text4,
          anchor: "middle",
          mono: true,
        })
      );
    }
  });

  return document_(t, H, defs.join(""), body.join(""));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 — LANGUAGES
// One stacked bar plus a legend, aggregated across every repository.
// ─────────────────────────────────────────────────────────────────────────────
function renderLanguages(t) {
  resetIds();
  // Anything under 1.2% becomes an unreadable sliver; fold the tail together
  // rather than rendering segments too thin to see or label.
  const MIN_PCT = 1.2;
  const shown = data.languages.filter((l) => l.pct >= MIN_PCT).slice(0, 8);
  const restPct = 100 - shown.reduce((n, l) => n + l.pct, 0);
  const segments = restPct > 0.3 ? [...shown, { name: "прочее", pct: restPct, rest: true }] : shown;

  const HEAD_Y = INSET + 18;
  const BAR_Y = HEAD_Y + 40;
  const BAR_H = 16;
  const LEGEND_Y = BAR_Y + BAR_H + 34;
  const LEG_COLS = 4;
  // Each legend entry is two lines (name over percentage), so the row pitch
  // must clear both — at 26px the second row collided with the first.
  const LEG_ROW_H = 36;
  const legendRows = Math.ceil(segments.length / LEG_COLS);
  const H = LEGEND_Y + (legendRows - 1) * LEG_ROW_H + INSET + 6;

  const shell = panel(t, H);
  const defs = [shell.defs];
  const body = [shell.body];

  body.push(
    sectionHead(t, {
      x: INSET,
      y: HEAD_Y,
      title: "языки",
      note: `по объёму кода · ${data.totals.repos} ${plural(data.totals.repos, "repo")}`,
    })
  );

  // The bar is drawn inside a rounded clip so the ends are capped without each
  // segment needing its own corner geometry.
  const barClip = nextId("barclip");
  defs.push(
    `<clipPath id="${barClip}"><rect x="${INSET}" y="${BAR_Y}" width="${CONTENT_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath>`
  );

  const segs = [];
  let cursor = INSET;
  segments.forEach((seg) => {
    const w = (seg.pct / 100) * CONTENT_W;
    const color = seg.rest ? t.text4 : langColor(seg.name);
    segs.push(
      `<rect x="${cursor.toFixed(2)}" y="${BAR_Y}" width="${w.toFixed(2)}" height="${BAR_H}" fill="${color}"/>`
    );
    // A hairline of background between segments reads as separation without
    // breaking the single-bar silhouette.
    segs.push(
      `<rect x="${(cursor + w - 0.75).toFixed(2)}" y="${BAR_Y}" width="1.5" height="${BAR_H}" fill="${t.bg}" opacity=".85"/>`
    );
    cursor += w;
  });

  body.push(
    `<g clip-path="url(#${barClip})"><g class="fill">${segs.join("")}</g></g>` +
      `<rect x="${INSET + 0.5}" y="${BAR_Y + 0.5}" width="${CONTENT_W - 1}" height="${BAR_H - 1}" ` +
      `rx="${BAR_H / 2 - 0.5}" fill="none" stroke="${alpha(t.line, t.lineOpacity)}"/>`
  );

  // Legend columns are sized to content rather than an equal share, so short
  // names do not orphan a wide empty band beside them (PLAYBOOK §3.3).
  const colW = CONTENT_W / LEG_COLS;
  segments.forEach((seg, i) => {
    const col = i % LEG_COLS;
    const row = Math.floor(i / LEG_COLS);
    const x = INSET + col * colW;
    const y = LEGEND_Y + row * LEG_ROW_H;
    const color = seg.rest ? t.text4 : langColor(seg.name);

    body.push(
      animGroup("rise", i * 40 + 200,
        `<rect x="${x}" y="${y - 9}" width="3" height="12" rx="1.5" fill="${color}"/>` +
        text(t, { x: x + 12, y, content: seg.name, size: 12.5, fill: t.text2, weight: 500 }) +
        text(t, {
          x: x + 12,
          y: y + 15,
          content: `${seg.pct.toFixed(1)}%`,
          size: 11,
          fill: t.text4,
          mono: true,
        })
      )
    );
  });

  return document_(t, H, defs.join(""), body.join(""));
}

// ─────────────────────────────────────────────────────────────────────────────

const PANELS = {
  banner: renderBanner,
  repos: renderRepos,
  activity: renderActivity,
  pulse: renderPulse,
  languages: renderLanguages,
};

mkdirSync(ASSETS, { recursive: true });

const rendered = [];
for (const [name, render] of Object.entries(PANELS)) {
  for (const theme of THEMES) {
    const svg = render(theme);
    const file = join(ASSETS, `${name}-${theme.name}.svg`);
    writeFileSync(file, `${svg}\n`);
    rendered.push(svg);
    console.log(`  ${name}-${theme.name}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
  }
}

// Cache-bust the README's image URLs.
//
// GitHub proxies every README image through camo, which caches on the URL. With
// a fixed URL a refreshed panel can keep serving the previous render for hours.
// The stamp is a hash of the rendered SVGs, so it changes exactly when the
// artwork changes — a timestamp would rewrite the README on every scheduled run
// and fill the history with no-op commits.
const stamp = createHash("sha256").update(rendered.join("")).digest("hex").slice(0, 8);
const readmePath = join(here, "..", "profile", "README.md");
try {
  const readme = readFileSync(readmePath, "utf8");
  const stamped = readme.replace(/(\.svg)\?v=[0-9a-f]+/g, `$1?v=${stamp}`);
  if (stamped !== readme) {
    writeFileSync(readmePath, stamped);
    console.log(`\nstamped README image URLs with ?v=${stamp}`);
  }
} catch {
  console.warn("\nprofile/README.md not found — skipped cache-bust stamping");
}

console.log(`\nrendered ${Object.keys(PANELS).length * THEMES.length} assets into profile/assets/`);
