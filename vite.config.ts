import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
    // Rust produces locked .exe files here during a Tauri build; they are not frontend source files.
    watch: { ignored: ["**/src-tauri/target/**"] },
  },
});
