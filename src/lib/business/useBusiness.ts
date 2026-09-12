import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getBusinessContext, type BusinessContextPayload } from "@/lib/business/business.functions";

export type { Business, BusinessRole } from "@/lib/business/business.functions";
export type BusinessContext = BusinessContextPayload;

/**
 * Resolves the signed-in user's business membership. The business id is always
 * derived from the session — never from the browser URL or user input.
 */
export function useBusiness() {
  const getContext = useServerFn(getBusinessContext);
  return useQuery<BusinessContext | null>({
    queryKey: ["business-context"],
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: () => getContext(),
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
