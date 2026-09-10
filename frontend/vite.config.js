import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend API (FastAPI) runs on :8002. In dev we proxy /api and the
// /live WebSocket from the Vite server so the frontend stays same-origin.
// Backend CORS is enabled too, for when the frontend calls it cross-origin
// directly (set VITE_API_BASE_URL to the API origin to do that).
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          gsap: ["gsap", "@gsap/react"],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8002",
        changeOrigin: true,
      },
      "/live": {
        target: "ws://localhost:8002",
        ws: true,
      },
    },
  },
});
