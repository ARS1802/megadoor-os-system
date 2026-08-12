import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["testes/firestore/**/*.test.ts"],
    fileParallelism: false,
  },
});
