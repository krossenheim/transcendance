import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@app/shared': path.resolve(__dirname, '../../shared/src'),
    },
  },
  root: "./",
  build: {
    outDir: "dist",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ["@babylonjs/core", "earcut"],
        },
      },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  server: {
    fs: {
      strict: true,
      allow: ['..'],
    },
  },
  base: "/static/react_dist/",
});
