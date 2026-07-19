// Redaction for text that crosses from PRIVATE repositories into a PUBLIC SVG.
//
// Every repository in this organisation is private, but the rendered assets and
// this repository are public. Commit subjects are the only free-form private
// text that reaches the page, so they are the entire attack surface: a subject
// like "fix: rotate key on 10.0.0.7 before deploy" would publish infrastructure
// the org otherwise keeps closed.
//
// The policy is deny-by-default at the token level. A subject is split into
// tokens; a token is published only if it looks like ordinary prose or ordinary
// code vocabulary. Anything address-shaped, credential-shaped, path-shaped or
// simply unrecognisable becomes "•••". This deliberately over-redacts — losing
// a word costs nothing, leaking a hostname is unrecoverable once GitHub's camo
// cache and every scraper has a copy.

// `joined: true` marks a rule that is re-run over the reassembled subject, to
// catch a value that the whitespace split hid (e.g. "10.0.0. 7", "KEY = v").
// Rules with `joined: false` are token-local: re-running them across token
// boundaries produces false positives that would shred ordinary prose.
const DENY = [
  { name: "ipv4", re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/, joined: true },
  { name: "ipv6", re: /\b(?:[0-9a-f]{0,4}:){3,}[0-9a-f]{0,4}\b/i, joined: true },
  { name: "url", re: /\b(?:https?|ftp|ssh|git):\/\//i, joined: true },
  { name: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, joined: true },
  // Hostnames: a dotted name whose FINAL label is a real TLD. Matching on the
  // TLD rather than on "is dotted" is what keeps code vocabulary readable —
  // `res.on(close)` and `pyproject.toml` survive, `morbit.work` does not.
  { name: "host", re: /\b(?:[a-z0-9-]+\.)+(?:TLD_LIST)\b/i, joined: false },
  // Absolute or home-relative filesystem paths.
  { name: "path", re: /(?:^|[\s"'(])(?:~|\.{0,2})\/[\w.\-/]{2,}/, joined: false },
  { name: "winpath", re: /\b[a-z]:\\/i, joined: false },
  // host:port / :port
  { name: "port", re: /:\d{2,5}\b/, joined: false },
  // KEY=value or KEY: value where KEY is SCREAMING_SNAKE — env/secret shaped.
  { name: "envassign", re: /\b[A-Z][A-Z0-9_]{2,}\s*[=:]\s*\S/, joined: true },
  // Long opaque strings: hex digests, base64 blobs, key material.
  { name: "hexblob", re: /\b[0-9a-f]{16,}\b/i, joined: true },
  { name: "b64blob", re: /\b[A-Za-z0-9+/]{24,}={0,2}\b/, joined: true },
  // Known credential prefixes.
  { name: "keyprefix", re: /\b(?:gh[pousr]_|sk-|xox[abprs]-|AKIA|ASIA|eyJ[A-Za-z0-9_-]{6,})/, joined: true },
  // Private key / cert markers.
  { name: "pem", re: /BEGIN\s+(?:RSA|EC|OPENSSH|PGP|PRIVATE)/i, joined: true },
];

// TLDs that mark a dotted token as an address rather than an identifier.
// Includes the generic set, the ccTLDs this org actually operates in, and the
// "new gTLD" families most used for infrastructure. A hostname on a TLD outside
// this list still trips the two-dot rule or the port rule in practice.
const TLD_LIST = [
  "com", "net", "org", "info", "biz", "pro", "name", "int", "edu", "gov", "mil",
  "io", "co", "ai", "dev", "app", "sh", "gg", "tv", "cc", "me", "xyz", "top",
  "site", "online", "store", "shop", "tech", "space", "website", "host", "press",
  "cloud", "digital", "network", "systems", "services", "solutions", "agency",
  "studio", "design", "media", "team", "group", "zone", "club", "fun", "vip",
  "live", "life", "world", "work", "run", "build", "link", "click", "email",
  "ru", "su", "ua", "by", "kz", "uk", "de", "fr", "nl", "fi", "se", "no", "dk",
  "pl", "cz", "it", "es", "pt", "ch", "at", "be", "ie", "us", "ca", "au", "nz",
  "jp", "cn", "kr", "in", "br", "tr", "il", "hk", "sg", "eu", "lv", "lt", "ee",
];

// Materialise the TLD list into the host rule.
for (const rule of DENY) {
  if (rule.re.source.includes("TLD_LIST")) {
    rule.re = new RegExp(rule.re.source.replace("TLD_LIST", TLD_LIST.join("|")), rule.re.flags);
  }
}

/**
 * Sensitive vocabulary. These words are safe in isolation ("fix auth bug") but
 * the token FOLLOWING them is very often the value itself, so the neighbour is
 * dropped as well.
 */
const SENSITIVE_LEAD = new Set([
  "password", "passwd", "pwd", "пароль", "secret", "секрет", "token", "токен",
  "apikey", "api_key", "key", "ключ", "credential", "creds", "auth_token",
  "bearer", "cookie", "session", "private_key", "privkey", "seed", "mnemonic",
  "ssh", "sshkey", "webhook", "dsn", "conn", "connstring", "hostname", "host",
  "ip", "addr", "address", "адрес", "домен", "domain", "server", "сервер",
  "vps", "node", "нода", "порт", "port", "endpoint", "tunnel", "туннель",
]);

/** A token of pure punctuation/symbols carries no information worth risking. */
const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u;

/**
 * Russian stems for the sensitive vocabulary. Russian inflects, so "ноду",
 * "ноды", "нодой" must all match the "нод" lead; a flat word list misses them.
 */
const SENSITIVE_STEMS_RU = [
  "парол", "секрет", "ключ", "токен", "адрес", "домен", "сервер", "нод",
  "порт", "туннел", "доступ", "учётк", "учетк", "логин", "хост",
];

/**
 * Count transitions between character classes (lower / upper / digit).
 * Key material and generated passwords alternate classes far more than
 * ordinary identifiers like "sha256sum" or "x86_64" do.
 */
function classTransitions(token) {
  const classOf = (ch) => {
    if (ch >= "0" && ch <= "9") return "d";
    if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) return "l";
    if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) return "u";
    return null;
  };
  let transitions = 0;
  let prev = null;
  for (const ch of token) {
    const cls = classOf(ch);
    if (cls === null) continue;
    if (prev !== null && cls !== prev) transitions += 1;
    prev = cls;
  }
  return transitions;
}

/**
 * True for a token that looks like generated key material rather than a word:
 * long, mixing letters and digits, and switching character class repeatedly.
 * Catches values such as "62T16M38bUA3" that no deny pattern names explicitly.
 */
function looksLikeSecret(token) {
  if (token.length < 8) return false;
  if (!/\d/.test(token) || !/\p{L}/u.test(token)) return false;
  return classTransitions(token) >= 3;
}

/** True when the token could plausibly BE a value rather than prose. */
function isValueShaped(token) {
  const bare = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!bare) return false;
  if (/\p{L}/u.test(bare) && /\d/.test(bare)) return true;
  return bare.length >= 12 && !/^[\p{L}]+$/u.test(bare);
}

/** True when any sensitive lead word or Russian stem appears in the subject. */
function hasSensitiveContext(tokens) {
  return tokens.some((token) => {
    const word = normalise(token);
    if (SENSITIVE_LEAD.has(word)) return true;
    return SENSITIVE_STEMS_RU.some((stem) => word.startsWith(stem));
  });
}

/**
 * Tokens allowed through: latin/cyrillic words, plain numbers, and the
 * conventional-commit / code punctuation that makes subjects readable
 * (parentheses, colons, hyphens, underscores, dots inside short identifiers).
 */
// The token must carry at least one letter or digit and contain no control or
// non-printable characters. The real filtering is done by the DENY rules plus
// the length / dot / slash / secret-shape checks; keeping this permissive is
// what preserves ordinary code vocabulary like `res.on(close)` or `(code=null)`.
const ALLOWED_TOKEN = /^(?=.*[\p{L}\p{N}])[^\p{C}]+$/u;

/** Dotted-numeric version strings ("2.1.0", "v7.18.0") are not addresses. */
const VERSION_TOKEN = /^[(\[]?v?\d+(?:\.\d+){1,3}[)\]]?[,.;:]?$/i;

const REDACTION = "•••";
const MAX_TOKEN_LEN = 32;
const MAX_DOTS = 1;

/** A global-flagged clone, so `.replace` hits every occurrence. */
function globalise(re) {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

/** True when the token trips any deny pattern. */
function isDenied(token) {
  return DENY.some(({ re }) => re.test(token));
}

/** Normalise a token for vocabulary lookup. */
function normalise(token) {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Redact a single commit subject.
 * Returns { text, redacted } where `redacted` reports whether anything was cut,
 * so callers can surface the fact rather than silently publishing a mangled line.
 */
export function redactSubject(subject) {
  const source = String(subject || "").split("\n")[0].trim();
  if (!source) return { text: "", redacted: false };

  const tokens = source.split(/\s+/);
  const out = [];
  let redacted = false;
  let dropNext = false;

  // When the subject mentions credentials or infrastructure at all, every
  // value-shaped token in it becomes suspect — not just the adjacent one. A
  // password can sit several words after the word "пароль".
  const sensitiveContext = hasSensitiveContext(tokens);

  for (const token of tokens) {
    const word = normalise(token);
    const isLead =
      SENSITIVE_LEAD.has(word) || SENSITIVE_STEMS_RU.some((stem) => word.startsWith(stem));

    if (dropNext) {
      dropNext = false;
      // Only sacrifice the neighbour if it could plausibly BE a value; a
      // following ordinary word ("token refresh logic") stays readable.
      if (!/^[\p{L}]{2,}$/u.test(word) || word.length > 16) {
        out.push(REDACTION);
        redacted = true;
        continue;
      }
    }

    if (isLead) {
      out.push(token);
      dropNext = true;
      continue;
    }

    if (looksLikeSecret(token) || (sensitiveContext && isValueShaped(token))) {
      out.push(REDACTION);
      redacted = true;
      continue;
    }

    // A plain version number is dotted but harmless — clear it before the
    // structural checks so "(2.1.0)" is not mistaken for an address.
    if (VERSION_TOKEN.test(token)) {
      out.push(token);
      continue;
    }

    const tooLong = token.length > MAX_TOKEN_LEN;
    const tooDotted = (token.match(/\./g) || []).length > MAX_DOTS;
    // One slash reads as prose ("version/description"); two or more reads as a
    // filesystem path, which is infrastructure detail.
    const tooManySlashes = (token.match(/\//g) || []).length > 1;
    const unrecognised = !ALLOWED_TOKEN.test(token) && !PUNCT_ONLY.test(token);

    if (isDenied(token) || tooLong || tooDotted || tooManySlashes || unrecognised) {
      out.push(REDACTION);
      redacted = true;
      continue;
    }

    out.push(token);
  }

  // Collapse runs of redactions so a heavily-cut subject reads as one gap.
  const collapsed = [];
  for (const token of out) {
    if (token === REDACTION && collapsed[collapsed.length - 1] === REDACTION) continue;
    collapsed.push(token);
  }

  let text = collapsed.join(" ").trim();

  // A subject that is mostly redaction communicates nothing and looks broken.
  // Replace it with an honest placeholder instead.
  const signal = collapsed.filter((t) => t !== REDACTION).join("");
  if (!signal || signal.length < 4) {
    return { text: "— скрыто —", redacted: true };
  }

  // Second pass over the JOINED string: a deny pattern can span a space that
  // the token split hid (e.g. "10.0.0. 7" or "KEY = value").
  for (const rule of DENY) {
    if (!rule.joined) continue;
    const global = globalise(rule.re);
    if (global.test(text)) {
      text = text.replace(globalise(rule.re), REDACTION);
      redacted = true;
    }
  }

  return { text, redacted };
}

/**
 * Repository names and descriptions come from the org's own metadata and are
 * already published verbatim in the profile README, so they need only the same
 * structural safety net rather than token-level denial.
 */
export function redactMeta(text) {
  if (!text) return "";
  let out = String(text).split("\n")[0].trim();
  for (const rule of DENY) {
    out = out.replace(globalise(rule.re), REDACTION);
  }
  return out;
}
