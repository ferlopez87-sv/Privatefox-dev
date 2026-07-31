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
3. **What has shipped:** Phase 6 (local usage statistics dashboard) shipped
   as **1.6.0**; panic mode shipped as **1.7.0**. Both are on `main` and the
   feature branch. The two previously-unverified external facts are now
   VERIFIED (below) and baked into the code comments and docs.
4. **What is NOT done (real-Mac manual QA only)** — cannot be exercised in a
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

## Still planned (nothing in flight)

- **Phase 5 — polish/packaging**: optional Node SEA packaging for the
  native host, CI (`lint` + vitest), signed-`.xpi` release process.
- Real-Mac verification checklist above.
