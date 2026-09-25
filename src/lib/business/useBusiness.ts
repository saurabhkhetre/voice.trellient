import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api/client";
import { type BusinessContextPayload } from "@/lib/api/contracts";

export type { Business, BusinessRole } from "@/lib/api/contracts";
export type BusinessContext = BusinessContextPayload;

/**
 * Resolves the signed-in user's business membership. The business id is always
 * derived from the session — never from the browser URL or user input.
 */
export function useBusiness() {
  return useQuery<BusinessContext | null>({
    queryKey: ["business-context"],
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    // Spring: GET /api/business/context. It answers 204 for a user with no
    // workspace, which the client surfaces as undefined — getBusinessContext()
    // returned null there, and the dashboard layout branches on !data to show
    // the "No workspace yet" state, so the null must be preserved.
    queryFn: async () => (await apiGet<BusinessContext | null>("/business/context")) ?? null,
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
