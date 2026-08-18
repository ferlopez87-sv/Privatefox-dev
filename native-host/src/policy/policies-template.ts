export const EXTENSION_ID = "lock@privatefox.local";

export interface PolicyOptions {
  /**
   * Include DisablePrivateBrowsing. Defaults to FALSE: private browsing is
   * now blocked dynamically by the extension (windows.onCreated closes the
   * window unless a settings pass is valid), so the hard policy block —
   * which needs a Firefox restart to toggle either way — is no longer how
   * the blockPrivateBrowsing preference is enforced. Still supported for
   * anyone who wants the harder, restart-bound block.
   */
  disablePrivateBrowsing?: boolean;
  /**
   * Include BlockAboutAddons. Defaults to true. When false, about:addons
   * stays reachable and the extension's password gate (nav-guard) is what
   * protects it — a deliberate trade of hard blocking for usability.
   */
  blockAboutAddons?: boolean;
  /**
   * Grant this extension access to private/incognito windows by setting
   * ExtensionSettings.<id>.private_browsing to true in the policy. Defaults
   * to TRUE and is load-bearing: without it Firefox never hands the
   * extension an incognito window, so neither the dynamic private-window
   * block nor private-window dwell stats can work. Only meaningful when
   * disablePrivateBrowsing is off — if private windows are blocked entirely
   * there is nothing to grant access to.
   */
  grantPrivateBrowsingAccess?: boolean;
}

/**
 * Builds the Firefox Enterprise Policies content. This is the actual
 * enforcement layer for Privatefox:
 *  - force_installed: the extension cannot be removed or disabled by the user
 *  - private_browsing: the extension can see (and close) private windows
 *  - BlockAboutAddons: about:addons is unreachable
 *  - DisablePrivateBrowsing: private windows removed entirely (opt-in; the
 *    default is the extension's dynamic block instead)
 *
 * xpiPath must point at an AMO-SIGNED .xpi (Release-channel Firefox
 * enforces signatures even for force-installed extensions).
 */
export function buildPolicies(
  xpiPath: string,
  options: PolicyOptions = {},
): object {
  if (!xpiPath.startsWith("/")) {
    throw new Error(`xpiPath must be absolute, got: ${xpiPath}`);
  }
  const {
    disablePrivateBrowsing = false,
    blockAboutAddons = true,
    grantPrivateBrowsingAccess = true,
  } = options;
  const extensionSettings: Record<string, unknown> = {
    installation_mode: "force_installed",
    install_url: `file://${xpiPath}`,
    updates_disabled: true,
  };
  // Grant private-window access when requested and not blocked entirely.
  // VERIFIED against Firefox admin docs (Apr 2026): the key is
  // `private_browsing`, a boolean, available Firefox 136+ / ESR 128.8+.
  // Below those versions the key is ignored (access stays user-controlled
  // in about:addons) — the stats dashboard's private-window coverage line
  // already reflects that honestly. No manifest "incognito" field is
  // needed: Firefox's default is "spanning" (events from private windows
  // arrive once access is granted; "split" is unsupported).
  if (grantPrivateBrowsingAccess && !disablePrivateBrowsing) {
    extensionSettings["private_browsing"] = true;
  }
  return {
    policies: {
      ExtensionSettings: {
        [EXTENSION_ID]: extensionSettings,
      },
      ...(disablePrivateBrowsing ? { DisablePrivateBrowsing: true } : {}),
      ...(blockAboutAddons ? { BlockAboutAddons: true } : {}),
    },
  };
}
