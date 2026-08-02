import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Proxy /api and telephony routes to the FastAPI backend during development.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5273,
    proxy: {
      "/api": { target: "http://localhost:8100", changeOrigin: true, ws: true },
      // Regex (not a bare "/call" prefix): that would also swallow the SPA's own
      // /calls route and serve it a backend 404 on a full page load.
      "^/call/": { target: "http://localhost:8100", changeOrigin: true },
      "^/media/": { target: "http://localhost:8100", changeOrigin: true, ws: true },
      "^/exotel/": { target: "http://localhost:8100", changeOrigin: true, ws: true },
    },
  },
});
