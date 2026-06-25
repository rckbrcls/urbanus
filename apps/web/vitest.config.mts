import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["features/**/*.test.ts", "app/**/*.test.ts", "lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
    },
  },
});
