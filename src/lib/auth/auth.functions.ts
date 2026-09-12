import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, isUniqueViolation } from "@/lib/db/pg.server";
import { parseOrThrow } from "@/lib/validation";

export interface CurrentUser {
  id: string;
  email: string;
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

const signUpInput = z.object({
  email,
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
});

const signInInput = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(200),
});

let dummyHash: Promise<string> | null = null;

/** Creates an account and signs it in. */
export const signUp = createServerFn({ method: "POST" })
  .validator((raw: { email: string; password: string }) => parseOrThrow(signUpInput, raw))
  .handler(async ({ data }): Promise<CurrentUser> => {
    const { hashPassword } = await import("@/lib/auth/password.server");
    const { startSession } = await import("@/lib/auth/session.server");

    let userId: string;
    try {
      const { rows } = await getPool().query<{ id: string }>(
        `INSERT INTO users (email, password_hash, last_sign_in_at) VALUES ($1, $2, now()) RETURNING id`,
        [data.email, await hashPassword(data.password)],
      );
      userId = rows[0]!.id;
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error("This email is already registered. Sign in instead.");
      throw err;
    }

    await startSession(userId);
    return { id: userId, email: data.email };
  });

/** Signs in with email and password. */
export const signIn = createServerFn({ method: "POST" })
  .validator((raw: { email: string; password: string }) => parseOrThrow(signInInput, raw))
  .handler(async ({ data }): Promise<CurrentUser> => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/password.server");
    const { startSession } = await import("@/lib/auth/session.server");

    const pool = getPool();
    const { rows } = await pool.query<{ id: string; email: string; password_hash: string }>(
      `SELECT id, email, password_hash FROM users WHERE lower(email) = $1`,
      [data.email],
    );
    const user = rows[0];

    // Check a throwaway hash when the email is unknown, so the response takes
    // as long as a wrong password and doesn't reveal which accounts exist.
    dummyHash ??= hashPassword("no-account-with-this-email");
    const valid = await verifyPassword(data.password, user?.password_hash ?? (await dummyHash));
    if (!user || !valid) throw new Error("Wrong email or password.");

    await pool.query(`UPDATE users SET last_sign_in_at = now() WHERE id = $1`, [user.id]);
    await startSession(user.id);
    return { id: user.id, email: user.email };
  });

/** Ends the current session. */
export const signOut = createServerFn({ method: "POST" }).handler(async (): Promise<void> => {
  const { endSession } = await import("@/lib/auth/session.server");
  await endSession();
});

/** The signed-in user, or null. Never throws for a missing session. */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(async (): Promise<CurrentUser | null> => {
  const { lookupSession } = await import("@/lib/auth/session.server");
  return lookupSession();
});
