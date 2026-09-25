import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // Use generator-only (no code-splitter) to avoid "Duplicate declaration hot" errors.
    // TanStack Start's plugin handles SSR entry and server functions.
    tanstackRouterGenerator({ target: "react" }),
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    // "localhost" can resolve to IPv6 only on some machines; pin IPv4 so the
    // dev URL answers the same way everywhere. Browsers fall back to it.
    host: "127.0.0.1",
    proxy: {
      // Only the Spring Boot API's own paths. Everything else under /api —
      // notably /api/public/telephony/* — is served by this app.
      //
      // Plain prefixes, not a regex. Vite tests a regex key against the path
      // *and* query string, so "^/api/calls(/|$)" misses
      // /api/calls?businessId=... and it falls through to the app as a 404.
      // A prefix key uses startsWith, which has no such edge, and each page
      // migrated onto Spring adds exactly one line here.
      "/api/stats": { target: "http://localhost:8080", changeOrigin: true },
      "/api/business": { target: "http://localhost:8080", changeOrigin: true },
      "/api/voice": { target: "http://localhost:8080", changeOrigin: true },
      "/api/calls": { target: "http://localhost:8080", changeOrigin: true },
      "/api/records": { target: "http://localhost:8080", changeOrigin: true },
      "/api/alerts": { target: "http://localhost:8080", changeOrigin: true },
      "/api/phone-numbers": { target: "http://localhost:8080", changeOrigin: true },
      "/api/agents": { target: "http://localhost:8080", changeOrigin: true },
      "/api/auth": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
