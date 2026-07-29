/**
 * Test bootstrap: installs an in-memory fake of the `browser` global
 * covering the surface the shared/background modules touch. Node 22
 * provides WebCrypto (crypto.subtle), atob/btoa natively.
 */
import { beforeEach } from "vitest";

type Listener = (...args: unknown[]) => void;

/** Lets every pending promise chain in the guard settle before asserting. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export interface FakeTab {
  id: number;
  url: string;
  active: boolean;
}

export function makeFakeBrowser(tabs: FakeTab[] = []) {
  let store: Record<string, unknown> = {};
  const changedListeners: Listener[] = [];
  const updatedListeners: Listener[] = [];
  const createdListeners: Listener[] = [];
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
      onUpdated: {
        addListener(fn: Listener) {
          updatedListeners.push(fn);
        },
      },
      onCreated: {
        addListener(fn: Listener) {
          createdListeners.push(fn);
        },
      },
    },
    /** Simulates navigating an existing tab (changeInfo carries the URL). */
    async _fireUpdated(tabId: number, url: string | undefined, tabUrl?: string) {
      const changeInfo = url === undefined ? {} : { url };
      for (const fn of updatedListeners) {
        fn(tabId, changeInfo, { id: tabId, url: tabUrl ?? url });
      }
      await flush();
    },
    /** Simulates a tab opened straight onto a URL (no URL *change* fires). */
    async _fireCreated(tab: { id: number; url: string }) {
      for (const fn of createdListeners) fn(tab);
      await flush();
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
