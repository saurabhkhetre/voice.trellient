import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
} from "livekit-client";

import { apiPost } from "@/lib/api/client";
import { type TestCallToken } from "@/lib/api/contracts";
import {
  AGENT_STATE_ATTRIBUTE,
  TRANSCRIPTION_TOPIC,
  type AgentState,
  type ConnectionStatus,
  type TranscriptEntry,
} from "@/lib/voice/contract";

const AGENT_WAIT_MS = 30_000;

/** SessionManager + AgentStateManager for the in-dashboard web test call. */
export function useVoiceSession() {
  const roomRef = useRef<Room | null>(null);
  const agentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [agentState, setAgentState] = useState<AgentState>("unknown");
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Always empty since the move to Spring, and kept because TestCallPanel
  // renders it. The web app read LIVEKIT_* straight from process.env and could
  // name the unset ones; the API resolves them through application.yml, which
  // supplies dev defaults, so "unset" is not a state it can observe. A
  // misconfigured deployment now surfaces as the room-creation error instead.
  const [missingConfig, setMissingConfig] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [level, setLevel] = useState(0);

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
    setAgentState("unknown");
    setLevel(0);
    setStatus("disconnected");
    if (room) {
      // Stop all local media tracks to release microphone
      for (const pub of room.localParticipant.audioTrackPublications.values()) {
        pub.track?.mediaStreamTrack?.stop();
      }
      await room.disconnect();
    }
  }, []);

  const connect = useCallback(
    async (agentConfigId: string) => {
      if (roomRef.current) return;
      setError(null);
      setMissingConfig([]);
      setTranscript([]);

      try {
        setStatus("requesting-mic");
        const micTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });

        setStatus("issuing-token");
        // Spring: POST /api/voice/test-call — creates the call row and the
        // LiveKit room, then mints the join token. A refusal (not a member of
        // the agent's workspace, agent gone, room unreachable) arrives as an
        // ApiError and is caught below.
        const session = await apiPost<TestCallToken>("/voice/test-call", { agentConfigId });

        setStatus("connecting");
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        attachListeners(room);

        await room.connect(session.serverUrl, session.token);
        // Name the source explicitly. An unlabelled track is published as
        // SOURCE_UNKNOWN, and the agent accepts microphone audio only, so it
        // would greet the caller and then hear nothing they say.
        await room.localParticipant.publishTrack(micTrack.mediaStreamTrack, {
          source: Track.Source.Microphone,
        });
        setMicEnabled(true);

        setStatus("waiting-for-agent");
        clearAgentTimer();
        agentTimerRef.current = setTimeout(() => {
          if (roomRef.current === room && !hasAgent(room)) {
            setError("The agent worker did not join this room. Start the voice runtime and try again.");
            setStatus("error");
          }
        }, AGENT_WAIT_MS);
      } catch (cause) {
        const message =
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Microphone access was blocked. Allow it in your browser settings and try again."
            : cause instanceof Error
              ? cause.message
              : "Something went wrong starting the test call.";
        await disconnect();
        setError(message);
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
            if (isAgent(participant.identity)) setAgentState(readAgentState(participant.attributes));
          })
          .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
            if (track.kind === Track.Kind.Audio && isAgent(participant.identity)) {
              (track as RemoteAudioTrack).attach();
              setStatus("connected");
            }
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            setLevel(speakers.length ? Math.max(...speakers.map((s) => s.audioLevel)) : 0);
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
    },
    [disconnect],
  );

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    // Mute the track we published, rather than setMicrophoneEnabled, which
    // publishes a second track of its own when the mic was published by hand.
    for (const pub of room.localParticipant.audioTrackPublications.values()) {
      if (next) await pub.track?.unmute();
      else await pub.track?.mute();
    }
    setMicEnabled(next);
  }, [micEnabled]);

  useEffect(() => () => void disconnect(), [disconnect]);

  return {
    status,
    agentState,
    micEnabled,
    error,
    missingConfig,
    transcript,
    level,
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
  switch (attributes[AGENT_STATE_ATTRIBUTE]) {
    case "listening":
    case "thinking":
    case "speaking":
    case "initializing":
      return attributes[AGENT_STATE_ATTRIBUTE] as AgentState;
    default:
      return "unknown";
  }
}
