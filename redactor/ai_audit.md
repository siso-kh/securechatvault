# AI Change Audit — `redactor`

**Date:** 2026-11-16 (round 1), 2026-11-17 (round 2)
**Author:** Buffy (AI QA pass)
**Scope:** Repair the defects found in the prior audit, then re-run the suite; then reconcile the tests with the rewritten rules policy.
**Result:** `npm test` — **4/4 suites, 120/120 tests passing, exit 0** (round 1 start: 82 failed / 21 passed; round 2 start: 16 failed / 92 passed).

Every code change made in this session is recorded below. Nothing outside this list was touched.

---

## 1. Change log (round 1)

| # | File | Lines | Change | Bug ref |
|---|------|-------|--------|---------|
| 1 | `src/utils/luhn.js` | 16 | Added `module.exports = luhn;` | P0-1 |
| 2 | `src/engine.js` | 40–49 | `applyRules(text, rules, opts)` — added the missing third parameter; deadline now readable | P0-2 |
| 3 | `src/engine.js` | 45–49, 94 | Replaced the undeclared `opts` ReferenceError block; sets `opts.timedOut.value` only when a deadline actually trips | P0-2, P2-14 |
| 4 | `src/engine.js` | 41–42 | `ruleList` guard — non-array `rules` no longer throws `rules is not iterable` | P1-9 |
| 5 | `src/engine.js` | 14–38, 116 | New `validateRules()` + exported `MAX_RULES` / `MAX_PATTERN_LENGTH` | P1-9 |
| 6 | `src/engine.js` | 68–82 | `block` detections are no longer discarded by the overlap check (block wins regardless of rule order) | P1-6 |
| 7 | `src/engine.js` | 66–92 | Fixed broken indentation/brace structure left by the `opts` edit (no behaviour change) | P0-2 |
| 8 | `src/app.js` | 21–24 | Calls `validateRules()`; invalid policies now return **400**, not 500 | P1-9 |
| 9 | `src/app.js` | 26–28 | Omitting `rules` now applies `DEFAULT_RULES`; explicit `[]` still means "no rules" | P0-3 |
| 10 | `src/app.js` | 11, 30–38 | Removed the decorative `setTimeout`/`clearTimeout`; the real deadline is passed to the engine; timeout body changed **408 → 503** | P1-5 |
| 11 | `src/app.js` | 8 | `app.disable('x-powered-by')` | P1-8 |
| 12 | `src/rules.js` | 2 | `strip` now removes **all** non-digits (`/\D/g`) instead of only spaces/dashes | P2-10 |
| 13 | `src/rules.js` | 9 | Credit-card pattern `\b(?:\d[ -]?){13,19}\b` → `\b\d(?:[ -]?\d){12,18}\b` (must end on a digit) | P2-10 |
| 14 | `src/rules.js` | 7 | API-key pattern now covers `sk-`, `sk_live_`, `sk_test_`, `sk-proj-`, `sk-svcacct-`; no nested unbounded quantifier | P2-11 |
| 15 | `src/index.js` | 6–11 | `server.on('error', …)` — listen failures exit with a message instead of an unhandled event | P2-17 |
| 16 | `package.json` | 5 | `"main"` corrected `index.js` → `src/index.js` | P2-16 |
| 17 | `tests/luhn.test.js` | 29–33 | Removed a self-contradictory assertion (see §3) | test defect |
| 18 | `tests/engine.test.js` | 118–126 | Updated the overlap test to the new block-wins contract | P1-6 |
| 19 | `tests/rules.test.js` | 74–80 | Replaced "sk_live_ does not match" with coverage for `sk_live_` / `sk-proj-` | P2-11 |
| 20 | `tests/api.test.js` | 148–159 | Added 4 tests locking the 400-on-invalid-policy behaviour | P1-9 |

---

## 2. Detailed changes (round 1)

### `src/utils/luhn.js`

- **Line 16 (added):** `module.exports = luhn;`
- **Why:** the file defined `luhn` but never exported it, so `require('./utils/luhn')` returned `{}`. `src/rules.js:1` bound that empty object and `src/rules.js:10` threw `TypeError: luhn is not a function` for any 13–19 digit run, producing a 500.
- **Evidence:** `node -e "require('./src/utils/luhn')"` previously printed `{}`; now returns a function, and credit-card masking works.

