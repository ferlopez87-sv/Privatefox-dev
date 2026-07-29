/**
 * Test bootstrap: installs an in-memory fake of the `browser` global
 * covering the surface the shared/background modules touch. Node 22
 * provides WebCrypto (crypto.subtle), atob/btoa natively.
 */
import { beforeEach } from "vitest";

type Listener = (...args: unknown[]) => void;

export interface FakeTab {
  id: number;
  url: string;
  active: boolean;
}

export function makeFakeBrowser(tabs: FakeTab[] = []) {
  let store: Record<string, unknown> = {};
  const changedListeners: Listener[] = [];
  /** Records navigations so tests can assert the lock screen was surfaced. */
  const navigations: { tabId: number; url: string }[] = [];

  return {
    _reset() {
      store = {};
    },
    _tabs: tabs,
    _navigations: navigations,
    tabs: {
      async query({ active }: { active?: boolean } = {}) {
        return tabs.filter((t) => (active === undefined ? true : t.active));
      },
      async update(tabId: number, props: { url?: string }) {
        if (props.url !== undefined) {
          navigations.push({ tabId, url: props.url });
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) tab.url = props.url;
        }
      },
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
      getURL(path: string) {
        return `moz-extension://test/${path}`;
      },
    },
  };
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).browser = makeFakeBrowser();
});
