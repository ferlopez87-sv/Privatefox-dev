export const EXTENSION_ID = "lock@privatefox.local";

/**
 * Builds the Firefox Enterprise Policies content. This is the actual
 * enforcement layer for Privatefox:
 *  - force_installed: the extension cannot be removed or disabled by the user
 *  - DisablePrivateBrowsing: private windows are removed entirely
 *  - BlockAboutAddons: about:addons is unreachable
 *
 * xpiPath must point at an AMO-SIGNED .xpi (Release-channel Firefox
 * enforces signatures even for force-installed extensions).
 */
export function buildPolicies(xpiPath: string): object {
  if (!xpiPath.startsWith("/")) {
    throw new Error(`xpiPath must be absolute, got: ${xpiPath}`);
  }
  return {
    policies: {
      ExtensionSettings: {
        [EXTENSION_ID]: {
          installation_mode: "force_installed",
          install_url: `file://${xpiPath}`,
          updates_disabled: true,
        },
      },
      DisablePrivateBrowsing: true,
      BlockAboutAddons: true,
    },
  };
}
