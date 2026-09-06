let cached: SpeechSynthesisVoice[] = [];

/** Compact system voices sound robotic; prefer the named high-quality ones. */
const PREFERRED = [
  "Samantha",
  "Ava",
  "Allison",
  "Susan",
  "Karen",
  "Serena",
  "Daniel",
  "Google US English",
  "Google UK English Female",
  "Microsoft Aria",
  "Microsoft Jenny",
];

/** macOS/iOS ship joke voices (Bells, Zarvox…) that are useless for learning. */
const NOVELTY =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Grandma|Grandpa|Rocko|Shelley|Sandy|Eddy|Flo|Reed)\b/;

export function isUsableVoice(v: SpeechSynthesisVoice): boolean {
  return !NOVELTY.test(v.name);
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) {
    cached = now;
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    const done = () => {
      cached = speechSynthesis.getVoices();
      resolve(cached);
    };
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 600);
  });
}

let preferredVoice: string | null = null;

/** Lets the child pick a downloaded "enhanced" iPad voice instead of the compact default. */
export function setVoicePreference(name: string | null): void {
  preferredVoice = name;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = cached.length ? cached : speechSynthesis.getVoices();
  if (!voices.length) return undefined;
  cached = voices;
  if (preferredVoice) {
    const exact = voices.find((v) => v.name === preferredVoice);
    if (exact) return exact;
  }
  const en = voices.filter((v) => v.lang.replace("_", "-").startsWith("en") && isUsableVoice(v));
  const sameLang = en.filter((v) => v.lang.replace("_", "-") === lang);
  const pool = sameLang.length ? sameLang : en;
  for (const name of PREFERRED) {
    const hit = pool.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  return pool.find((v) => v.localService) ?? pool[0];
}

export function speak(text: string, lang: string, rate: number): void {
  if (!text || typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const say = () => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(lang);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = lang;
    }
    u.rate = rate;
    u.pitch = 1;
    u.volume = 1;
    speechSynthesis.speak(u);
  };
  if (!cached.length && !speechSynthesis.getVoices().length) {
    void loadVoices().then(say);
    return;
  }
  say();
}

/**
 * iPad Safari 只放行用户手势里起的 speechSynthesis。答完题要等音效散掉才念单词，
 * 中间隔着一个 setTimeout，手势链可能已经断了，所以在手势里先空跑一次把引擎解锁。
 */
export function warmUpSpeech(): void {
  if (typeof speechSynthesis === "undefined") return;
  void loadVoices();
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* 解锁失败就算了，后面照样试着念 */
  }
}

/** 离开当前题 / 退出课时把还在念的掐掉 */
export function stopSpeaking(): void {
  if (typeof speechSynthesis === "undefined") return;
  try {
    speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Safari often fires utterance.onend immediately after speak(); don't trust that. */
export function estimateSpeakMs(text: string, rate: number): number {
  const r = Math.max(0.5, rate || 1);
  return Math.min(10_000, Math.max(900, Math.round((text.trim().length / r) * 220 + 500)));
}

export function speakAndWait(text: string, lang: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (!text || typeof speechSynthesis === "undefined") return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const cap = estimateSpeakMs(text, rate);
    const say = () => {
      try {
        speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(lang);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = lang;
      }
      u.rate = rate;
      let started = false;
      u.onstart = () => {
        started = true;
      };
      // Ignore a bogus immediate onend; wait until the engine actually spoke.
      u.onend = () => {
        if (started) finish();
      };
      u.onerror = () => finish();
      speechSynthesis.speak(u);
      const t0 = Date.now();
      const poll = setInterval(() => {
        if (done) {
          clearInterval(poll);
          return;
        }
        try {
          if (speechSynthesis.speaking || speechSynthesis.pending) started = true;
          if (started && !speechSynthesis.speaking && !speechSynthesis.pending) {
            clearInterval(poll);
            finish();
          }
        } catch {
          /* ignore */
        }
        if (Date.now() - t0 > cap) {
          clearInterval(poll);
          finish();
        }
      }, 50);
    };
    if (!cached.length && !speechSynthesis.getVoices().length) {
      void loadVoices().then(say);
      return;
    }
    say();
  });
}

export function hasSpeechRecognition(): boolean {
  return Boolean(recognitionCtor());
}

export const FOLLOW_MSG = {
  recorded: "已录下你的声音，和范读对比听听看",
  denied: "没有麦克风权限",
  recordFailed: "这次没录上，再点一次试试",
} as const;

const RECORD_MIME_CANDIDATES = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];

export function pickRecorderMimeType(
  isTypeSupported: (mime: string) => boolean = defaultMimeSupported,
): string | undefined {
  return RECORD_MIME_CANDIDATES.find((mime) => {
    try {
      return isTypeSupported(mime);
    } catch {
      return false;
    }
  });
}

function defaultMimeSupported(mime: string): boolean {
  return typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
    ? MediaRecorder.isTypeSupported(mime)
    : false;
}

export type ListenResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: "unavailable" | "empty" | "timeout" | "error" | "denied" };

/**
 * Only record after recognition if we never opened a listen window.
 * Empty/timeout/error means the child already spoke into recognition —
 * starting MediaRecorder afterwards captures the tail or silence.
 */
export function shouldFallbackToRecorder(result: ListenResult): boolean {
  return !result.ok && result.reason === "unavailable";
}

const CHROMIUM_UA = /Chrome|Chromium|CriOS|EdgiOS|OPR|OPiOS|FxiOS|Android/;

/** iPad Safari (and desktop Safari) — SpeechRecognition is a 3s dead window. */
export function isSafariOrIos(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return true;
  return /Safari/.test(ua) && !CHROMIUM_UA.test(ua);
}

