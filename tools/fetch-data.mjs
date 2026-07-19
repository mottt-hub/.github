// Collect organisation activity from the GitHub API into tools/data.json.
//
// Split from rendering on purpose: the API is the slow, rate-limited, flaky
// half, and design iteration needs to re-render dozens of times without
// re-fetching. CI runs fetch then render; a human tuning the layout runs render
// alone against the cached data.
//
// Auth: GITHUB_TOKEN in the environment. Every repository here is private, so
// an unauthenticated run returns an empty organisation rather than an error —
// which is exactly the silent-zeroes failure this whole generator exists to
// avoid. The run therefore fails loudly if the token is missing or blind.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ORG = process.env.ORG_NAME || "mottt-hub";
const TOKEN = process.env.GITHUB_TOKEN;
const API = "https://api.github.com";

// The profile repository itself is public scaffolding, not a project, and its
// commits are this generator's own bot commits. Including it would fill the
// activity feed with "chore(stats): refresh".
const EXCLUDE = new Set([".github"]);

const WEEKS = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const here = dirname(fileURLToPath(import.meta.url));

if (!TOKEN) {
  console.error(
    "GITHUB_TOKEN is not set. Private repositories are invisible without it and\n" +
      "the generator would publish a page of zeroes. Locally: export GITHUB_TOKEN=$(gh auth token)"
  );
  process.exit(1);
}

/**
 * GET a JSON endpoint with bounded retries.
 * The API has been observed to fail with TLS handshake and i/o timeouts from
 * this network, so a single transport error must not abort a 40-request run.
 * Rate-limit responses are honoured via the reset header rather than retried
 * blindly.
 */
async function api(path, { retries = 4, allow404 = false } = {}) {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": `${ORG}-profile-generator`,
        },
        signal: AbortSignal.timeout(30000),
      });

      // An empty repository answers 409; a missing one answers 404. Both are
      // expected states for some repos, not failures of the run.
      if (res.status === 409 || (allow404 && res.status === 404)) return null;

      if (res.status === 403 || res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset") || 0) * 1000;
        const waitMs = Math.max(1000, Math.min(60000, reset - Date.now()));
        if (attempt < retries) {
          console.warn(`  rate limited, waiting ${Math.round(waitMs / 1000)}s`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      const backoff = 800 * 2 ** attempt;
      console.warn(`  ${err.message} — retry ${attempt + 1}/${retries} in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastError;
}

/** Follow pages until exhausted or `maxPages` reached. */
async function apiPaged(path, maxPages = 3) {
  const out = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const sep = path.includes("?") ? "&" : "?";
    const batch = await api(`${path}${sep}per_page=100&page=${page}`, { allow404: true });
    if (!batch || !batch.length) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function main() {
  const now = Date.now();
  const since = new Date(now - WEEKS * WEEK_MS).toISOString();

  console.log(`fetching ${ORG} (window: ${WEEKS} weeks)`);

  const allRepos = await apiPaged(`/orgs/${ORG}/repos?sort=pushed&direction=desc`);
  const repos = allRepos.filter((r) => !EXCLUDE.has(r.name) && !r.archived && !r.fork);
  console.log(`  ${repos.length} repositories`);

  // A token that cannot see private repositories yields a plausible-looking but
  // empty result. Detect that here rather than rendering a page of zeroes.
  const privateCount = repos.filter((r) => r.private).length;
  if (repos.length && privateCount === 0) {
    console.error(
      "Token sees no private repositories. It is missing repo scope or org\n" +
        "authorisation — see README-STATS.md. Refusing to publish empty stats."
    );
    process.exit(1);
  }

  const results = [];
  for (const repo of repos) {
    const [commits, languages] = await Promise.all([
      apiPaged(`/repos/${ORG}/${repo.name}/commits?since=${since}`),
      api(`/repos/${ORG}/${repo.name}/languages`, { allow404: true }),
    ]);

    // Bucket commit dates into the 12 trailing weeks, index 0 = oldest.
    const weekly = new Array(WEEKS).fill(0);
    let commits30 = 0;
    for (const commit of commits) {
      const date = new Date(commit.commit.author?.date || commit.commit.committer?.date).getTime();
      const age = now - date;
      if (age < 0) continue;
      const index = WEEKS - 1 - Math.floor(age / WEEK_MS);
      if (index >= 0 && index < WEEKS) weekly[index] += 1;
      if (age <= 30 * DAY_MS) commits30 += 1;
    }

    const head = commits[0];
    results.push({
      name: repo.name,
      description: repo.description || "",
      language: repo.language || null,
      private: repo.private,
      pushedAt: repo.pushed_at,
      lastCommit: head
        ? {
            subject: head.commit.message.split("\n")[0],
            date: head.commit.author?.date || head.commit.committer?.date,
          }
        : null,
      commits30,
      commits12w: commits.reduce((n) => n + 1, 0),
      weekly,
      languages: languages || {},
      recent: commits.slice(0, 40).map((c) => ({
        subject: c.commit.message.split("\n")[0],
        date: c.commit.author?.date || c.commit.committer?.date,
      })),
    });

    console.log(
      `  ${repo.name.padEnd(24)} ${String(commits.length).padStart(3)} commits / ${WEEKS}w`
    );
  }

  // Cross-repo activity feed, newest first.
  const activity = results
    .flatMap((repo) => repo.recent.map((c) => ({ repo: repo.name, ...c })))
    .filter((c) => c.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 24);

  // Org-wide weekly totals.
  const weeks = new Array(WEEKS).fill(0).map((_, i) => ({
    start: new Date(now - (WEEKS - 1 - i) * WEEK_MS).toISOString(),
    count: results.reduce((sum, r) => sum + r.weekly[i], 0),
  }));

  // Aggregate language bytes across the whole organisation.
  const langBytes = {};
  for (const repo of results) {
    for (const [name, bytes] of Object.entries(repo.languages)) {
      langBytes[name] = (langBytes[name] || 0) + bytes;
    }
  }
  const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(langBytes)
    .map(([name, bytes]) => ({ name, bytes, pct: (bytes / totalBytes) * 100 }))
    .sort((a, b) => b.bytes - a.bytes);

  const data = {
    generatedAt: new Date(now).toISOString(),
    org: ORG,
    windowWeeks: WEEKS,
    totals: {
      repos: results.length,
      commits30: results.reduce((n, r) => n + r.commits30, 0),
      commits12w: results.reduce((n, r) => n + r.commits12w, 0),
      lastPush: results.reduce(
        (latest, r) => (!latest || r.pushedAt > latest ? r.pushedAt : latest),
        null
      ),
      languages: languages.length,
    },
    repos: results,
    activity,
    weeks,
    languages,
  };

  const out = join(here, "data.json");
  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `\nwrote ${out}\n  ${data.totals.commits12w} commits / ${WEEKS}w across ${data.totals.repos} repos`
  );
}

main().catch((err) => {
  console.error(`fetch failed: ${err.message}`);
  process.exit(1);
});
