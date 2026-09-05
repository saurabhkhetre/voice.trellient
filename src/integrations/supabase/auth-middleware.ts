/**
 * Server-side Supabase auth middleware stub.
 * Real implementation will validate the session cookie and attach the user to the request context.
 */
export function requireSupabaseAuth() {
  return async ({ next }: { next: () => Promise<any> }) => {
    // TODO: Validate session from cookie/header and attach user to context
    return next();
  };
}
