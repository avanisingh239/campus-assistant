import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json's compilerOptions.jsx is "preserve" (Next.js's own
  // SWC/Babel pipeline handles the real transform) — Vite's esbuild
  // pipeline needs to be told explicitly to use the automatic JSX runtime,
  // otherwise it falls back to the classic transform and every .tsx test
  // file would need to import React itself just to use JSX.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./*" path alias, which every non-
    // relative import in app/**/lib/** relies on (e.g. card.tsx's
    // "@/lib/dashboard/category-meta") — Vite doesn't read tsconfig paths
    // on its own, so component tests need this to resolve at all.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Default environment is "node" (fast, matches every existing pure-
    // logic test) — app/student/dashboard/card.test.tsx opts into "happy-dom"
    // per-file via a `@vitest-environment` docblock instead of switching
    // this globally, since it's the only test that needs a real DOM.
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
});
