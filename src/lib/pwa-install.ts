export type InstallPlatform = "ios" | "android" | "other";

type NavigatorLike = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & {
  standalone?: boolean;
  storage?: Pick<StorageManager, "persist" | "persisted">;
};

export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function installPlatform(nav: NavigatorLike = navigator): InstallPlatform {
  if (/Android/i.test(nav.userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(nav.userAgent)) return "ios";
  // iPadOS can request a desktop user agent and identify itself as a Mac.
  if (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) return "ios";
  return "other";
}

export function isStandaloneDisplay(
  win: Pick<Window, "matchMedia"> = window,
  nav: NavigatorLike = navigator,
): boolean {
  return win.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function needsInstallGate(
  win: Pick<Window, "matchMedia"> = window,
  nav: NavigatorLike = navigator,
): boolean {
  return !isStandaloneDisplay(win, nav) && installPlatform(nav) !== "other";
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

function notifyPromptListeners() {
  promptListeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (rawEvent) => {
    const event = rawEvent as BeforeInstallPromptEvent;
    event.preventDefault();
    deferredPrompt = event;
    notifyPromptListeners();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyPromptListeners();
  });
}

export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

export async function showInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const prompt = deferredPrompt;
  if (!prompt) return "unavailable";
  deferredPrompt = null;
  notifyPromptListeners();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome;
}

export async function requestPersistentStorage(
  nav: NavigatorLike = navigator,
): Promise<boolean | null> {
  const storage = nav.storage;
  if (!storage?.persist || !storage.persisted) return null;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    // Storage persistence is an optional browser capability. IndexedDB remains
    // usable when a browser does not expose or grant it.
    return false;
  }
}
