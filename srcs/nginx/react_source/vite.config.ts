import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "./",
  build: {
    outDir: "dist",
    minify: false,
    sourcemap: true,
  },
  define: {
    // force React to use development mode
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
  server: {
    fs: {
      strict: true,
    },
  },
  base: "/static/react_dist/",
});
