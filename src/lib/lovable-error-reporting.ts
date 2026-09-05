// Stub for local / self-hosted development.
// The Lovable editor error-reporting hooks are not available outside the platform.
export function reportLovableError(error: unknown, _context: Record<string, unknown> = {}) {
  console.error("[reportLovableError]", error);
}
