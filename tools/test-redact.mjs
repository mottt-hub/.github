// Redaction test suite. Run: node tools/test-redact.mjs
//
// The generated SVGs are PUBLIC while every source repository is PRIVATE, so a
// regression here is a data leak, not a cosmetic bug. LEAKS must all redact;
// CLEAN must all survive untouched. CI runs this before rendering.

import { redactSubject } from "./lib/redact.mjs";

// Real subjects from the org's private history. These must pass through intact
// — over-redaction makes the activity feed unreadable and the page worthless.
const CLEAN = [
  "fix(bot): accumulate multi-message account paste + live task-status banner",
  "feat(dashboard): re-theme to Velours Noir (owner-picked from 3 rendered mockups)",
  "Sync pyproject.toml version/description with kh.__version__ (2.1.0)",
  "fix(site): res.on(close)+writableEnded guard — req.on(close) was killing the engine child (code=null)",
  "feat(freeproxy): filtering-reframe tuning — soft-retire dead conventions, 2026 aggregators",
  "fix(design): center rail icons + active pill in the collapsed rail",
  "refactor: extract the scheduler into its own module",
  "docs: update README with setup steps",
  "chore(deps): bump requests to 2.32.3",
  "perf: cache language stats for 6 hours",
];

// Each of these hides something that must never reach a public SVG.
const LEAKS = [
  "hotfix: rotate key on 213.176.73.54 before deploy",
  "deploy to gallery.morbit.work via tunnel",
  "set ADMIN_PASSWORD=hunter2 in prod",
  "add token ghp_AbCdEf0123456789AbCdEf0123456789AbCd",
  "ssh root@31.169.125.171 fix crowdsec",
  "update /etc/nginx/sites-enabled/default",
  "expose :8902 for the gallery",
  "пароль администратора изменён на Qwerty123",
  "fix db dsn postgres://user:pw@db.internal:5432/app",
  "чинил ноду FR-1 62T16M38bUA3",
  "add AWS key AKIAIOSFODNN7EXAMPLE to the worker",
  "webhook https://hooks.example.com/services/T00/B11/xyz",
  "bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "connect to 10.0.0.7:5432 from the bastion",
  "-----BEGIN RSA PRIVATE KEY----- committed by mistake",
];

let failures = 0;

for (const subject of CLEAN) {
  const { text, redacted } = redactSubject(subject);
  if (redacted) {
    console.error(`FAIL over-redacted:\n  in:  ${subject}\n  out: ${text}`);
    failures += 1;
  }
}

for (const subject of LEAKS) {
  const { text, redacted } = redactSubject(subject);
  if (!redacted) {
    console.error(`FAIL leak survived:\n  in:  ${subject}\n  out: ${text}`);
    failures += 1;
  }
}

// The secret itself must be gone from the output, not merely flagged.
const SECRETS = [
  ["hotfix: rotate key on 213.176.73.54 before deploy", "213.176.73.54"],
  ["deploy to gallery.morbit.work via tunnel", "morbit.work"],
  ["set ADMIN_PASSWORD=hunter2 in prod", "hunter2"],
  ["пароль администратора изменён на Qwerty123", "Qwerty123"],
  ["чинил ноду FR-1 62T16M38bUA3", "62T16M38bUA3"],
  ["add token ghp_AbCdEf0123456789AbCdEf0123456789AbCd", "ghp_"],
];

for (const [subject, secret] of SECRETS) {
  const { text } = redactSubject(subject);
  if (text.includes(secret)) {
    console.error(`FAIL secret present in output:\n  secret: ${secret}\n  out: ${text}`);
    failures += 1;
  }
}

const total = CLEAN.length + LEAKS.length + SECRETS.length;
if (failures) {
  console.error(`\n${failures}/${total} checks FAILED`);
  process.exit(1);
}
console.log(`redaction: ${total}/${total} checks passed`);
