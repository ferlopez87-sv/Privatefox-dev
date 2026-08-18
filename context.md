# Project context / session memory

Current state of the repo and any in-flight work, so a new session can pick
up without re-deriving it from git history or a conversation log. Update
this file whenever a work session ends with something unfinished, or when a
fact here goes stale. This is state, not process — see `feedback.md` for
lessons learned.

## Start here — current state

If you are a fresh agent picking this up cold, do these in order before
writing any code:

1. **Read `CLAUDE.md` fully first**, then `feedback.md`, then this whole
   file — in that order. `CLAUDE.md` has the architecture and the mandatory
   5-gate workflow (Plan → Execute → Version → Test → Confirm); `feedback.md`
   has the mistakes already made so you don't repeat them.
2. **Confirm where the repo actually is**:
   ```sh
   git checkout claude/claude-md-documentation-y27vhu
   git log --oneline -5
   node -e "console.log(require('./extension/package.json').version)"
   ```
   The version number and latest commits may have moved since this file was
   last edited — trust the repo over this document if they disagree, and
   update this file to match once you notice drift.
3. **UNCOMMITTED WORK IS SITTING IN THE TREE** (as of the 2026-08-17
   session end). 14 modified files, nothing untracked, last commit is
   `c337b85 New version`. Extension **2.1.2**, native host **1.3.0** —
   both bumped with CHANGELOG entries but not committed. Read
   `git status` before doing anything; do not re-do this work.
4. **What has shipped:** Phase 6 (local usage statistics dashboard) shipped
   as **1.6.0**; panic mode shipped as **1.7.0**. The two previously-
   unverified external facts are now VERIFIED (below) and baked into the
   code comments and docs.
5. **What is NOT done (real-Mac manual QA only)** — cannot be exercised in a
   sandbox, so never claim it is covered:
   - Private-window tracking actually covering private windows after the
     native host writes the `private_browsing` policy key + restart.
   - Panic mode closing a real incognito window (same prerequisite).
   - Dwell time surviving a background-page suspend.
   - 30-day pruning in a real profile; dashboard settings-gate behavior.
   - Phase 5 (Node SEA packaging, release polish) — never started.

## Verified external facts (were ⚠, now resolved)

- **`ExtensionSettings.<id>.private_browsing` policy key name: VERIFIED.**
  Confirmed against the official Firefox admin reference (Apr 2026): it is
  `private_browsing`, a boolean, available **Firefox 136+ / ESR 128.8+**.
  Below those versions the key is silently ignored, so private-window stats
  coverage degrades to user-controlled (about:addons toggle) — the dashboard
  copy already reflects this honestly.
- **`incognito` manifest field: NOT NEEDED for Firefox.** MDN + Firefox
  source docs: the default is `"spanning"` (extension sees events from
  private and non-private windows once access is granted); `"split"` is
  unsupported in Firefox; `"not_allowed"` would hide private windows
  entirely. Access is controlled by the hidden permission
  `internal:privateBrowsingAllowed`, granted per-extension in about:addons or
  via the `private_browsing` policy key. `manifest.ts` correctly omits the
  field.

## Repository

- GitHub: `ferlopez87-sv/Privatefox-dev`.
- Branches: `main` and `claude/claude-md-documentation-y27vhu` are kept in
  sync — all development happens on the feature branch, then `main` is
  fast-forwarded to match after each push, because the user views the repo
  on GitHub's default (`main`) view. Keep doing this after every push unless
  told otherwise.
- Shipped extension version (both branches, as of the last commit): check
  `extension/package.json` / `CHANGELOG.md` — was **1.7.0** (panic mode) as
  of this writing. Bump-per-change discipline is mandatory (see CLAUDE.md's
  Versioning section).
- Native host versions independently (`native-host/package.json`), only
  when the host itself changes — last bumped to 1.1.0 with the
  `grantPrivateBrowsingAccess` policy option.

## Build/test status as of last full verification

- Phase 6 + panic mode code-complete with unit tests: **63 tests** in
  `extension/` (7 files), 12 in `native-host/`, all passing. Typecheck,
  build, web-ext lint clean in both packages (2 pre-existing lint warnings:
  `MISSING_DATA_COLLECTION_PERMISSIONS` manifest key and an
  `UNSAFE_VAR_ASSIGNMENT` innerHTML — neither introduced by Phase 6/7).
- Real-Mac manual QA of the policy/native-host/private-window layer
  (Phases 3/4 + Phase 6 private coverage + panic) still outstanding — this
  sandbox cannot exercise it.

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

## What a fresh session should know about the Phase 6 + panic code

- **Stats:** `shared/domain.ts` + `shared/stats-storage.ts` (per-day
  buckets, 30-day prune, derived domain totals) were committed before
  1.6.0; `background/stats-tracker.ts` is the dwell tracker (durable
  session key `privatefoxActiveDwell`, idempotent close, elapsed computed at
  close). Counters: `recordOpen()` on `runtime.onStartup` next to `lock()`;
  `recordUnlockStat()` on the three unlock success paths. Dashboard at
  `src/dashboard/`, gated by the shared `SettingsGate`.
