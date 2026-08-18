# Goal: Dynamic Private Mode Locking

Change the mechanism for blocking Private Browsing. Instead of a hard block at the browser level (which requires restarting Firefox to toggle), Private Browsing will be dynamically blocked by the extension. Private windows will instantly close when opened, *unless* the user has recently entered the **settings password** (granting them a temporary 5-minute access pass). 

This fulfills the requirement: the initial browsing password unlocks standard browsing, but Private Mode remains locked and requires the settings password to be used.

## User Review Required

> [!IMPORTANT]
> **Behavioral Change**: Previously, when Private Browsing was blocked, Firefox completely hid the "New Private Window" button and disabled the `Cmd+Shift+P` shortcut.
> With this new dynamic approach, Firefox **will** show the button and allow the shortcut. However, the moment the private window opens, the extension will instantly close it if the settings password hasn't been entered. You will see a brief "flash" of the window opening and closing. Is this acceptable?

> [!WARNING]
> **Firefox Restart Required**: To transition from the old mechanism to the new one, the extension must rewrite the security policies on your Mac (to give itself permission to see and close private windows). After we deploy this change, you will need to click "Apply policy now" in the options and **restart Firefox one time** for it to take effect.

## Proposed Changes

### Extension Background Logic

#### [MODIFY] `extension/src/background/lock-state.ts`
- Update `maybeCloseIncognitoWindow()`: Currently, it only closes private windows during Panic Mode. We will expand it so that if `blockPrivateBrowsing` is enabled in settings, it will always close private windows **unless** `hasValidSettingsPass()` is true.

#### [MODIFY] `extension/src/background/router.ts`
- Update the `apply-policy` command payload: We will instruct the Native Host to *stop* using the hard `DisablePrivateBrowsing` enterprise policy, and instead *force* `grantPrivateBrowsingAccess: true` so the extension always has the permissions needed to dynamically close the windows.

### UI & Settings

#### [MODIFY] `extension/src/options/main.tsx`
- Update the help text under the "Block private / incognito windows" toggle to explain the new dynamic behavior (locked by default, unlocked for 5 minutes after entering the settings password).
- Remove the "Grant private-window access for stats" toggle, as this permission will now be strictly required and always enabled by the policy installer to make the dynamic block work.

#### [MODIFY] `extension/src/shared/storage.ts`
- Remove `grantPrivateBrowsingAccess` from the storage schema, as it will be unconditionally true when `blockPrivateBrowsing` is enabled.

### Native Host

#### [MODIFY] `native-host/src/policy/policies-template.ts`
- Change the default values so the CLI installer (`npm run install-host`) does not hard-block private browsing by default, aligning with the new dynamic behavior.

## Verification Plan

### Automated Tests
- Update `lock-state.test.ts` to verify that `windows.onCreated` closes private windows when locked, and leaves them open when `hasValidSettingsPass()` is true.
- Update `protocol.test.ts` to reflect the new policy payload defaults.

### Manual Verification
1. Click "Apply policy now" and restart Firefox.
2. Ensure the browser is unlocked (standard browsing).
3. Attempt to open a Private Window (Cmd+Shift+P). Verify it closes instantly.
4. Go to Options, enter the Settings Password (granting the 5-minute pass).
5. Attempt to open a Private Window again. Verify it stays open.
6. Wait 5 minutes (or click "Close preferences"). Verify new Private Windows close instantly again.
