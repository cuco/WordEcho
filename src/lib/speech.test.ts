import { describe, expect, it, vi } from "vitest";
import {
  FOLLOW_MSG,
  FOLLOW_RECORD_MS,
  assembleAudioBlob,
  flushAndStopRecorder,
  followShouldRecordDirectly,
  gradeFollow,
  isMicDenied,
  isSafariOrIos,
  listenOnce,
  pickRecorderMimeType,
  recordClip,
  shouldFallbackToRecorder,
  type ListenResult,
} from "./speech";

describe("gradeFollow", () => {
  it("treats empty or null as 没听清", () => {
    expect(gradeFollow("apple", null)).toBe("没听清");
    expect(gradeFollow("apple", "")).toBe("没听清");
    expect(gradeFollow("apple", "   ")).toBe("没听清");
  });

  it("matches ignoring case and punctuation", () => {
    expect(gradeFollow("Apple", "apple!")).toBe("很接近");
    expect(gradeFollow("ice-cream", "Ice Cream")).toBe("很接近");
  });

  it("mismatched words are 再试一次", () => {
    expect(gradeFollow("apple", "banana")).toBe("再试一次");
  });
});

describe("pickRecorderMimeType", () => {
  it("prefers mp4 then aac then webm", () => {
    expect(pickRecorderMimeType((m) => m === "audio/webm")).toBe("audio/webm");
    expect(pickRecorderMimeType((m) => m === "audio/aac" || m === "audio/webm")).toBe("audio/aac");
    expect(pickRecorderMimeType(() => true)).toBe("audio/mp4");
  });

  it("returns undefined when nothing is supported", () => {
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
  });
});

describe("shouldFallbackToRecorder", () => {
  it("only records when recognition never opened a listen window", () => {
    const fail = (reason: Extract<ListenResult, { ok: false }>["reason"]): ListenResult => ({
      ok: false,
      reason,
    });
    expect(shouldFallbackToRecorder(fail("unavailable"))).toBe(true);
    expect(shouldFallbackToRecorder(fail("empty"))).toBe(false);
    expect(shouldFallbackToRecorder(fail("timeout"))).toBe(false);
    expect(shouldFallbackToRecorder(fail("error"))).toBe(false);
    expect(shouldFallbackToRecorder(fail("denied"))).toBe(false);
  });

  it("does not fall back on a real transcript", () => {
    expect(shouldFallbackToRecorder({ ok: true, transcript: "cat" })).toBe(false);
  });
});

describe("isMicDenied", () => {
  it("recognizes common permission errors", () => {
    expect(isMicDenied({ name: "NotAllowedError" })).toBe(true);
    expect(isMicDenied({ name: "SecurityError" })).toBe(true);
    expect(isMicDenied({ name: "NotFoundError" })).toBe(false);
    expect(isMicDenied({ name: "AbortError", message: "Permission denied" })).toBe(true);
  });
});