- **Panic:** `panicUntil` wall-clock deadline; `activatePanicMode()` +
  `maybeCloseIncognitoWindow()` in `lock-state.ts`; nav-guard redirects to
  `src/panic/` (no password field) while active; `grantSettingsPass`
  refuses a correct password during panic; Options shows a panic screen.
  Popup "Panic mode" button; Options "Activate panic mode now".
- **Shared UI:** `src/ui/settings-gate.tsx` exports `SettingsGate` and
  `useNow` — used by options, dashboard, and panic pages. Extract any
  further shared pieces there, not into options/main.tsx.
- **Policy plumbing:** `apply-policy` RuntimeRequest (router.ts) → native
  host `install-policy` with `disablePrivateBrowsing` /
  `blockAboutAddons` / `grantPrivateBrowsingAccess`. The native host emits
  `ExtensionSettings.<id>.private_browsing` only when
  `grantPrivateBrowsingAccess && !disablePrivateBrowsing`.

## Dynamic private-window blocking (2.0.0) — code done, QA pending

`implementation_plan.md` is implemented. `blockPrivateBrowsing` is now
enforced by `maybeCloseIncognitoWindow()` behind `windows.onCreated` instead
of the `DisablePrivateBrowsing` policy; the settings pass (not the browsing
password) lifts it for 5 minutes. `install-policy` stopped writing
`DisablePrivateBrowsing` and always writes
`ExtensionSettings.<id>.private_browsing`. The
`grantPrivateBrowsingAccess` storage field and its options toggle were
removed (stale stored values are simply ignored — no migration).
Native host bumped to 1.2.0. Once QA passes, `implementation_plan.md` can be
deleted.

**Outstanding — real-Mac QA, all of it blocked on "Apply policy now" plus one
Firefox restart** (the mechanism is entirely inert without private-window
access): private window closes instantly while blocking is on; stays open
after entering the settings password; closes again once the pass expires;
the visible open/close flash is tolerable in practice.

## Post-unlock start page (2.1.0)

`postUnlockRedirectUrl` in storage; set in Options → Protection. Applied by
`followRedirect()` (`shared/url.ts`) on the password path only, in both
`ui/LockForm.tsx` (lock screen, `replace`) and `content/overlay-ui.ts`
(overlay, `assign`). Recovery/email unlocks intentionally skip it. QA on a
real Mac: unlock from the lock screen and from the overlay, confirm only the
active tab moves and Back behaves as described.

## Firefox-install detection (native host 1.3.0)

`FIREFOX_APP` was hardcoded to `/Applications/Firefox.app`; the user runs
Developer Edition, so `policies.json` had never been written on their
machine and the whole enforcement layer was inert (see feedback.md).
`findFirefoxApps()` now detects release/Developer Edition/Nightly/ESR in
`/Applications` and `~/Applications`, `PRIVATEFOX_FIREFOX_APP` overrides it,
and `installPolicy` writes to every detected install. The LaunchAgent's
`WatchPaths` is generated from the same list.

**Not verified, and cannot be here:** that a real `install-host` run writes
policies.json into Developer Edition and that the LaunchAgent fires after an
auto-update. Needs a signed `.xpi` first — the user has none, so the policy
layer stays off until they decide to turn it on.

**Deliberately not done** (user declined, 2026-08-17): adding
`DisableProfileRefresh` / `DisableSafeMode`. Refresh Firefox is currently an
open bypass — it moves the profile aside and drops every extension — but
blocking Troubleshoot Mode also removes the user's own escape hatch, which
matters given this extension has frozen the browser twice.

## Settings-gate forwarding fix (2.1.2)

The gate granted the pass and then called `location.replace("about:addons")`,
which Firefox blocks for an extension page navigating to a privileged
`about:` URL — so the gate sat there looking like it had rejected a correct
password. `navigateTab()` in `shared/url.ts` now prefers `browser.tabs`,
falling back to `location` only for content scripts. `nav-guard.test.ts`
gained the round trip that would have caught it. See feedback.md.

**Not verified in a real browser**: the tests confirm the tabs API is used,
not that Firefox completes the navigation. The user was going to try it.

## The 2026-08-17 profile-reset incident, for context

The user hit "Restablecer Firefox" in the Troubleshoot Mode dialog while
locked out of settings, which moved their whole profile to
`~/Desktop/Old Firefox Data/` and dropped every extension. Their old
Privatefox storage (`privatefoxState`, `privatefoxStats`) is intact there if
they ever want the usage stats migrated into the new profile.

They are on **Firefox Developer Edition**, install unsigned builds with
`xpinstall.signatures.required=false`, and have **no signed .xpi** — so the
whole policy layer is off and the extension is removable from about:addons.
Ready-to-install artifacts are built as both `.zip` and `.xpi` in
`extension/web-ext-artifacts/`.

## Still planned (nothing in flight)

- **Phase 5 — polish/packaging**: optional Node SEA packaging for the
  native host, CI (`lint` + vitest), signed-`.xpi` release process.
- Real-Mac verification checklist above.
