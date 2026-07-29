# Feedback log

Process learnings for whoever (human or agent) works on this repo next. Not
a changelog of features — a log of *mistakes and what they taught*, so the
same class of bug doesn't ship twice. Add an entry whenever something breaks
in a way worth remembering, especially anything the user had to catch
because it wasn't caught here first.

## The about:addons gate shipped broken twice before it worked

- **v1.3.0**: added a password gate for `about:addons`, but forgot the
  `tabs` permission. `host_permissions: ["<all_urls>"]` does **not** cover
  `about:` URLs — nothing can. Without `tabs`, `tabs.onUpdated`'s
  `changeInfo.url` was `undefined` for `about:addons` and the listener
  silently no-opped. Worse: CLAUDE.md at the time *actively asserted the
  opposite* ("no separate tabs permission is needed") — a confidently wrong
  claim, shipped as documented fact.
- **v1.4.0**: added the `tabs` permission. Still didn't work. Root cause:
  the listener only read `changeInfo.url`, which reports a URL *change*
  within an existing tab. Opening `about:addons` via the Firefox menu or
  Cmd+Shift+A opens a **brand-new tab already pointing there** — no change
  event ever fires.
- **v1.4.1**: fixed by also reading the tab object's own `url` (the third,
  previously-ignored argument to `onUpdated`) and adding a `tabs.onCreated`
  listener.

**Lesson**: for anything intercepting navigation to browser-chrome pages,
don't reason twice from memory about "how the API should behave" and call
it done. Build a test harness that can fire the *actual* event shapes
(`tabs.onCreated`, `onUpdated` with and without `changeInfo.url`) before
shipping — this is now permanent in `extension/tests/nav-guard.test.ts`,
and it's what would have caught both failures on the first try.

## Flipping a boolean in storage is not the same as a visible effect

`lock()` only set `state.locked = true`. That's sufficient for ordinary web
pages (the content-script overlay reacts to `storage.onChanged`), but not
for the preferences tab itself, `about:home` at Firefox startup, or any
other `about:`/extension page — content scripts can't run there. Two
different user-reported symptoms ("Lock now in preferences does nothing",
"no lock screen at startup") turned out to be the same root cause.

**Lesson**: whenever a state change is supposed to have a visible effect,
ask which surfaces can actually react to it on their own (via a listener
they own) versus which ones need to be *pushed* to reflect it. Fixed by
`surfaceLockScreen()` — after locking, navigate every focused tab that
can't host the overlay to the extension's own lock page.

## A preference that's never actually wired to anything

While planning the usage-stats feature, found that `blockPrivateBrowsing`
and `blockAboutAddons` (shipped in v1.1.0/v1.2.0, with UI copy explicitly
saying "applies after the native host is installed") were never actually
connected to anything: nothing in the extension calls
`callNativeHost({command:"install-policy"})`. The one-time CLI installer
(`native-host/scripts/install.ts`) calls `installPolicy(XPI_DEST)` with no
options, always using hardcoded defaults — so toggling either preference in
the UI had zero effect on a real Firefox install, silently, for two
releases.

**Lesson**: any preference whose only real effect is "applied by a native/
policy layer" needs an explicit, findable call site connecting the toggle
to what it claims to affect. This can't be caught by tests alone (it's only
observable on a real Mac with the native host installed) — audit for it
specifically whenever a UI element carries an "only takes effect once X" caveat.

## `npm audit` was not part of "done" until the user's Mac found 18 vulnerabilities

Standard dependency versions (`web-ext@8`, `vite@5`, `vitest@2`, `nodemailer@6`)
had accumulated real CVEs (some critical) across their transitive chains.
Nothing here ever ran `npm audit` as part of verification — it only surfaced
because the user pasted their local `npm install` output.

**Lesson**: `npm audit` (or equivalent) belongs in the standard verification
gate alongside tests/typecheck/build/lint, not as a reactive fire drill.

## Local environment drift causes false alarms that look like code bugs

Several rounds of user-reported "errors" were not bugs in this repo at all:
`npm install` run from the wrong directory (home, not the repo), `git pull`
rejected by locally-modified `package.json`/`package-lock.json` left over
from an earlier partial install, and general local/remote drift. None of
these needed a code fix — they needed the user's local clone reconciled
with what was actually pushed.

**Lesson**: for a user who isn't going to debug npm/git themselves, the
fastest and most reliable path for "let me just try this" is building here
and handing over a ready-to-load `.zip` (`SendUserFile`) — it sidesteps
their local environment entirely. Save the "let's fix your local clone"
conversation for when they explicitly want to keep developing locally.

## GitHub's default branch view caused repeated "where did my code go" confusion

All work happens on `claude/claude-md-documentation-y27vhu`; the user kept
viewing `main` (GitHub's default) and seeing nothing there until it was
explicitly fast-forwarded. Standing practice since: after every push to the
feature branch, fast-forward `main` to match, so the default view always
reflects the latest shipped work. (Confirmed explicitly authorized once by
the user, then continued as established practice — still worth a quick
mention rather than assuming forever.)

## Practices that worked well — keep doing these

- **Every shipped change bumps `extension/package.json`'s version and adds
  a `CHANGELOG.md` entry, in the same commit.** Added mid-project at the
  user's request; never skip it — the user installs `.xpi`/`.zip` files by
  hand and has no other way to tell builds apart.
- **The fake-browser test harness (`extension/tests/setup.ts`) grows
  incrementally** as new background modules need more of the `browser` API
  surface (`tabs.query`/`update`/`onUpdated`/`onCreated` were added exactly
  when `nav-guard`/`surface-lock`/stats-tracking needed them) rather than
  being mocked ad hoc per test file. Keep extending the one shared fake.
- **For privacy-sensitive or architecturally ambiguous asks** (the second
  "settings password," usage-stats granularity/retention/private-browsing
  handling), pause and use a clarifying-question flow for the genuinely
  personal/subjective decisions instead of assuming. Consistently well
  received.
