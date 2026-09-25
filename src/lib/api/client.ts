/**
 * HTTP client for the Spring Boot API (services/api).
 *
 * Requests are deliberately **same-origin**: in dev the Vite proxy forwards
 * the matching /api/* prefixes to :8080 (see vite.config.ts), and in production
 * a reverse proxy must do the same. That keeps the `trellient_session` cookie
 * first-party, so the browser attaches it automatically, CORS never applies,
 * and we never need `allowCredentials` on the API (SECURITY.md F-07).
 *
 * Client-side only. There is no origin for a relative URL to resolve against
 * during SSR, and react-query does not fetch on the server without an explicit
 * prefetch — so page queries using this run in the browser.
 */

/** A non-2xx response. `message` is the API's own text where it sent one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";
/** Methods Spring's CsrfFilter lets through unchecked. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

function readCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Spring sets the XSRF-TOKEN cookie on any request it handles. On a cold load
 * the app always reads before it writes, so the cookie is normally there — but
 * a mutation as the very first call would have nothing to send, so prime it
 * with one cheap GET rather than let the write fail.
 *
 * /auth/me is the endpoint used because it is permitAll: signing in is itself a
 * write, so priming must work with no session. (Any endpoint would set the
 * cookie — the CSRF filter runs before authorization — but the others answer
 * 403 while signed out, which would put a guaranteed error in the log on every
 * cold write.)
 */
async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfToken();
  if (existing) return existing;
  await fetch("/api/auth/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  }).catch(() => undefined);
  return readCsrfToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  // Cookie-to-header: echo the token Spring put in the readable XSRF-TOKEN
  // cookie. Safe methods are exempt, so reads cost no extra round trip.
  if (!SAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) headers[CSRF_HEADER] = token;
  }

  const response = await fetch(path, {
    ...init,
    method,
    credentials: "same-origin",
    headers,
  });

  if (!response.ok) {
    // ApiExceptionHandler returns {"error": "..."}; fall back to the status.
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Not JSON — keep the status-based message.
    }
    throw new ApiError(message, response.status);
  }

  // 204 is how the API says "nothing here" (e.g. a user with no workspace).
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function withQuery(path: string, params?: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const suffix = query.toString();
  return `/api${path}${suffix ? `?${suffix}` : ""}`;
}

/** GET /api{path}, with undefined query params dropped. */
export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return request<T>(withQuery(path, params));
}

/** POST /api{path} with a JSON body. Carries the CSRF header. */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(withQuery(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/** PATCH /api{path} with a JSON body. Carries the CSRF header. */
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(withQuery(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/** DELETE /api{path}. Carries the CSRF header. */
export function apiDelete<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return request<T>(withQuery(path, params), { method: "DELETE" });
}
