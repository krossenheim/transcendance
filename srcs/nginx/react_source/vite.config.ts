import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "./",  // points to the current folder containing index.html
  build: {
    outDir: "dist", // relative to root
  },
  server: {
    port: 3333,
  },
});
