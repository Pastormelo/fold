import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
      The design prototype. `design/` is the authority for what screens should look
      like — see DESIGN-PARITY.md — but it is a design tool's own export, not source
      this project writes or maintains, and linting it says nothing useful about
      Fold. It arrived with 3 errors and 35 warnings on its runtime files.

      Ignored rather than fixed, deliberately: editing it would make it stop matching
      what Melo designed, which is the one job it has.
    */
    "design/**",
  ]),
]);

export default eslintConfig;
