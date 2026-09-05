import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type BusinessRole = Database["public"]["Enums"]["business_role"];

export interface BusinessContext {
  business: Business;
  role: BusinessRole;
  userId: string;
  email: string | null;
}

/**
 * Resolves the signed-in user's business membership. The business id is always
 * derived from the session — never from the browser URL or user input.
 */
export function useBusiness() {
  return useQuery<BusinessContext | null>({
    queryKey: ["business-context"],
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;

      const { data, error } = await supabase
        .from("business_users")
        .select("role, business_id, businesses(*)")
        .eq("auth_user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.businesses) return null;

      return {
        business: data.businesses as Business,
        role: data.role,
        userId: user.id,
        email: user.email ?? null,
      };
    },
  });
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
};

export function formatMoney(value: number | null | undefined, currency = "INR") {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
