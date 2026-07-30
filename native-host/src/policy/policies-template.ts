export const EXTENSION_ID = "lock@privatefox.local";

export interface PolicyOptions {
  /**
   * Include DisablePrivateBrowsing. Defaults to true. Driven by the
   * extension's blockPrivateBrowsing preference via the install-policy command.
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
   * ExtensionSettings.<id>.private_browsing to true in the policy, so the
   * usage-stats tracker can also cover private-window dwell time. Only
   * meaningful when disablePrivateBrowsing is off — if private windows are
   * blocked entirely there is nothing to grant access to.
   */
  grantPrivateBrowsingAccess?: boolean;
}

/**
 * Builds the Firefox Enterprise Policies content. This is the actual
 * enforcement layer for Privatefox:
 *  - force_installed: the extension cannot be removed or disabled by the user
 *  - DisablePrivateBrowsing: private windows are removed entirely (optional)
 *  - BlockAboutAddons: about:addons is unreachable
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
    disablePrivateBrowsing = true,
    blockAboutAddons = true,
    grantPrivateBrowsingAccess,
  } = options;
  const extensionSettings: Record<string, unknown> = {
    installation_mode: "force_installed",
    install_url: `file://${xpiPath}`,
    updates_disabled: true,
  };
  // Grant private-window access when requested and not blocked entirely.
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