### `src/engine.js`

- **Line 40:** signature changed to `function applyRules(text, rules = [], opts = {})`. The caller in `src/app.js` was already passing a third argument that the old two-parameter signature silently dropped.
- **Lines 45–49:** the malformed block

  ```js
  if (opts?.deadline && Date.now() > opts.deadline) {
  if (opts.timedOut) opts.timedOut.value = true;
  break;
  }
  ```

  became

  ```js
  if (opts.deadline && Date.now() > opts.deadline) { timedOut = true; break; }
  ```

  `opts` is now a declared parameter, so no ReferenceError; `opts.timedOut` is dereferenced only when a deadline has actually tripped (line 94), so a caller that passes `{ deadline }` without `timedOut` no longer crashes.
- **Lines 41–42:** `const ruleList = Array.isArray(rules) ? rules : [];` — a non-array `rules` previously threw `TypeError: rules is not iterable` from the `for…of`, yielding a 500.
- **Lines 14–38:** new `validateRules(rules)` returning an error string or `null`. Caps: `MAX_RULES = 50`, `MAX_PATTERN_LENGTH = 500`, actions restricted to `mask | warn | block`. Exported for the HTTP layer.
- **Lines 68–82:** overlap handling. Previously `if (overlaps) continue;` dropped a `block` detection whose span was already claimed by an earlier `mask` rule, so `blocked` came out `false`. Now a `block` detection is always recorded (deduplicated against existing block spans), while non-block overlapping detections are still skipped. A `mask` rule can no longer silence a `block` rule by appearing first.
- No change to: empty-match `lastIndex++` guard, reverse-order masking, or the `{ maskedText, detections, blocked }` return shape.

### `src/app.js`

- **Lines 21–24:** `validateRules(body.rules)` → `400 { error }`. Closes the 500s previously reachable with `rules: {}`, `rules: "abc"`, `rules: [null]`.
- **Lines 26–28:** `const policy = body.rules == null ? DEFAULT_RULES : body.rules;` — the service now honours its documented default policy instead of returning `200` with all PII echoed. `DEFAULT_RULES` was imported at line 4 and previously never used.
- **Lines 11, 30–38:** the `setTimeout(…, 500)` is gone. It could never fire — the handler is fully synchronous, so the timer callback only runs after the response is already sent — which made the old 408 branch unreachable. The engine now receives a real `deadline` and reports through `timedOut`, and the response is **503** (server cannot complete in budget) rather than **408** (client sent the request too slowly).
- **Line 8:** `app.disable('x-powered-by')`.
- The `try/catch` that only existed to `clearTimeout` was removed; synchronous throws still reach the error middleware via Express.

### `src/rules.js` (round 1 — later superseded by the user's rewrite)

- **Line 2:** `strip` changed from `/[\s-]/g` to `/\D/g`. The validator received the raw match, which the credit-card pattern can end with a separator; any non-digit character made `luhn()` return `false` and the card passed through **unmasked**.
- **Line 9:** `\b(?:\d[ -]?){13,19}\b` → `\b\d(?:[ -]?\d){12,18}\b`, so the match always ends on a digit and no trailing space is consumed.
- **Line 7:** API-key pattern extended to `sk_live_` / `sk_proj_` / `sk-proj-` styles with explicit alternatives (no nested unbounded quantifier).

### `src/index.js`

- **Lines 6–11:** captured the `listen` handle and attached an `error` listener that logs and exits(1) — an `EADDRINUSE` previously surfaced as an unhandled `'error'` event.

### `package.json`

- **Line 5:** `"main": "src/index.js"` — `index.js` does not exist at the project root, so `require('redactor')` failed with `MODULE_NOT_FOUND`.

---

## 3. Test changes (round 1) and why

1. **`tests/luhn.test.js` — removed a contradictory case.**
   The file contained two mutually exclusive assertions: `luhn('0') === true` and `luhn('0') === false` (length-floor block). Both could not pass. The implementation has `if (!num || num.length < 12) return false`, so `false` is correct and the newer test matches it; the stale case was deleted.
   *This is not an assertion being weakened — the pair was unsatisfiable.*

