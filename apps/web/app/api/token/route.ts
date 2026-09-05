import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingConfigError, TokenManager } from "@/lib/token-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    roomName: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    identity: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  })
  .strict();

export async function POST(request: Request) {
  let parsedBody: unknown = {};
  try {
    const text = await request.text();
    parsedBody = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const credentials = await TokenManager.issue(parsed.data);
    console.log(
      JSON.stringify({
        event: "session.token_issued",
        room: credentials.roomName,
        identity: credentials.identity,
      }),
    );
    return NextResponse.json(credentials, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error(JSON.stringify({ event: "session.config_invalid", missing: error.missing }));
      return NextResponse.json(
        { error: "Voice service is not configured yet." },
        { status: 503 },
      );
    }
    console.error(JSON.stringify({ event: "session.token_failed" }));
    return NextResponse.json({ error: "Could not create session" }, { status: 500 });
  }
}
