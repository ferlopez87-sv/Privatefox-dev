export const EXTENSION_ID = "lock@privatefox.local";

export interface PolicyOptions {
  /**
   * Include DisablePrivateBrowsing. Defaults to true. Driven by the
   * extension's blockPrivateBrowsing preference via the install-policy command.
   */
  disablePrivateBrowsing?: boolean;
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
  const { disablePrivateBrowsing = true } = options;
  return {
    policies: {
      ExtensionSettings: {
        [EXTENSION_ID]: {
          installation_mode: "force_installed",
          install_url: `file://${xpiPath}`,
          updates_disabled: true,
        },
      },
      ...(disablePrivateBrowsing ? { DisablePrivateBrowsing: true } : {}),
      BlockAboutAddons: true,
    },
  };
}
