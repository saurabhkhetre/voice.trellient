import {
  roomNameForCall,
  type InboundCall,
  type TelephonyProvider,
  type TransferRequest,
} from "./provider";

/**
 * Exotel adapter. Credentials are read on the server only; the browser never
 * sees them. Until the account exists, isConfigured() is false and the runtime
 * falls back to browser test calls.
 */
export function createExotelProvider(): TelephonyProvider {
  const sid = process.env["EXOTEL_SID"];
  const apiKey = process.env["EXOTEL_API_KEY"];
  const apiToken = process.env["EXOTEL_API_TOKEN"];
  const subdomain = process.env["EXOTEL_SUBDOMAIN"] ?? "api.exotel.com";

  function auth() {
    return "Basic " + Buffer.from(`${apiKey}:${apiToken}`).toString("base64");
  }

  async function call(path: string, body: Record<string, string>) {
    if (!sid || !apiKey || !apiToken) return { ok: false, detail: "Exotel is not configured." };
    const response = await fetch(`https://${subdomain}/v1/Accounts/${sid}/${path}`, {
      method: "POST",
      headers: { Authorization: auth(), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
    if (!response.ok) return { ok: false, detail: `Exotel responded ${response.status}` };
    return { ok: true };
  }

  return {
    name: "exotel",
    isConfigured: () => Boolean(sid && apiKey && apiToken),
    parseInbound(payload) {
      const providerCallId = String(payload["CallSid"] ?? payload["callSid"] ?? crypto.randomUUID());
      const inbound: InboundCall = {
        providerCallId,
        callerNumber: str(payload["From"] ?? payload["CallFrom"]),
        destinationNumber: str(payload["To"] ?? payload["CallTo"]),
        roomName: roomNameForCall(providerCallId),
        startedAt: new Date().toISOString(),
      };
      return inbound;
    },
    transfer: (request: TransferRequest) =>
      call("Calls/connect.json", {
        CallSid: request.providerCallId,
        To: request.toNumber,
        CallerId: process.env["EXOTEL_CALLER_ID"] ?? "",
      }),
    hangup: (providerCallId: string) =>
      call("Calls/hangup.json", { CallSid: providerCallId }),
  };
}

function str(value: unknown) {
  return value == null || value === "" ? null : String(value);
}
