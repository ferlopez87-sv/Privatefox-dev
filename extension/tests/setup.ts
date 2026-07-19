/**
 * Test bootstrap: installs an in-memory fake of the `browser` global
 * covering the surface the shared/background modules touch. Node 22
 * provides WebCrypto (crypto.subtle), atob/btoa natively.
 */
import { beforeEach } from "vitest";

type Listener = (...args: unknown[]) => void;

export function makeFakeBrowser() {
  let store: Record<string, unknown> = {};
  const changedListeners: Listener[] = [];

  return {
    _reset() {
      store = {};
    },
    storage: {
      local: {
        async get(key: string) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
          for (const fn of changedListeners) fn(items, "local");
        },
      },
      onChanged: {
        addListener(fn: Listener) {
          changedListeners.push(fn);
        },
        removeListener(fn: Listener) {
          const i = changedListeners.indexOf(fn);
          if (i >= 0) changedListeners.splice(i, 1);
        },
      },
    },
    idle: {
      setDetectionInterval() {},
      onStateChanged: { addListener() {} },
    },
    runtime: {
      async sendNativeMessage() {
        throw new Error("no native host in tests");
      },
    },
  };
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).browser = makeFakeBrowser();
});
