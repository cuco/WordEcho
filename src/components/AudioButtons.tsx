import { useRef, useState } from "react";
import { MicIcon, SpeakerIcon, StopIcon } from "./icons";
import {
  FOLLOW_MSG,
  FOLLOW_RECORD_MS,
  isMicDenied,
  playAudioBlob,
  recordClip,
  releaseStream,
  requestMicStream,
  speak,
  speakAndWait,
  stopSpeaking,
} from "../lib/speech";

type FollowPhase = "idle" | "speaking" | "recording" | "playing";

export function SpeakButton({
  text,
  lang,
  rate,
  size = "md",
  id,
}: {
  text: string;
  lang: string;
  rate: number;
  size?: "md" | "sm";
  id?: string;
}) {
  return (
    <button
      id={id}
      className={`iconbtn solid${size === "sm" ? " sm" : ""}`}
      aria-label="听发音"
      title="听一听"
      onClick={() => speak(text, lang, rate)}
    >
      <SpeakerIcon size={size === "sm" ? 22 : 26} />
    </button>
  );
}

export function FollowButton({
  word,
  lang,
  rate,
  onResult,
}: {
  word: string;
  lang: string;
  rate: number;
  onResult?: (msg: string) => void;
}) {
  const [phase, setPhase] = useState<FollowPhase>("idle");
  const busy = useRef(false);
  const stopRec = useRef<AbortController | null>(null);

  function onClick() {
    if (phase === "recording") {
      stopRec.current?.abort();
      return;
    }
    if (phase !== "idle" || busy.current) return;
    busy.current = true;
    // Must start getUserMedia on the click stack — awaiting TTS first drops the iOS gesture.
    const micPromise = requestMicStream();
    void runFollow(micPromise);
  }

  async function runFollow(micPromise: Promise<MediaStream>) {
    stopSpeaking();
    setPhase("speaking");
    let stream: MediaStream | null = null;
    try {
      try {
        // Keep this stream for MediaRecorder. Stopping it here then opening a
        // new one after TTS is why iPad captured silence after the last change.
        stream = await micPromise;
      } catch (err) {
        if (isMicDenied(err)) {
          onResult?.(FOLLOW_MSG.denied);
          return;
        }
      }

      await speakAndWait(word, lang, rate);
      stopSpeaking();
      await new Promise((r) => setTimeout(r, 180));

      // Do not open a second stream after TTS — iOS often yields a silent track.
      if (!stream) {
        onResult?.(FOLLOW_MSG.recordFailed);
        return;
      }

      // Always record after TTS. Chrome's SpeechRecognition used to run here
      // while the button stayed on the speaker icon, so it never turned red.
      const ac = new AbortController();
      stopRec.current = ac;
      setPhase("recording");
      onResult?.(FOLLOW_MSG.recorded);

      const blob = await recordClip(FOLLOW_RECORD_MS, stream, ac.signal);
      stopRec.current = null;
      releaseStream(stream);
      stream = null;
      if (!blob) {
        onResult?.(FOLLOW_MSG.recordFailed);
        return;
      }
      setPhase("playing");
      onResult?.(FOLLOW_MSG.recorded);
      await playAudioBlob(blob);
    } catch (err) {
      onResult?.(isMicDenied(err) ? FOLLOW_MSG.denied : FOLLOW_MSG.recordFailed);
    } finally {
      stopRec.current = null;
      releaseStream(stream);
      setPhase("idle");
      busy.current = false;
    }
  }

  const recording = phase === "recording";
  const playing = phase === "playing";
  return (
    <button
      className={`iconbtn${recording ? " listening" : ""}${playing ? " playing" : ""}`}
      aria-label={recording ? "停止录音" : "跟读"}
      aria-busy={phase !== "idle"}
      title="我来读"
      onClick={onClick}
    >
      {phase === "idle" ? <MicIcon /> : recording ? <StopIcon /> : <SpeakerIcon />}
    </button>
  );
}
