"use client";

/**
 * SessionManager + AgentStateManager for the Next.js frontend.
 * Mirrors src/hooks/useVoiceSession.ts in the TanStack app.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
} from "livekit-client";

import {
  AGENT_STATE_ATTRIBUTE,
  SESSION_ENDPOINT,
  TRANSCRIPTION_TOPIC,
  type AgentState,
  type ConnectionStatus,
  type VoiceSessionCredentials,
} from "@shared/voice-contract";

export interface TranscriptEntry {
  id: string;
  role: "user" | "agent";
  text: string;
  final: boolean;
}

const AGENT_WAIT_MS = 15_000;

export function useVoiceSession() {
  const roomRef = useRef<Room | null>(null);
  const agentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [agentState, setAgentState] = useState<AgentState>("unknown");
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [agentAudioTrack, setAgentAudioTrack] = useState<RemoteAudioTrack | null>(null);

  const clearAgentTimer = () => {
    if (agentTimerRef.current) {
      clearTimeout(agentTimerRef.current);
      agentTimerRef.current = null;
    }
  };

  const disconnect = useCallback(async () => {
    clearAgentTimer();
    const room = roomRef.current;
    roomRef.current = null;
    setAgentAudioTrack(null);
    setAgentState("unknown");
    setStatus("disconnected");
    if (room) await room.disconnect();
  }, []);

  const connect = useCallback(async () => {
    if (roomRef.current) return;
    setError(null);
    setTranscript([]);

    try {
      // 1. Microphone permission — surfaced before any network work.
      setStatus("requesting-mic");
      const micTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
      });

      // 2. Server-issued join token. No API keys ever reach the browser.
      setStatus("issuing-token");
      const response = await fetch(SESSION_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not create a voice session.");
      }
      const credentials = (await response.json()) as VoiceSessionCredentials;

      // 3. Connect over WebRTC.
      setStatus("connecting");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      attachListeners(room);

      await room.connect(credentials.serverUrl, credentials.token);
      await room.localParticipant.publishTrack(micTrack);
      setMicEnabled(true);

      // 4. Wait for the agent worker to join the room.
      setStatus("waiting-for-agent");
      clearAgentTimer();
      agentTimerRef.current = setTimeout(() => {
        if (roomRef.current === room && !hasAgent(room)) {
          setError("The voice agent did not join. Make sure the agent worker is running.");
          setStatus("error");
        }
      }, AGENT_WAIT_MS);
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings and try again."
          : cause instanceof Error
            ? cause.message
            : "Something went wrong starting the conversation.";
      setError(message);
      setStatus("error");
      await disconnect();
      setStatus("error");
    }

    function attachListeners(room: Room) {
      room
        .on(RoomEvent.ParticipantConnected, (participant) => {
          if (isAgent(participant.identity)) {
            clearAgentTimer();
            setStatus("connected");
            setAgentState(readAgentState(participant.attributes));
          }
        })
        .on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
          if (isAgent(participant.identity)) {
            setAgentState(readAgentState(participant.attributes));
          }
        })
        .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Audio && isAgent(participant.identity)) {
            setAgentAudioTrack(track as RemoteAudioTrack);
            (track as RemoteAudioTrack).attach();
            setStatus("connected");
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) setAgentAudioTrack(null);
        })
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Reconnecting) setStatus("reconnecting");
          if (state === ConnectionState.Connected && hasAgent(room)) setStatus("connected");
        })
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setStatus("disconnected");
          setAgentState("unknown");
        });

      room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, async (reader, info) => {
        const id = reader.info.id;
        const role: TranscriptEntry["role"] = isAgent(info.identity) ? "agent" : "user";
        let text = "";
        for await (const chunk of reader) {
          text += chunk;
          upsert({ id, role, text, final: false });
        }
        upsert({ id, role, text, final: true });
      });
    }

    function upsert(entry: TranscriptEntry) {
      setTranscript((prev) => {
        const index = prev.findIndex((item) => item.id === entry.id);
        if (index === -1) return [...prev, entry];
        const next = [...prev];
        next[index] = entry;
        return next;
      });
    }
  }, [disconnect]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }, [micEnabled]);

  useEffect(() => () => void disconnect(), [disconnect]);

  return {
    status,
    agentState,
    micEnabled,
    error,
    transcript,
    agentAudioTrack,
    connect,
    disconnect,
    toggleMic,
  };
}

function isAgent(identity: string | undefined) {
  return Boolean(identity && identity.startsWith("agent"));
}

function hasAgent(room: Room) {
  return [...room.remoteParticipants.values()].some((p) => isAgent(p.identity));
}

function readAgentState(attributes: Record<string, string>): AgentState {
  const raw = attributes[AGENT_STATE_ATTRIBUTE];
  switch (raw) {
    case "listening":
    case "thinking":
    case "speaking":
    case "initializing":
      return raw;
    default:
      return "unknown";
  }
}
