import { describe, expect, it, vi } from "vitest";
import { installPlatform, isStandaloneDisplay, needsInstallGate, requestPersistentStorage } from "./pwa-install";

const browserWindow = (standalone: boolean) => ({
  matchMedia: vi.fn(() => ({ matches: standalone } as MediaQueryList)),
});

const navigatorLike = (overrides: Partial<Navigator> & { standalone?: boolean } = {}) => ({
  userAgent: "Mozilla/5.0",
  platform: "Linux x86_64",
  maxTouchPoints: 0,
  ...overrides,
} as Navigator & { standalone?: boolean });

describe("PWA installation environment", () => {
  it("recognizes iPadOS desktop user agents and Android tablets", () => {
    expect(installPlatform(navigatorLike({ platform: "MacIntel", maxTouchPoints: 5 }))).toBe("ios");
    expect(installPlatform(navigatorLike({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet)" }))).toBe("android");
    expect(installPlatform(navigatorLike())).toBe("other");
  });

  it("gates mobile browser mode but never an installed app", () => {
    const ipad = navigatorLike({ platform: "MacIntel", maxTouchPoints: 5 });
    expect(needsInstallGate(browserWindow(false), ipad)).toBe(true);
    expect(needsInstallGate(browserWindow(true), ipad)).toBe(false);
    expect(isStandaloneDisplay(browserWindow(false), navigatorLike({ ...ipad, standalone: true }))).toBe(true);
  });

  it("requests persistence only when it is not already granted", async () => {
    const persisted = vi.fn().mockResolvedValue(false);
    const persist = vi.fn().mockResolvedValue(true);
    const nav = { ...navigatorLike(), storage: { persisted, persist } };
    await expect(requestPersistentStorage(nav)).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();

    persisted.mockResolvedValue(true);
    persist.mockClear();
    await expect(requestPersistentStorage(nav)).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("quietly degrades when persistent storage is unavailable or rejected", async () => {
    await expect(requestPersistentStorage(navigatorLike())).resolves.toBeNull();
    const nav = {
      ...navigatorLike(),
      storage: { persisted: vi.fn().mockRejectedValue(new Error("blocked")), persist: vi.fn() },
    };
    await expect(requestPersistentStorage(nav)).resolves.toBe(false);
  });
});
