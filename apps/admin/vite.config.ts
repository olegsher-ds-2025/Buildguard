import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Workspace packages resolve via a symlink outside node_modules; without
  // this, Rollup's commonjs plugin resolves through it to the real path and
  // no longer recognizes it as a node_modules dependency, so it stops
  // detecting named exports from our CJS-built shared packages.
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5174,
  },
});