describe("listenOnce", () => {
  it("returns denied when recognition reports not-allowed", async () => {
    class Fake {
      lang = "";
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((ev: { results: { 0: { 0: { transcript: string } } } }) => void) | null = null;
      onerror: ((ev: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onerror?.({ error: "not-allowed" });
      }
      stop() {}
    }
    await expect(listenOnce(50, Fake)).resolves.toEqual({ ok: false, reason: "denied" });
  });

  it("returns a transcript when recognition succeeds", async () => {
    class Fake {
      lang = "";
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((ev: { results: { 0: { 0: { transcript: string } } } }) => void) | null = null;
      onerror: ((ev: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onresult?.({ results: { 0: { 0: { transcript: "  Apple " } } } });
      }
      stop() {}
    }
    await expect(listenOnce(50, Fake)).resolves.toEqual({ ok: true, transcript: "Apple" });
  });

  it("treats empty / no-speech as empty so the UI can fall back", async () => {
    class Empty {
      lang = "";
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((ev: { results: { 0: { 0: { transcript: string } } } }) => void) | null = null;
      onerror: ((ev: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onerror?.({ error: "no-speech" });
      }
      stop() {}
    }
    await expect(listenOnce(50, Empty)).resolves.toEqual({ ok: false, reason: "empty" });
  });
});

describe("FOLLOW_MSG", () => {
  it("never uses 没听清 for recording or permission", () => {
    expect(FOLLOW_MSG.recorded).not.toContain("没听清");
    expect(FOLLOW_MSG.denied).toBe("没有麦克风权限");
    expect(FOLLOW_MSG.recordFailed).not.toContain("没听清");
  });
});

describe("isSafariOrIos / followShouldRecordDirectly", () => {
  const ipad =
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const macSafari =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const chrome =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  it("treats iPad and Safari as record-first", () => {
    expect(isSafariOrIos(ipad)).toBe(true);
    expect(isSafariOrIos(macSafari, 0)).toBe(true);
    expect(isSafariOrIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", 5)).toBe(true);
    expect(followShouldRecordDirectly(ipad, 5, true)).toBe(true);
    expect(followShouldRecordDirectly(macSafari, 0, true)).toBe(true);
  });

  it("keeps recognition on Chrome when the API exists", () => {
    expect(isSafariOrIos(chrome)).toBe(false);
    expect(followShouldRecordDirectly(chrome, 0, true)).toBe(false);
    expect(followShouldRecordDirectly(chrome, 0, false)).toBe(true);
  });
});

describe("assembleAudioBlob", () => {
  it("returns null for empty chunks or zero-size data", () => {
    expect(assembleAudioBlob([], "audio/mp4")).toBeNull();
    expect(assembleAudioBlob([new Blob([])], "audio/mp4")).toBeNull();
  });

  it("joins chunks and keeps the mime type", () => {
    const blob = assembleAudioBlob([new Blob(["ab"]), new Blob(["cd"])], "audio/mp4");
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe("audio/mp4");
    expect(blob?.size).toBe(4);
  });
});

describe("flushAndStopRecorder", () => {
  it("requestData then stop, waits for onstop before returning", async () => {
    const calls: string[] = [];
    let state = "recording";
    const rec = {
      get state() {
        return state;
      },
      requestData() {
        calls.push("requestData");
      },
      stop() {
        calls.push("stop");
        state = "inactive";
        markStopped();
      },
    };
    let markStopped: () => void = () => {};
    const stopped = new Promise<void>((r) => {
      markStopped = r;
    });
    const delays: number[] = [];
    const delay = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };

    await flushAndStopRecorder(rec, stopped, delay);

    expect(calls).toEqual(["requestData", "stop"]);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBeGreaterThan(0);
  });

  it("does not stop tracks itself — caller keeps the stream until flush returns", async () => {
    const rec = {
      state: "inactive",
      requestData() {},
      stop() {
        throw new Error("should not stop inactive recorder");
      },
    };
    await flushAndStopRecorder(rec, Promise.resolve(), async () => {});
  });
});

describe("FOLLOW_RECORD_MS", () => {
  it("is long enough for a word after the listening indicator", () => {
    expect(FOLLOW_RECORD_MS).toBeGreaterThanOrEqual(3500);
    expect(FOLLOW_RECORD_MS).toBeLessThanOrEqual(4500);
  });
});

describe("recordClip", () => {
  it("records on the provided stream, default constructor, and does not stop tracks", async () => {
    const stop = vi.fn();
    const track = { stop, enabled: false, readyState: "live" };
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream;
    const constructed: unknown[] = [];

    class FakeRecorder {
      mimeType = "audio/webm";
      state = "inactive";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(used: MediaStream, opts?: { mimeType?: string }) {
        constructed.push({ used, opts });
      }
      start(timeslice?: number) {
        expect(timeslice).toBeUndefined();
        this.state = "recording";
      }
      requestData() {
        this.ondataavailable?.({ data: new Blob(["chunk"]) });
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["tail"]) });
        this.onstop?.();
      }
    }

    vi.stubGlobal("MediaRecorder", FakeRecorder);
    try {
      const blob = await recordClip(5, stream);
      expect(constructed).toEqual([{ used: stream, opts: undefined }]);
      expect(stop).not.toHaveBeenCalled();
      expect(track.enabled).toBe(true);
      expect(blob?.size).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
