import pkg from "../package.json";

export function getManifest(): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: "Privatefox Lock",
    version: pkg.version,
    description:
      "Locks Firefox behind a password: on startup, after inactivity, and on demand.",
    browser_specific_settings: {
      gecko: {
        // Fixed ID: referenced by ExtensionSettings in policies.json and by
        // the native messaging host's allowed_extensions.
        id: "lock@privatefox.local",
        strict_min_version: "115.0",
      },
    },
    background: {
      scripts: ["src/background/index.ts"],
      type: "module",
    },
    permissions: ["storage", "idle", "webNavigation", "nativeMessaging"],
    host_permissions: ["<all_urls>"],
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content/overlay.ts"],
        all_frames: false,
        run_at: "document_start",
      },
    ],
    chrome_url_overrides: {
      newtab: "src/newtab/index.html",
    },
    options_ui: {
      page: "src/options/index.html",
      open_in_tab: true,
    },
    action: {
      default_title: "Lock Privatefox now",
    },
    icons: {
      "48": "icons/48.png",
      "128": "icons/128.png",
    },
    // Chrome's MV3 type requires background.service_worker; Firefox MV3
    // uses background.scripts (event page) instead, hence the cast.
  } as unknown as chrome.runtime.ManifestV3;
}
