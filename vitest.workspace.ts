import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/geo",
  "packages/utils",
  "packages/constants",
  "apps/web",
]);
