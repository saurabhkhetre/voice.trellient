import { createHash, randomBytes } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { getPool } from "@/lib/db/pg.server";

// Server-only. The browser holds a random token in an HttpOnly cookie; the
// database stores only its SHA-256, so a leaked sessions table can't be replayed.

export const SESSION_COOKIE = "trellient_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Starts a session for the user and sets the session cookie on the response. */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await getPool().query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3::int))`,
    [userId, hashToken(token), SESSION_DAYS],
  );
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** The signed-in user for this request, or null when there's no valid session. */
export async function lookupSession(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const { rows } = await getPool().query<SessionUser>(
    `SELECT u.id, u.email
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

/** Ends the current session (if any) and clears the cookie. */
export async function endSession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await getPool().query(`DELETE FROM user_sessions WHERE token_hash = $1`, [hashToken(token)]);
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}
