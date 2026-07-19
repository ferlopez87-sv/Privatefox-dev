import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import webExtension from "@samrum/vite-plugin-web-extension";
import { getManifest } from "./src/manifest";

export default defineConfig({
  plugins: [
    preact(),
    webExtension({
      manifest: getManifest(),
      useDynamicUrlWebAccessibleResources: false,
      // Pages reached only via runtime.getURL (not from the manifest).
      additionalInputs: {
        html: ["src/setup/index.html"],
      },
    }),
  ],
  build: {
    target: "firefox115",
    emptyOutDir: true,
  },
});
