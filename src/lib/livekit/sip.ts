/**
 * LiveKit SIP trunk management.
 *
 * This module wraps the LiveKit Server SDK's SIP-related APIs to provide a
 * clean interface for managing inbound/outbound trunks, dispatch rules, and
 * creating SIP participants for outbound calls.
 *
 * All operations are server-side only — never imported by the browser.
 */

import { RoomServiceClient, SipClient } from "livekit-server-sdk";

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
export async function createRoom(roomName: string, metadata: Record<string, unknown>): Promise<void> {
  const svc = getRoomService();
  if (!svc) throw new Error("LiveKit is not configured.");

  await svc.createRoom({
    name: roomName,
    metadata: JSON.stringify(metadata),
    emptyTimeout: 300, // auto-close after 5 min if empty
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
  /** Room name prefix. LiveKit appends the callee number and a random suffix. */
  roomPrefix: string;
  /** Metadata to attach to the room (static only — see ROOM_NAMING below). */
  metadata?: Record<string, unknown>;
}

/**
 * ROOM NAMING — the contract between the caller's SIP leg and the agent.
 *
 * LiveKit names the room, and nothing else tries to predict that name.
 *
 * A `callee` dispatch rule with `randomize: true` produces
 * `call-<callee number>-<random>`, so two people ringing the same business
 * number get two rooms instead of being dropped into one and hearing each
 * other. The cost is that the name is not knowable ahead of the INVITE.
 *
 * So the agent does not receive its context in room metadata on an inbound
 * call. It reads the dialled number off the SIP participant
 * (`sip.trunkPhoneNumber`) and looks the workspace up itself. The webhook
 * records the call row and nothing more.
 *
 * The alternative — `randomize: false`, giving a deterministic
 * `call-<number>` that both sides can compute — was rejected: it only works
 * while a business never has two calls at once, and the failure is two
 * strangers in the same conversation.
 */
export const SIP_ROOM_PREFIX = "call";

/** Creates a SIP client, or null when LiveKit is not configured. */
function getSipClient(): SipClient | null {
  const url = process.env["LIVEKIT_URL"];
  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  if (!url || !apiKey || !apiSecret) return null;
  return new SipClient(url.replace(/^ws/, "http"), apiKey, apiSecret);
}

/**
 * Creates the inbound trunk that accepts calls from the carrier.
 *
 * `allowedAddresses` is the security boundary: without it the trunk answers
 * SIP from anywhere on the internet, and anyone who learns the URI can place
 * calls that run the agent on your account.
 *
 * Returns the trunk id to put in LIVEKIT_SIP_INBOUND_TRUNK_ID.
 */
export async function createInboundTrunk(config: InboundTrunkConfig): Promise<string> {
  const sip = getSipClient();
  if (!sip) throw new Error("LiveKit is not configured.");
  if (config.allowedAddresses.length === 0) {
    throw new Error("An inbound trunk needs allowedAddresses, or it accepts SIP from anywhere.");
  }

  const trunk = await sip.createSipInboundTrunk(config.name, config.allowedNumbers, {
    allowedAddresses: config.allowedAddresses,
    ...(config.authUsername ? { authUsername: config.authUsername } : {}),
    ...(config.authPassword ? { authPassword: config.authPassword } : {}),
  });
  return trunk.sipTrunkId;
}

/**
 * Creates the dispatch rule that puts an inbound call into a room.
 *
 * See ROOM_NAMING above for why this is `callee` + randomize rather than a
 * fixed or predictable name.
 */
export async function createDispatchRule(config: DispatchRuleConfig): Promise<string> {
  const sip = getSipClient();
  if (!sip) throw new Error("LiveKit is not configured.");

  const rule = await sip.createSipDispatchRule(
    { type: "callee", roomPrefix: config.roomPrefix, randomize: true },
    {
      trunkIds: config.trunkIds,
      name: `${config.roomPrefix} inbound`,
      ...(config.metadata ? { metadata: JSON.stringify(config.metadata) } : {}),
    },
  );
  return rule.sipDispatchRuleId;
}

/** Existing inbound trunks and dispatch rules, for idempotent setup. */
export async function listInboundTrunks() {
  const sip = getSipClient();
  return sip ? sip.listSipInboundTrunk() : [];
}

export async function listDispatchRules() {
  const sip = getSipClient();
  return sip ? sip.listSipDispatchRule() : [];
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
