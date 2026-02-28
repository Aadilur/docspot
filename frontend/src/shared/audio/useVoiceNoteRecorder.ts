import { useEffect, useMemo, useRef, useState } from "react";

import AudioRecorderPolyfill from "audio-recorder-polyfill";
import { useReactMediaRecorder } from "react-media-recorder";

export const DEFAULT_MAX_AUDIO_SECONDS = 30;

export type VoiceNote = {
  blob: Blob;
  durationSec: number;
};

function clampNonNegative(n: number) {
  return n < 0 ? 0 : n;
}

function createObjectUrlSafe(blob: Blob) {
  return URL.createObjectURL(blob);
}

// Some browsers (notably older Safari versions) don't ship MediaRecorder.
// This polyfill records to WAV and allows the voice note feature to work.
if (
  typeof window !== "undefined" &&
  typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder ===
    "undefined"
) {
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder =
    AudioRecorderPolyfill as unknown as any;
}

function humanizeRecorderError(message: string) {
  const m = message.toLowerCase();
  if (
    m.includes("permission") ||
    m.includes("notallowederror") ||
    m.includes("denied")
  ) {
    return "permission";
  }
  if (m.includes("notfounderror") || m.includes("no_specified_media_found")) {
    return "notfound";
  }
  if (m.includes("notreadableerror") || m.includes("trackstarterror")) {
    return "busy";
  }
  if (m.includes("overconstrainederror")) {
    return "constraints";
  }
  if (m.includes("security") || m.includes("secure")) {
    return "secure";
  }
  return "generic";
}

async function hasAudioInputDevice() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return true;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === "audioinput");
  } catch {
    return true;
  }
}

async function getMicrophonePermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  try {
    const navAny = navigator as any;
    if (!navAny.permissions?.query) return "unknown";
    const result = await navAny.permissions.query({ name: "microphone" });
    if (result?.state === "granted") return "granted";
    if (result?.state === "denied") return "denied";
    if (result?.state === "prompt") return "prompt";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export type VoiceErrorKind =
  | "permission"
  | "secure"
  | "notfound"
  | "busy"
  | "notsupported"
  | "generic";

export function useVoiceNoteRecorder(params: {
  t: (key: string, opts?: any) => string;
  maxSeconds?: number;
}) {
  const maxSeconds = params.maxSeconds ?? DEFAULT_MAX_AUDIO_SECONDS;

  const [voiceErrorKind, setVoiceErrorKind] = useState<VoiceErrorKind | null>(
    null,
  );
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(
    null,
  );
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false);

  const [recordSecondsLeft, setRecordSecondsLeft] = useState(maxSeconds);
  const [recording, setRecording] = useState(false);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartedAtMsRef = useRef<number | null>(null);

  const [note, setNote] = useState<VoiceNote | null>(null);

  const audioUrl = useMemo(() => {
    if (!note) return null;
    return createObjectUrlSafe(note.blob);
  }, [note]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const recordedDurationSec = useMemo(() => {
    if (!note) return 0;
    return clampNonNegative(Math.round(note.durationSec));
  }, [note]);

  const stopTimer = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const {
    startRecording,
    stopRecording,
    error: recorderError,
  } = useReactMediaRecorder({
    audio: true,
    askPermissionOnMount: false,
    onStop: (_blobUrl, blob) => {
      if (!blob) return;
      const startedAt = recordStartedAtMsRef.current;
      const duration = startedAt
        ? Math.min(maxSeconds, Math.round((Date.now() - startedAt) / 1000))
        : 0;
      setNote({ blob, durationSec: clampNonNegative(duration) });
    },
  });

  useEffect(() => {
    if (!recorderError) return;
    stopTimer();
    recordStartedAtMsRef.current = null;
    setRecording(false);

    const kind = humanizeRecorderError(recorderError);
    if (kind === "permission") {
      setVoiceErrorKind("permission");
      setVoiceErrorMessage(params.t("micPermissionDenied"));
      setVoiceHelpOpen(false);
    } else if (kind === "notfound") {
      setVoiceErrorKind("notfound");
      setVoiceErrorMessage(params.t("micNotFound"));
    } else if (kind === "secure") {
      setVoiceErrorKind("secure");
      setVoiceErrorMessage(params.t("micNeedsSecureContext"));
    } else if (kind === "busy") {
      setVoiceErrorKind("busy");
      setVoiceErrorMessage(params.t("micBusy"));
    } else {
      setVoiceErrorKind("generic");
      setVoiceErrorMessage(params.t("micGenericError"));
    }
  }, [recorderError, maxSeconds, params]);

  const beginRecord = async () => {
    setVoiceErrorKind(null);
    setVoiceErrorMessage(null);
    setVoiceHelpOpen(false);

    if (!window.isSecureContext) {
      setVoiceErrorKind("secure");
      setVoiceErrorMessage(params.t("micNeedsSecureContext"));
      return;
    }

    const canUseMic =
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    if (!canUseMic) {
      setVoiceErrorKind("notsupported");
      setVoiceErrorMessage(params.t("micNotSupported"));
      return;
    }

    const perm = await getMicrophonePermissionState();
    if (perm === "denied") {
      setVoiceErrorKind("permission");
      setVoiceErrorMessage(params.t("micPermissionDenied"));
      return;
    }

    const hasDevice = await hasAudioInputDevice();
    if (!hasDevice) {
      setVoiceErrorKind("notfound");
      setVoiceErrorMessage(params.t("micNotFound"));
      return;
    }

    setNote(null);
    setRecordSecondsLeft(maxSeconds);
    setRecording(true);
    recordStartedAtMsRef.current = Date.now();

    stopTimer();

    try {
      startRecording();
    } catch {
      stopTimer();
      recordStartedAtMsRef.current = null;
      setRecording(false);
      setVoiceErrorKind("generic");
      setVoiceErrorMessage(params.t("micGenericError"));
      return;
    }

    recordTimerRef.current = window.setInterval(() => {
      setRecordSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          stopTimer();
          setRecording(false);
          stopRecording();
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const endRecord = () => {
    stopTimer();
    setRecording(false);
    stopRecording();
  };

  const clearNote = () => setNote(null);

  return {
    note,
    audioUrl,
    recordedDurationSec,
    recording,
    recordSecondsLeft,
    voiceErrorKind,
    voiceErrorMessage,
    voiceHelpOpen,
    setVoiceHelpOpen,
    beginRecord,
    endRecord,
    clearNote,
  };
}
