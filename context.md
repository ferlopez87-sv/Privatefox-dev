# Project context / session memory

Current state of the repo and any in-flight work, so a new session can pick
up without re-deriving it from git history or a conversation log. Update
this file whenever a work session ends with something unfinished, or when a
fact here goes stale. This is state, not process — see `feedback.md` for
lessons learned.

## Repository

- GitHub: `ferlopez87-sv/Privatefox-dev`.
- Branches: `main` and `claude/claude-md-documentation-y27vhu` are kept in
  sync — all development happens on the feature branch, then `main` is
  fast-forwarded to match after each push, because the user views the repo
  on GitHub's default (`main`) view. Keep doing this after every push unless
  told otherwise.
- Shipped extension version (both branches, as of the last commit): see
  `extension/package.json` — was **1.4.1** as of this writing. Bump-per-change
  discipline is mandatory (see CLAUDE.md's Versioning section) — check
  `CHANGELOG.md` for the true latest before assuming this number is current.
- Native host versions independently (`native-host/package.json`), only
  when the host itself changes.

## Build/test status as of last full verification

Phases 1–4 code-complete with unit tests (see CLAUDE.md "Phased build
order"). Phase 5 (Node SEA packaging, release polish) not started.
Real-Mac manual QA of the policy/native-host layer (Phase 3/4 behavior)
still outstanding — this sandbox cannot exercise it.

## Working style established with this user

- The user is on a Mac, not always comfortable debugging npm/git issues
  locally. When they just want to **test** a change, build here and send a
  ready-to-load `.zip` via `SendUserFile` (`cd extension && npm run
  package`) rather than walking them through local build steps — this
  reliably sidesteps local environment drift (see feedback.md). Only walk
  through local `git`/`npm` steps when they explicitly want to keep
  developing locally themselves.
- The user directs in Spanish; code, comments, commit messages, and repo
  docs stay in English to match the existing codebase convention.
- For anything privacy-sensitive or with multiple reasonable designs, use a
  clarifying-question round before implementing (matches CLAUDE.md's Plan
  gate) — this has gone well every time it's been done.

## In-flight, UNCOMMITTED work: Phase 6 — local usage statistics

Requested by the user: track how many times Firefox opens, how many times
the browser is unlocked, which domains are visited while unlocked
(including private/incognito windows), and time spent per domain — entirely
local, never phoned home.

**User's decisions (final, already made, do not re-ask)**:
- Granularity: **domain only**, never full URL/path/query.
- Retention: **30 days**, auto-pruned.
- Private browsing: **force-granted via Firefox Enterprise Policy** (native
  host), not a manual `about:addons` toggle.
- Display: **a new dedicated dashboard page**, not squeezed into Options.

A full implementation plan was written to
`/root/.claude/plans/stateless-spinning-galaxy.md` during planning — **that
path is outside this git repo and specific to the sandbox container it was
written in; it will not exist in a fresh session/container.** The design is
therefore reproduced in full below so nothing is lost.

### Progress so far (uncommitted in the working tree)

Done:
- `extension/src/shared/domain.ts` — `extractTrackableDomain(url)`, complete.
- `extension/src/shared/stats-storage.ts` — full `privatefoxStats` module
  (`getStats`/`setStats`/`recordOpen`/`recordUnlockStat`/`recordDwellTime`/
  `pruneStats`/`aggregateDomainTotals`), complete.
- `extension/src/shared/constants.ts` — added
  `DEFAULT_GRANT_PRIVATE_BROWSING_ACCESS`.
- `extension/src/shared/storage.ts` — added `grantPrivateBrowsingAccess`
  field + default.
- `extension/src/shared/protocol.ts` — added `{ kind: "apply-policy" }`
  `RuntimeRequest`, `{ ok: true; detail?: string }` `RuntimeResponse`
  variant, and `grantPrivateBrowsingAccess?: boolean` on the `install-policy`
  `NativeCommand`.
- `native-host/src/protocol.ts` — mirrored the same `NativeCommand` field.

**Not started yet** (see full plan below for exact shape):
- `native-host/src/policy/policies-template.ts` — `PolicyOptions` needs
  `grantPrivateBrowsingAccess?: boolean`, `buildPolicies` needs to emit
  `ExtensionSettings[EXTENSION_ID].private_browsing: true`.
  **⚠ The exact Mozilla policy key name (`private_browsing`) was NOT
  verified against current docs before this session paused** — a WebFetch
  attempt against `firefox-admin-docs.mozilla.org` 403'd and a GitHub docs
  page had moved the content elsewhere. Verify before shipping; getting the
  key wrong silently no-ops the whole feature.
- Also unverified: whether `extension/src/manifest.ts` needs an
  `"incognito"` field at all for Firefox (Chrome's `"spanning"`/`"split"`
  modes don't map directly to Firefox's model) — confirm against current
  Firefox WebExtension docs.
- `native-host/src/commands/install-policy.ts`, `commands/index.ts` — wire
  the new field through, mirroring how `disablePrivateBrowsing`/
  `blockAboutAddons` already flow.
- `native-host/tests/policy.test.ts` — add include/omit cases for
  `private_browsing`, mirroring the existing two.
- `extension/src/background/stats-tracker.ts` — not created. Tab/window
  dwell-time tracker; see "Tab/window tracking" below for the full design.
- `extension/src/background/index.ts` — needs `registerStatsTracker()`
  added to the synchronous top-level register calls, and `void recordOpen();`
  added to the existing `runtime.onStartup` listener.
- `extension/src/background/lock-state.ts` — needs a `recordUnlock()`
  helper called on the success path of `unlockWithPassword`,
  `unlockWithRecoveryCode`, and `unlockWithEmailCode`.
- `extension/src/background/router.ts` — needs an `"apply-policy"` case
  that reads current state and calls `callNativeHost({command:
  "install-policy", disablePrivateBrowsing: state.blockPrivateBrowsing,
  blockAboutAddons: state.blockAboutAddons, grantPrivateBrowsingAccess:
  state.grantPrivateBrowsingAccess})` — this closes the pre-existing gap
  documented in feedback.md (nothing currently calls install-policy from a
  running browser at all).
- `extension/src/ui/settings-gate.tsx` — extract the `SettingsGate`
  component currently private to `extension/src/options/main.tsx` so the
  new dashboard can reuse it.
- `extension/src/options/main.tsx` — new checkbox for
  `grantPrivateBrowsingAccess` in `ProtectionSettings` (with copy noting it
  only matters if `blockPrivateBrowsing` is off), an "Apply policy now"
  button that sends `{kind: "apply-policy"}`, a link to the new dashboard,
  and switch to the extracted `SettingsGate`.
- `extension/src/dashboard/{index.html,main.tsx,use-stats.ts}` — not
  created. New standalone page, gated by the same settings-password
  mechanism as Options.
- `extension/vite.config.ts` — append `"src/dashboard/index.html"` to
  `additionalInputs.html`.
- `extension/src/popup/main.tsx` — new "Usage stats" button next to
  "Preferences".
- `extension/src/ui/styles.css` — new `main.dashboard { max-width: 40rem; }`
  container and `.bar` styles for the domain-time list.
- Version bump (this is a new user-visible capability → minor) and
  `CHANGELOG.md` entry.
- Docs: `CLAUDE.md` (add `src/dashboard/` to the layout list + a short
  Usage Statistics note), `docs/ARCHITECTURE.md` (stats subsystem
  subsection), `docs/THREAT-MODEL.md` (note the dashboard is browsing-
  history-adjacent and gated like Options).

### Full design (reproduced from the plan, so it survives container loss)

**Storage shape** (`extension/src/shared/stats-storage.ts`, already
implemented — reproduced here for reference):
```ts
export interface DomainStat { domain: string; totalMs: number; lastVisitedAt: number; }
export interface DailyBucket { date: string; opens: number; unlocks: number; domains: Record<string, number>; }
export interface PrivatefoxStats { schemaVersion: number; totalOpens: number; totalUnlocks: number; days: Record<string, DailyBucket>; }
```
Per-day buckets (not a flat event log) keep the shape bounded (~31 keys) and
make 30-day pruning O(days). Lifetime open/unlock counters are never pruned;
only per-domain time is windowed. Per-domain totals are *derived* via
`aggregateDomainTotals`, not stored redundantly.

**Domain extraction** (`extension/src/shared/domain.ts`, already
implemented): `null` for `about:`/`moz-extension:`/`file:`/`chrome:`/`data:`/
`javascript:` and anything not `http(s):`; strips only a leading `www.`
(no eTLD+1 collapsing, no public-suffix-list dependency); IPs/localhost
keep their port.

**Tab/window tracking** (`extension/src/background/stats-tracker.ts`, not
yet written) — the hard part, given the background page is non-persistent:

- Durable session state in its own storage key (not inside
  `privatefoxStats`, so tab-switching doesn't churn the stats blob):
  ```ts
  interface ActiveDwellSession { domain: string; startedAt: number; tabId: number; }
  const SESSION_KEY = "privatefoxActiveDwell";
  ```
- `registerStatsTracker()`, called synchronously from `background/index.ts`
  alongside the existing `registerRouter(); registerIdleListener();
  registerNavGuard();`, registers:
  - `tabs.onActivated` — close current session, open one for the newly
    active tab if trackable and unlocked.
  - `tabs.onUpdated` (same-tab navigation) — close old, open new.
  - `tabs.onRemoved` — close out if the removed tab held the session.
  - `windows.onFocusChanged` (`WINDOW_ID_NONE`) — close on losing OS focus
    entirely; reopen on regaining it for the now-active tab.
  - `storage.onChanged` on the lock state (same pattern as the existing
    idle-timeout listener) — `locked: false→true` closes and blocks new
    sessions; `true→false` opens one for the active tab. This is what makes
    dwell time accrue **only while unlocked**.
- Elapsed time is always computed as `closeTimestamp - session.startedAt`
  at the moment a session closes — never accumulated incrementally in
  memory, so a background-page suspend/resume mid-session loses nothing.
  The one real loss case: quitting Firefox entirely with a session open —
  `registerStatsTracker()` **discards** (does not flush) any leftover
  `SESSION_KEY` found at `onStartup`, since attributing that stale span
  would be a guess.
- Every close path funnels through one idempotent `closeCurrentSession()`
  helper (read `SESSION_KEY`, flush if present, clear it) so near-
  simultaneous events (e.g. `onRemoved` then `onActivated`) can't double-count.
- Private windows: once access is granted via the policy, these same
  `tabs.*`/`windows.*` events should fire for them automatically — **needs
  manual verification on a real Mac**, this sandbox cannot exercise private
  windows at all.

**Counter call sites**:
- Firefox opens: `background/index.ts`'s existing `runtime.onStartup`
  listener, alongside `void lock();` → add `void recordOpen();`.
- Unlocks: three explicit call sites in `background/lock-state.ts` (on the
  success branch of `unlockWithPassword`, `unlockWithRecoveryCode`,
  `unlockWithEmailCode`) — deliberately not a shared hook wrapping
  `setState({locked:false})` generically, matching this repo's style of
  small explicit functions over cross-cutting hooks.

**Native host plumbing** mirrors `disablePrivateBrowsing`/`blockAboutAddons`
exactly (see "Not started yet" above for the precise files) — new
`PolicyOptions.grantPrivateBrowsingAccess`, new `ExtensionSettings[id].private_browsing`
key (name pending verification).

**Dashboard**: `src/dashboard/{index.html,main.tsx,use-stats.ts}`,
registered via `vite.config.ts`'s `additionalInputs`, reached from a new
popup button and an Options link, gated by the extracted `SettingsGate`.
Layout: header + "never leaves your device" note, summary facts (opens/
unlocks/domains-tracked, reusing the existing `.facts` CSS pattern), a
hand-rolled horizontal bar list per domain (no new chart dependency — matches
this repo's minimal-dependency stance), and a private-browsing coverage line
that reflects the stored preferences plus a static restart reminder (a
WebExtension has no API to introspect whether `policies.json` is actually
active — don't overstate this as a live check).

### Known-broken state right now (expected, not a regression)

`extension/`'s `npm run typecheck` currently fails with:
```
src/background/router.ts(20,49): error TS2366: Function lacks ending
return statement and return type does not include 'undefined'.
```
This is because `shared/protocol.ts` already declares the new
`{kind:"apply-policy"}` `RuntimeRequest` variant, but `router.ts`'s switch
doesn't have a case for it yet (TypeScript's exhaustiveness check on the
discriminated union is what's firing). All 61 existing vitest tests still
pass — nothing shipped is broken, this is exactly the incomplete state
described above. Fixed by adding the `"apply-policy"` case described in
"Not started yet."

### Verification still needed once complete

- `extension/`: `npm test` (new suites: `stats-storage`, `domain`,
  `stats-tracker`, using the existing fake-browser harness pattern from
  `nav-guard.test.ts`/`surface-lock.test.ts`), `npm run typecheck`,
  `npm run build`, `npm run lint`.
- `native-host/`: `npm test` (extended `policy.test.ts`), `npm run typecheck`,
  `npm run build`.
- Manual, real-Mac only: verify the exact `private_browsing` policy key and
  whether `manifest.ts` needs an `incognito` field; confirm private-window
  tracking actually works after native host install + restart; confirm
  dwell time survives a background-page suspend; confirm 30-day pruning;
  confirm the dashboard's settings gate behaves like Options.