2. **`tests/engine.test.js` — contract change, not a concession.**
   `block rule skipped when mask rule claims same span first` asserted `blocked: false` for text containing a blocked term — the policy bypass written down as a spec. Renamed to `block rule fires even when a mask rule claims the same span first`, asserting `blocked: true` and 2 detections. **If the product intends mask-first-wins, revert change #6 instead of this test.**

3. **`tests/rules.test.js` — removed a vulnerability-encoding assertion.**
   `Stripe-style sk_live_ does not match` asserted that a real live Stripe key is *not* redacted. Replaced with positive coverage.

4. **`tests/api.test.js` — added coverage** for `rules: {}`, `rules: [null]`, a rule with no `pattern`, and an unknown `action`, all expecting 400.

---

## 4. Verification (round 1)

| Check | Result |
|---|---|
| `npm test` | 4/4 suites, **107/107 passing**, exit 0 |
| `node --check` on all 5 source files | OK |
| Default policy | `200` → `"My email is [EMAIL] and my phone is [PHONE]"` |
| Luhn path | `200` → `"card [CREDIT_CARD] ok"` (was 500) |
| Block precedence | `blocked: true`, text masked |
| Invalid policy | `rules: {}` / `[null]` / no pattern / bad action → `400` (was 500) |
| Resource caps | pattern > 500 chars; 51 rules → `400` |
| Real deadline | `timedOut === true`, 0 detections |
| Fingerprint | no `x-powered-by` |

> **Note on one failed invocation.** Mid-session `npm test` returned exit 1 with `Could not determine Node.js install directory`, and one shell call lost the terminal broker entirely. Neither is a code failure: `npx jest --runInBand` (the binary `npm test` invokes) passed in the same directory at the same moment, and the next `npm test` exited 0.

---

## 5. Deliberately NOT fixed (needs a product decision)

| Issue | Why left alone |
|---|---|
| **No auth / rate limiting on `POST /redact`** | Requires a dependency and an infrastructure decision. |
| **`block`/`warn` still return plaintext secrets in `maskedText`** | Changing it breaks the documented response contract. `blocked: true` with the body withheld (or a 422) is the safer design — decide before changing. See §8.2. |
| **`os.hostname()` in every response** | Operational disclosure, but removing it may break dashboards keyed on `servedBy`. |
| **ReDoS is mitigated, not solved** | See below. |
| **`phone` / `ipv4` / `email` over-masking** | Resolved by the round-2 policy rewrite instead. |
| **`aws-key` 40-char secret keys** | Still uncovered; `ASIA` prefix was added by the rewrite. |

### Residual ReDoS risk (important)

The 500 ms deadline is checked **between rules** (`engine.js:46`), so a single catastrophic pattern still blocks the event loop until it completes. What changed is the attack surface: rule count is capped at 50 and pattern length at 500. That materially reduces exposure but **does not eliminate catastrophic backtracking**.

A real fix requires an execution boundary the synchronous regex engine cannot cross:
- run redaction in a `worker_threads` worker with a hard kill, or
- use `re2` / a linear-time engine, or
- launch Node with `--regexp-backtracks-before-fallback`.

Recommended follow-up, not done here.

---

# Round 2 — policy rewrite review (2026-11-17)

`src/rules.js` was rewritten externally: 14 rules, lookbehind-based masking, new rule ids, `email` and `phone-intl` downgraded to `warn`. That rewrite is **not mine**. This section records the one defect it exposed and the tests I updated to match the new intended behaviour.

**Result:** `npm test` — 4/4 suites, **120/120 passing**, exit 0 (16 failures before the updates).

## 6. Change log — round 2

