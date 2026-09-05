import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * The context shape provided by requireSupabaseAuth middleware.
 * TanStack Start beta does not always propagate these types correctly
 * through the .middleware() chain, so we use this as a cast target.
 */
export type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
};
