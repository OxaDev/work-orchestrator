import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/** "/work-orchestrator" | "work-orchestrator/" | "" -> "/work-orchestrator/" | "/" (ADR-0011). */
export function normalizeBase(raw: string | undefined): string {
  const trimmed = (raw ?? "/work-orchestrator").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

export default defineConfig(({ mode }) => {
  // BASE_PATH comes from the Docker build arg, else from the repository-level .env.
  const rootEnv = loadEnv(mode, "..", "");
  const base = normalizeBase(process.env.BASE_PATH ?? rootEnv.BASE_PATH);

  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Mirror the production nginx: strip the base path, forward /api to the backend.
        [`${base}api`]: {
          target: "http://127.0.0.1:8000",
          rewrite: (path: string) => path.slice(base.length - 1),
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/main.tsx", "src/test/**", "src/api/schema.d.ts", "src/**/*.test.{ts,tsx}"],
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  };
});
