import { getState } from "../shared/storage";
import { recordDwellTime } from "../shared/stats-storage";
import { extractTrackableDomain } from "../shared/domain";

interface ActiveDwellSession {
  domain: string;
  startedAt: number;
  tabId: number;
}

const SESSION_KEY = "privatefoxActiveDwell";

function area() {
  return browser.storage.local as unknown as {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
  };
}

async function getSession(): Promise<ActiveDwellSession | null> {
  const result = await area().get(SESSION_KEY);
  return (result[SESSION_KEY] as ActiveDwellSession | undefined) ?? null;
}

async function setSession(session: ActiveDwellSession): Promise<void> {
  await area().set({ [SESSION_KEY]: session });
}

async function clearSession(): Promise<void> {
  await area().remove(SESSION_KEY);
}

async function closeCurrentSession(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const elapsed = Date.now() - session.startedAt;
  if (elapsed > 0) {
    await recordDwellTime(session.domain, elapsed, Date.now());
  }
  await clearSession();
}

async function openSession(domain: string, tabId: number): Promise<void> {
  if (!domain) return;
  await setSession({ domain, startedAt: Date.now(), tabId });
}

export function registerStatsTracker(): void {
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    await closeCurrentSession();
    const state = await getState();
    if (state.locked || !state.setupComplete) return;
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);
      const domain = extractTrackableDomain(tab.url ?? "");
      if (domain) await openSession(domain, activeInfo.tabId);
    } catch {
      // Tab may have closed mid-flight.
    }
  });

  browser.tabs.onUpdated.addListener(async (tabId, _changeInfo, tab) => {
    const url = tab?.url;
    if (!url) return;
    const session = await getSession();
    if (session && session.tabId === tabId) {
      const domain = extractTrackableDomain(url);
      if (domain !== session.domain) {
        await closeCurrentSession();
        const state = await getState();
        if (!state.locked && state.setupComplete && domain) {
          await openSession(domain, tabId);
        }
      }
    }
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    const session = await getSession();
    if (session && session.tabId === tabId) {
      await closeCurrentSession();
    }
  });

  browser.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      await closeCurrentSession();
    } else {
      const state = await getState();
      if (state.locked || !state.setupComplete) return;
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const active = tabs[0];
        if (active?.id !== undefined && active.url) {
          const domain = extractTrackableDomain(active.url);
          if (domain) await openSession(domain, active.id);
        }
      } catch {
        // No active tab or window context lost.
      }
    }
  });

  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    if (changes["privatefoxState"]) {
      const { newValue } = changes["privatefoxState"] as {
        newValue: { locked?: boolean };
      };
      if (newValue?.locked === true) {
        await closeCurrentSession();
      } else if (newValue?.locked === false) {
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          const active = tabs[0];
          if (active?.id !== undefined && active.url) {
            const domain = extractTrackableDomain(active.url);
            if (domain) await openSession(domain, active.id);
          }
        } catch {
          // No active tab.
        }
      }
    }
  });

  // Discard any stale session from a prior background-page lifetime.
  // recordOpen() is called from background/index.ts onStartup alongside lock().
  browser.runtime.onStartup.addListener(async () => {
    await clearSession();
  });
}