| # | File | Lines | Change | Why |
|---|------|-------|--------|-----|
| 21 | `src/engine.js` | 6–16 | Added `VALIDATORS` registry | `validator: 'luhn'` is a string; the old `typeof … === 'function'` test ignored it |
| 22 | `src/engine.js` | 66–69 | Resolve `rule.validator` as function **or** registered name; strip non-digits for `luhn` | Separator forms (`4111 1111 1111 1111`) must still validate |
| 23 | `tests/rules.test.js` | 7–8 | Added `spansOf()` helper | `warn` rules need span assertions, not `maskedText` |
| 24 | `tests/rules.test.js` | 11–34 | `email` → warn semantics | action changed mask → warn |
| 25 | `tests/rules.test.js` | 11–34 | Trailing dot excluded from the span | the new `\b` anchor fixed the old FP |
| 26 | `tests/rules.test.js` | 97–103 | `999.999.999.999` / `256.1.1.1` must **not** match | new octet range checks |
| 27 | `tests/rules.test.js` | 118–136 | `phone` → `phone-intl` | rule removed/renamed; requires `+` |
| 28 | `tests/rules.test.js` | 138–164 | `password` keeps the key, masks only the value | lookbehind form; `compass:` FP gone |
| 29 | `tests/rules.test.js` | 165–205 | +13 tests for `private-key`, `db-url`, `vendor-token`, `bearer`, `secret-kv`, `url-secret`, `ASIA` | new rules had zero coverage |

### 6.1 The defect: the named validator was silently ignored

`src/rules.js` declares `validator: 'luhn'` — a **string**. `src/engine.js` tested `typeof rule.validator === 'function'`, so the validator was skipped and every 13–19 digit run was masked as a credit card, valid or not. The existing test `does NOT mask invalid Luhn (this is the point of the validator)` caught it (1 detection, expected 0).

Fix in `src/engine.js`:

```js
const VALIDATORS = {
  luhn: (value) => luhn(value.replace(/\D/g, '')),
};

const validator =
  typeof rule.validator === 'function' ? rule.validator : VALIDATORS[rule.validator];
if (validator && !validator(match[0])) continue;
```

Non-digits are stripped before validating because `luhn()` returns `false` for any separator — without the strip, `"4111 1111 1111 1111"` would stop being masked. Both directions verified: invalid `4111111111111112` → 0 detections (text unchanged); `4111 1111 1111 1111` → `[CREDIT_CARD]`.

`src/rules.js` itself was left untouched, including its now-unused `luhn` / `strip` imports.

### 6.2 Behaviour changes the tests now encode

| Rule | Before | Now |
|---|---|---|
| `email` | `mask` → `[EMAIL]` | `warn` → detected, text unchanged |
| `phone` | masked bare/national numbers, FP on dates | `phone-intl`, `warn`, requires a `+` prefix |
| `password` | replaced `key=value` entirely | masks the **value** only, keeps `password=` |
| `ipv4` | `999.999.999.999` matched | octets range-checked, no match |

---

## 7. Behaviour notes for sign-off (round 2)

1. **Email and phone now pass through in plaintext.** `POST /redact` returns `200` with `john@mail.com` and `+1-555-123-4567` intact in `maskedText`; they appear only in `detections`. Verified end-to-end. If the endpoint is meant to scrub PII, the caller must act on `warn` itself.
2. **`block` returns the secret.** `private-key` sets `blocked: true` but still returns `200` and the full PEM in `maskedText` (verified `leaked=true`). See §5 — withholding the body on `blocked` is the open recommendation, and this rule makes it more urgent.
3. **Bare national phone numbers are no longer detected at all** (`5551234567`, `555 123 4567` → 0 detections), by design of the `+`-anchored pattern.

---

## 9. Round 3 — review of the added action-contract tests (2026-11-17)

New tests were added by the user at the top of `tests/rules.test.js` (`DEFAULT_RULES — action contract`). All 14 probes and the per-action behaviour tests were already sound; the block did not run because of one missing import.

| # | File | Lines | Change | Why |
|---|------|-------|--------|-----|
| 30 | `tests/rules.test.js` | 2 | `require('../src/engine')` destructures `validateRules` as well | `ReferenceError: validateRules is not defined` — the new test called it without importing it |
| 31 | `tests/rules.test.js` | ~196 | Removed a duplicated `// cross-rule overlap` header that had drifted above the `secrets and credentials` block | leftover from an earlier edit; the header now sits on its own `overlap across rules` describe |

**Result:** `npm test` — 4/4 suites, **153/153 passing**, exit 0.

Reviewed but left as-is (recommendations, not defects): the probe loop's `if (!rule) continue;` can silently drop coverage on a rule rename; `detections.length > 0` does not pin the matched span; `validateRules` accepts an uncompilable pattern and an unknown `validator` name (both verified to fail silently at run time).

## 10. Re-verify

```bash
npm test
```

Expected: `Test Suites: 4 passed`, `Tests: 153 passed`, exit 0.
