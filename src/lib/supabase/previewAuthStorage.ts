// Simplified for local / self-hosted development.
// The original Lovable preview broker is not needed outside the Lovable platform.
export function brokeredPreviewStorage() {
  if (typeof window === "undefined") return undefined;
  return localStorage;
}