/** Target device records instead of recognizing. Chrome can still grade. */
export function followShouldRecordDirectly(
  ua?: string,
  maxTouchPoints?: number,
  hasRecognition = typeof window !== "undefined" ? hasSpeechRecognition() : false,
): boolean {
  if (isSafariOrIos(ua, maxTouchPoints)) return true;
  return !hasRecognition;
}

export function isMicDenied(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  const message = "message" in err ? String((err as { message: unknown }).message) : "";
  return (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError" ||
    /notallowed|permission|denied/i.test(message)
  );
}

type RecCtor = new () => {
  lang: string;
  continuous?: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionCtor(): RecCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

const DENIED_RECOGNITION_ERRORS = new Set(["not-allowed", "service-not-allowed"]);

export function listenOnce(timeoutMs = 3000, Recognition?: RecCtor): Promise<ListenResult> {
  const Ctor = Recognition ?? recognitionCtor();
  if (!Ctor) return Promise.resolve({ ok: false, reason: "unavailable" });
  return new Promise((resolve) => {
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    if (typeof rec.continuous === "boolean") rec.continuous = false;
    let done = false;
    const finish = (v: ListenResult) => {
      if (done) return;
      done = true;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    rec.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript?.trim() ?? "";
      if (transcript) finish({ ok: true, transcript });
      else finish({ ok: false, reason: "empty" });
    };
    rec.onerror = (ev) => {
      const code = ev?.error ?? "";
      if (DENIED_RECOGNITION_ERRORS.has(code)) finish({ ok: false, reason: "denied" });
      else if (code === "no-speech") finish({ ok: false, reason: "empty" });
      else finish({ ok: false, reason: "error" });
    };
    rec.onend = () => finish({ ok: false, reason: "empty" });
    try {
      rec.start();
    } catch (err) {
      finish(isMicDenied(err) ? { ok: false, reason: "denied" } : { ok: false, reason: "error" });
      return;
    }
    setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
  });
}

export function gradeFollow(target: string, heard: string | null): "很接近" | "再试一次" | "没听清" {
  if (!heard?.trim()) return "没听清";
  if (lemmaClean(target) === lemmaClean(heard)) return "很接近";
  return "再试一次";
}

function lemmaClean(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/** Call from a click handler *before* any await so iOS keeps the user-gesture. */
export function requestMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new DOMException("No mediaDevices", "NotSupportedError"));
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function releaseStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Actual mic capture after TTS. Word + a little silence; not including speak time. */
export const FOLLOW_RECORD_MS = 8000;

export function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      URL.revokeObjectURL(url);
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      resolve();
    };
    // Unplayable Safari blobs may never fire ended — don't stick on the speaker.
    const watchdog = setTimeout(finish, FOLLOW_RECORD_MS + 2500);
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    void audio.play().catch(finish);
  });
}
/** Let requestData flush before stop(). */
export const RECORDER_STOP_GAP_MS = 60;
/** Safari may fire the last ondataavailable after onstop. */
export const RECORDER_TAIL_FLUSH_MS = 80;

export function assembleAudioBlob(chunks: Blob[], mimeType: string): Blob | null {
  const blob = new Blob(chunks, { type: mimeType });
  return blob.size > 0 ? blob : null;
}

export type StoppableRecorder = {
  state: string;
  requestData?: () => void;
  stop: () => void;
};

/**
 * Flush the last encoder buffer, wait for stop, then a short tail so Safari's
 * last chunk can land. Caller must keep tracks live until this resolves.
 */
export async function flushAndStopRecorder(
  rec: StoppableRecorder,
  stopped: Promise<void>,
  delay: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  try {
    if (rec.state === "recording" && typeof rec.requestData === "function") rec.requestData();
  } catch {
    /* Safari may not implement requestData */
  }
  await delay(RECORDER_STOP_GAP_MS);
  if (rec.state === "recording" || rec.state === "paused") {
    rec.stop();
    await stopped;
  }
  await delay(RECORDER_TAIL_FLUSH_MS);
}

function wakeAudioTracks(stream: MediaStream): void {
  for (const t of stream.getAudioTracks()) {
    try {
      t.enabled = true;
    } catch {
      /* ignore */
    }
  }
}

export async function recordClip(
  ms = FOLLOW_RECORD_MS,
  existing?: MediaStream | null,
  signal?: AbortSignal,
): Promise<Blob | null> {
  const ownStream = !existing;
  const stream = existing ?? (await requestMicStream());
  wakeAudioTracks(stream);
  // Default constructor — the path that previously produced audible (if truncated) playback.
  // Forcing audio/mp4 after isTypeSupported has yielded silent/unplayable blobs on Safari.
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream);
  } catch {
    const mime = pickRecorderMimeType();
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  }
  const chunks: Blob[] = [];
  return new Promise((resolve, reject) => {
    let settled = false;
    let stopping = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => stopSoon();
    const finish = (blob: Blob | null, err?: unknown) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (ownStream) releaseStream(stream);
      if (err) reject(err);
      else resolve(blob);
    };
    rec.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    rec.onerror = () => finish(null, new Error("recorder-error"));
    const stopped = new Promise<void>((done) => {
      rec.onstop = () => done();
    });
    const stopSoon = () => {
      if (stopping || settled) return;
      stopping = true;
      void (async () => {
        try {
          await flushAndStopRecorder(rec, stopped);
          const type = rec.mimeType || "";
          finish(assembleAudioBlob(chunks, type));
        } catch (err) {
          finish(null, err);
        }
      })();
    };
    try {
      rec.start();
    } catch (err) {
      finish(null, err);
      return;
    }
    timer = setTimeout(stopSoon, ms);
    if (signal) {
      signal.addEventListener("abort", onAbort);
      if (signal.aborted) stopSoon();
    }
  });
}
