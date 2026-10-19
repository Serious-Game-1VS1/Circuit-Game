import { defineConfig } from "vite";

// El motor vive en ../spike/src/engine; Vite debe poder servir esa carpeta en dev.
export default defineConfig({
  server: { fs: { allow: [".."] } },
});
