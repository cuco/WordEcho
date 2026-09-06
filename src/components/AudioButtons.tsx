import { useRef, useState } from "react";
import { MicIcon, SpeakerIcon } from "./icons";
import {
  FOLLOW_MSG,
  FOLLOW_RECORD_MS,
  followShouldRecordDirectly,
  gradeFollow,
  isMicDenied,
  listenOnce,
  playAudioBlob,
  recordClip,
  releaseStream,
  requestMicStream,
  shouldFallbackToRecorder,
  speak,
  speakAndWait,
  stopSpeaking,
} from "../lib/speech";

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
  const [listening, setListening] = useState(false);
  const busy = useRef(false);

  function go() {
    if (busy.current) return;
    busy.current = true;
    // Must start getUserMedia on the click stack — awaiting TTS first drops the iOS gesture.
    const micPromise = requestMicStream();
    void runFollow(micPromise);
  }

  async function runFollow(micPromise: Promise<MediaStream>) {
    stopSpeaking();
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

      // Red mic = speak now. Capture starts here, not during TTS.
      setListening(true);

      if (!followShouldRecordDirectly()) {
        const heard = await listenOnce();
        if (heard.ok) {
          onResult?.(gradeFollow(word, heard.transcript));
          return;
        }
        if (heard.reason === "denied") {
          onResult?.(FOLLOW_MSG.denied);
          return;
        }
        // Recognition already used the utterance window — do not record late.
        if (!shouldFallbackToRecorder(heard)) {
          onResult?.(FOLLOW_MSG.recordFailed);
          return;
        }
      }

      const blob = await recordClip(FOLLOW_RECORD_MS, stream);
      releaseStream(stream);
      stream = null;
      if (!blob) {
        onResult?.(FOLLOW_MSG.recordFailed);
        return;
      }
      playAudioBlob(blob);
      onResult?.(FOLLOW_MSG.recorded);
    } catch (err) {
      onResult?.(isMicDenied(err) ? FOLLOW_MSG.denied : FOLLOW_MSG.recordFailed);
    } finally {
      releaseStream(stream);
      setListening(false);
      busy.current = false;
    }
  }

  return (
    <button
      className={`iconbtn${listening ? " listening" : ""}`}
      aria-label="跟读"
      title="我来读"
      onClick={go}
    >
      <MicIcon />
    </button>
  );
}
