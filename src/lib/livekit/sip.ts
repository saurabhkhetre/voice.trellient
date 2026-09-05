/**
 * LiveKit SIP trunk management.
 *
 * This module wraps the LiveKit Server SDK's SIP-related APIs to provide a
 * clean interface for managing inbound/outbound trunks, dispatch rules, and
 * creating SIP participants for outbound calls.
 *
 * All operations are server-side only — never imported by the browser.
 */

import { RoomServiceClient } from "livekit-server-sdk";

/**
 * Gets a configured RoomServiceClient, or null if LiveKit is not configured.
 */
function getRoomService(): RoomServiceClient | null {
  const url = process.env["LIVEKIT_URL"];
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  if (!url || !apiKey || !apiSecret) return null;

  // RoomServiceClient needs http(s) URL, not ws(s)
  const httpUrl = url.replace("wss://", "https://").replace("ws://", "http://");
  return new RoomServiceClient(httpUrl, apiKey, apiSecret);
}

/** Create a LiveKit room with structured metadata. */
export async function createRoom(
  roomName: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const svc = getRoomService();
  if (!svc) throw new Error("LiveKit is not configured.");

  await svc.createRoom({
    name: roomName,
    metadata: JSON.stringify(metadata),
    emptyTimeout: 300,   // auto-close after 5 min if empty
    maxParticipants: 10,
  });
}

/** List active rooms (optionally filtered by name prefix). */
export async function listActiveRooms(prefix?: string) {
  const svc = getRoomService();
  if (!svc) return [];

  const rooms = await svc.listRooms();
  if (!prefix) return rooms;
  return rooms.filter((r) => r.name.startsWith(prefix));
}

/** List participants in a room. */
export async function listParticipants(roomName: string) {
  const svc = getRoomService();
  if (!svc) return [];
  return svc.listParticipants(roomName);
}

/** Delete/close a room. */
export async function deleteRoom(roomName: string): Promise<void> {
  const svc = getRoomService();
  if (!svc) return;
  await svc.deleteRoom(roomName);
}

/**
 * SIP inbound trunk configuration.
 * When Exotel (or any SIP provider) sends calls to LiveKit's SIP endpoint,
 * LiveKit uses inbound trunks + dispatch rules to route them to the right room.
 */
export interface InboundTrunkConfig {
  /** Unique name for this trunk. */
  name: string;
  /** SIP numbers that will send calls to this trunk. */
  allowedNumbers: string[];
  /** SIP addresses (Exotel's SIP domain). */
  allowedAddresses: string[];
  /** Optional auth credentials. */
  authUsername?: string;
  authPassword?: string;
}

/**
 * Dispatch rule configuration.
 * Maps incoming SIP calls to LiveKit rooms for the agent to join.
 */
export interface DispatchRuleConfig {
  /** The trunk IDs this rule applies to. */
  trunkIds: string[];
  /** Room name prefix — actual room name will be {prefix}-{callId}. */
  roomPrefix: string;
  /** Maximum call duration in seconds. */
  maxCallDuration?: number;
  /** Metadata to attach to the room (agent_config_id, business_id, etc). */
  metadata?: Record<string, unknown>;
}

/**
 * Creates an outbound SIP participant in an existing room.
 * This is how we make outbound calls: create a room → dispatch agent → create SIP participant.
 */
export interface OutboundSipConfig {
  roomName: string;
  /** SIP trunk ID to use for the outbound call. */
  sipTrunkId: string;
  /** Destination phone number in E.164 format. */
  sipCallTo: string;
  /** Identity for the SIP participant. */
  participantIdentity: string;
  /** Participant name shown in the room. */
  participantName?: string;
  /** Metadata for the participant. */
  metadata?: Record<string, unknown>;
}
