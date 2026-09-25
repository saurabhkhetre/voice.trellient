/**
 * Response shapes for the Spring Boot API (services/api).
 *
 * These types started life inside the TanStack server functions, where they
 * described what a handler returned. The frontend now calls Spring instead, so
 * they live here as the contract the two sides agree on: every one was verified
 * against a real response during the migration (see MIGRATION.md), and the
 * Java controller that produces it is named above each group.
 *
 * Types only — no runtime code, so importing this costs nothing in the bundle.
 */

import type { Database } from "@/lib/db/types";

/* ---------------------------------------------------------------- auth ----
 * AuthController: /api/auth/**
 */

/** GET /api/auth/me, POST /api/auth/signin, POST /api/auth/signup. */
export interface CurrentUser {
  id: string;
  email: string;
}

/* ------------------------------------------------------------ business ----
 * BusinessController: /api/business/**
 */

export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type BusinessRole = Database["public"]["Enums"]["business_role"];

/** GET /api/business/context. The API answers 204 when the user has no workspace. */
export interface BusinessContextPayload {
  business: Business;
  role: BusinessRole;
  userId: string;
  email: string | null;
}

/** GET /api/business/team. */
export interface TeamMember {
  id: string;
  role: BusinessRole;
  authUserId: string;
  createdAt: string | null;
}

/** POST /api/business/provision — idempotent; `created` is false for an existing member. */
export interface ProvisionResult {
  businessId: string;
  created: boolean;
}

/* --------------------------------------------------------------- stats ----
 * AnalyticsController: /api/stats/**
 */

/** GET /api/stats/analytics?range. */
export interface AnalyticsStats {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  failedCalls: number;
  totalMinutes: number;
  avgDuration: number;
  escalationCount: number;
  escalationRate: number;
  containmentRate: number;
  topIntents: Array<{ intent: string; count: number }>;
  callsByDirection: { inbound: number; outbound: number };
  callsByStatus: Record<string, number>;
}

/** GET /api/stats/dashboard. */
export interface DashboardStats {
  callsToday: number;
  activeCalls: number;
  activeAgents: number;
  openEscalations: number;
}

/** GET /api/stats/recent-calls. */
export interface RecentCall {
  id: string;
  startedAt: string | null;
  durationSeconds: number | null;
  callerNumber: string | null;
  status: string;
  customerName: string | null;
}

/* --------------------------------------------------------------- calls ----
 * CallsController: /api/calls/**
 */

export type CallScope = "recent" | "active" | "finished";

/** GET /api/calls?businessId&scope. */
export interface CallSummary {
  id: string;
  callerNumber: string | null;
  destinationNumber: string | null;
  customerName: string | null;
  agentConfigId: string | null;
  roomName: string | null;
  status: string;
  direction: string;
  provider: string;
  startedAt: string;
  durationSeconds: number | null;
  language: string | null;
  intent: string | null;
  outcome: string | null;
  summary: string | null;
  toolsUsed: string[];
  escalationRequired: boolean;
  latencyMs: number | null;
}

/** GET /api/calls/by-agent/{agentConfigId} — a narrower projection than CallSummary. */
export interface AgentCall {
  id: string;
  callerNumber: string | null;
  startedAt: string;
  durationSeconds: number | null;
  status: string;
  language: string | null;
  outcome: string | null;
  summary: string | null;
  escalationRequired: boolean;
}

export interface TranscriptLine {
  id: string;
  speaker: string;
  text: string;
  timestamp: string | null;
}

/** GET /api/calls/{callId}. */
export interface CallDetail {
  transcripts: TranscriptLine[];
  events: Array<{ id: string; eventType: string; createdAt: string | null }>;
}

/* ------------------------------------------------------------- records ----
 * RecordsController: /api/records/**
 */

/**
 * The business-scoped tables the generic record editor may touch. This was
 * `keyof typeof RECORD_SCHEMAS` when the schema lived in TypeScript; the
 * allow-list now lives in RecordsController.RECORD_SCHEMAS, so the union is
 * spelled out and must be kept in step with it.
 */
export type RecordTable = "customers" | "business_policies" | "agent_knowledge";

/** Every column in the record schemas is text, a number or a boolean. */
export type RecordValue = string | number | boolean | null;
export type RecordRow = { id: string } & Record<string, RecordValue>;

/* -------------------------------------------------------------- alerts ----
 * AlertsController: /api/alerts/**
 */

/** GET /api/alerts?businessId. */
export interface AlertRule {
  id: string;
  name: string;
  conditionType: string;
  conditionConfig: Record<string, string | number>;
  notificationChannels: string[];
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string | null;
}

/* ------------------------------------------------------- phone numbers ----
 * PhoneNumberController: /api/phone-numbers/**
 */

export interface PhoneNumber {
  id: string;
  phoneNumber: string;
  label: string | null;
  provider: string;
  agentConfigId: string | null;
  inboundEnabled: boolean;
  active: boolean;
  createdAt: string | null;
}

/* --------------------------------------------------------- agent tools ----
 * AgentToolController: /api/agents/{id}/tools, /api/agents/tools/{toolId}
 */

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  toolType: string;
  enabled: boolean;
}

export interface AgentToolPatch {
  name?: string;
  description?: string;
  enabled?: boolean;
}

/* --------------------------------------------------------------- voice ----
 * VoiceController: /api/voice/**
 *
 * Both of these were discriminated unions (`{ ok: true } | { ok: false }`) when
 * a server function returned them on HTTP 200. Spring reports failure with a
 * status code instead, which the client throws as an ApiError, so only the
 * success shape is ever received and the union arms are gone.
 */

/** POST /api/voice/monitor — a listen-only, hidden LiveKit token. */
export interface MonitorToken {
  token: string;
  serverUrl: string;
  roomName: string;
  identity: string;
}

/** POST /api/voice/test-call — a publish/subscribe token for the browser test call. */
export interface TestCallToken {
  token: string;
  serverUrl: string;
  roomName: string;
  identity: string;
}
