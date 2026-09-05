/**
 * Telephony provider abstraction.
 *
 * The runtime never talks to a vendor directly: it asks a provider for an
 * inbound-call description and for control actions (transfer, hangup). Adding
 * a second vendor means adding one adapter, nothing else changes.
 */

export interface InboundCall {
  providerCallId: string;
  callerNumber: string | null;
  destinationNumber: string | null;
  /** Room the agent worker should join for this call. */
  roomName: string;
  startedAt: string;
}

export interface TransferRequest {
  providerCallId: string;
  toNumber: string;
  reason?: string;
}

export interface TelephonyProvider {
  readonly name: string;
  /** True when every credential the adapter needs is configured. */
  isConfigured(): boolean;
  /** Normalise a vendor webhook payload into an InboundCall. */
  parseInbound(payload: Record<string, unknown>): InboundCall;
  /** Warm transfer to a human. */
  transfer(request: TransferRequest): Promise<{ ok: boolean; detail?: string }>;
  hangup(providerCallId: string): Promise<{ ok: boolean; detail?: string }>;
}

export function roomNameForCall(providerCallId: string) {
  return `call-${providerCallId}`.slice(0, 60);
}
