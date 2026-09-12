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
      "^/api/(stats|business|voice)(/|$)": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
